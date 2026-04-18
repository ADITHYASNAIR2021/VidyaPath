import {
  attachActiveRoleCookie,
  attachStudentSessionCookie,
  clearAllRoleSessionCookies,
  createStudentSessionToken,
  isSessionSigningConfigured,
} from '@/lib/auth/session';
import {
  attachSupabaseSessionCookies,
  clearSupabaseSessionCookies,
  signInWithPassword,
} from '@/lib/auth/supabase-auth';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { studentLoginSchema } from '@/lib/schemas/auth';
import {
  findStudentAuthIdentitiesByRollNo,
  findStudentAuthIdentity,
  resolveRoleContextByAuthUserId,
} from '@/lib/platform-rbac-db';
import { logServerEvent } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/security/audit';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { recordStudentActivity } from '@/lib/study-enhancements-db';
import {
  getStudentById,
  getStudentByRollCode,
} from '@/lib/teacher-admin-db';

const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000;

function buildSessionPayload(student: {
  id: string;
  name: string;
  rollCode: string;
  classLevel: 10 | 12;
  stream?: 'pcm' | 'pcb' | 'commerce';
  section?: string;
  schoolId?: string;
  batch?: string;
  mustChangePassword?: boolean;
}) {
  return {
    studentId: student.id,
    studentName: student.name,
    rollCode: student.rollCode,
    classLevel: student.classLevel,
    stream: student.stream,
    section: student.section,
    schoolId: student.schoolId,
    batch: student.batch,
    mustChangePassword: student.mustChangePassword === true,
  };
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  if (!isSessionSigningConfigured()) {
    return errorJson({
      requestId,
      errorCode: 'session-signing-not-configured',
      message: 'SESSION_SIGNING_SECRET is required for login sessions.',
      status: 503,
    });
  }
  const ip = getClientIp(req);
  const bodyResult = await parseAndValidateJsonBody(req, 16 * 1024, studentLoginSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }

  const ipLimit = await checkRateLimit({
    key: buildRateLimitKey('auth:student:ip', [ip]),
    windowSeconds: 60,
    maxRequests: 20,
    blockSeconds: 180,
  });
  if (!ipLimit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many login attempts. Please wait before trying again.',
      status: 429,
      hint: `Retry after ${ipLimit.retryAfterSeconds}s`,
    });
  }

  const body = bodyResult.value;
  const schoolCode = typeof body.schoolCode === 'string'
    ? body.schoolCode.trim()
    : (process.env.DEFAULT_SCHOOL_CODE || '').trim();
  const classLevel = Number(body.classLevel);
  const section = typeof body.section === 'string' ? body.section.trim() : '';
  const batch = typeof body.batch === 'string' ? body.batch.trim() : '';
  const rollInput = typeof body.roll === 'string' ? body.roll.trim() : '';
  const rollNoFromInput = rollInput && !/[A-Z_-]/i.test(rollInput) ? rollInput : '';
  const rollCodeFromInput = rollInput && /[A-Z_-]/i.test(rollInput) ? rollInput : '';
  const rollNo = typeof body.rollNo === 'string' ? body.rollNo.trim().toUpperCase() : '';
  const rollCode =
    typeof body.rollCode === 'string'
      ? body.rollCode.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 80)
      : '';
  const password = typeof body.password === 'string' ? body.password.trim().slice(0, 128) : '';
  const secret = password;
  const normalizedRollNo = (rollNo || rollNoFromInput).trim().toUpperCase();
  const normalizedRollCode = (rollCode || rollCodeFromInput).trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 80);
  const identityToken = normalizedRollNo || normalizedRollCode || 'unknown';

  const identityLimit = await checkRateLimit({
    key: buildRateLimitKey('auth:student:identity', [schoolCode || 'global', identityToken]),
    windowSeconds: 60,
    maxRequests: 8,
    blockSeconds: 300,
  });
  if (!identityLimit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many login attempts for this student identity.',
      status: 429,
      hint: `Retry after ${identityLimit.retryAfterSeconds}s`,
    });
  }

  if ((normalizedRollNo || normalizedRollCode) && !secret) {
    return errorJson({
      requestId,
      errorCode: 'missing-student-secret',
      message: 'Password is required for student login.',
      status: 400,
    });
  }

  const useCompositeLogin =
    !!schoolCode &&
    (classLevel === 10 || classLevel === 12) &&
    !!normalizedRollNo;

  if (rollInput.includes('@')) {
    return errorJson({
      requestId,
      errorCode: 'invalid-student-identifier-format',
      message: 'Student login accepts only Student ID and password.',
      status: 400,
    });
  }

  const buildSuccessResponse = async (data: {
    studentId: string;
    studentName: string;
    rollCode: string;
    classLevel: 10 | 12;
    stream?: 'pcm' | 'pcb' | 'commerce';
    section?: string;
    schoolId?: string;
    batch?: string;
    mustChangePassword?: boolean;
    auth: 'supabase' | 'legacy-roll' | 'legacy';
  }) => {
    await recordStudentActivity(data.studentId, new Date()).catch(() => undefined);
    const response = dataJson({
      requestId,
      data: {
        ...data,
        role: 'student',
        schoolCode: schoolCode || undefined,
        schoolId: data.schoolId,
        mustChangePassword: data.mustChangePassword === true,
        availableRoles: ['student'],
        sessionExpiry: Date.now() + SESSION_EXPIRY_MS,
      },
    });
    clearSupabaseSessionCookies(response);
    clearAllRoleSessionCookies(response);
    attachActiveRoleCookie(response, 'student');
    attachStudentSessionCookie(
      response,
      createStudentSessionToken({
        studentId: data.studentId,
        studentName: data.studentName,
        rollCode: data.rollCode,
        classLevel: data.classLevel,
        stream: data.stream,
        section: data.section,
        schoolId: data.schoolId,
        schoolCode: schoolCode || undefined,
        batch: data.batch,
        mustChangePassword: data.mustChangePassword === true,
      })
    );
    return response;
  };

  if (useCompositeLogin) {
    const identity = await findStudentAuthIdentity({
      schoolCode,
      classLevel: classLevel as 10 | 12,
      section: section || undefined,
      batch: batch || undefined,
      rollNo: normalizedRollNo,
    });
    if (identity?.authEmail) {
      try {
        const authSession = await signInWithPassword({
          email: identity.authEmail,
          password: secret,
        });
        const student = await getStudentById(identity.studentId);
        if (!student) {
          return errorJson({
            requestId,
            errorCode: 'student-profile-not-found',
            message: 'Student profile not found.',
            status: 404,
          });
        }
        const response = await buildSuccessResponse({
          ...buildSessionPayload(student),
          auth: 'supabase',
        });
        attachSupabaseSessionCookies(response, authSession, 'student');
        await recordAuditEvent({
          requestId,
          endpoint: '/api/student/session/login',
          action: 'student-login-success',
          statusCode: 200,
          actorRole: 'student',
          actorAuthUserId: authSession.user?.id,
          schoolId: student.schoolId,
        });
        logServerEvent({
          event: 'student-login-success',
          requestId,
          endpoint: '/api/student/session/login',
          role: 'student',
          schoolId: student.schoolId,
          statusCode: 200,
        });
        return response;
      } catch {
        await recordAuditEvent({
          requestId,
          endpoint: '/api/student/session/login',
          action: 'student-login-failed',
          statusCode: 401,
          actorRole: 'system',
          metadata: { schoolCode, rollNo: normalizedRollNo, mode: 'supabase-composite' },
        });
        return errorJson({
          requestId,
          errorCode: 'invalid-student-credentials',
          message: 'Invalid student credentials.',
          status: 401,
        });
      }
    }
    return errorJson({
      requestId,
      errorCode: 'student-password-login-not-provisioned',
      message: 'Student password login is not provisioned for this roster identity. Ask admin to re-import roster with credentials.',
      status: 403,
    });
  }

  if (normalizedRollNo) {
    const identityMatches = await findStudentAuthIdentitiesByRollNo({
      rollNo: normalizedRollNo,
      schoolCode: schoolCode || undefined,
      classLevel: classLevel === 10 || classLevel === 12 ? (classLevel as 10 | 12) : undefined,
      section: section || undefined,
      batch: batch || undefined,
    });
    if (identityMatches.length > 1) {
      return errorJson({
        requestId,
        errorCode: 'student-identity-ambiguous',
        message: 'Roll number matched multiple students. Ask admin to add unique roster mapping.',
        status: 409,
      });
    }
    if (identityMatches.length === 1) {
      try {
        const authSession = await signInWithPassword({
          email: identityMatches[0].authEmail,
          password: secret,
        });
        const student = await getStudentById(identityMatches[0].studentId);
        if (!student) {
          return errorJson({
            requestId,
            errorCode: 'student-profile-not-found',
            message: 'Student profile not found.',
            status: 404,
          });
        }
        const response = await buildSuccessResponse({
          ...buildSessionPayload(student),
          auth: 'supabase',
        });
        attachSupabaseSessionCookies(response, authSession, 'student');
        await recordAuditEvent({
          requestId,
          endpoint: '/api/student/session/login',
          action: 'student-login-success',
          statusCode: 200,
          actorRole: 'student',
          actorAuthUserId: authSession.user?.id,
          schoolId: student.schoolId,
        });
        return response;
      } catch {
        return errorJson({
          requestId,
          errorCode: 'invalid-student-credentials',
          message: 'Invalid student credentials.',
          status: 401,
        });
      }
    }
    return errorJson({
      requestId,
      errorCode: 'student-password-login-not-provisioned',
      message: 'Student password login is not provisioned for this roll number. Ask admin to re-import roster with credentials.',
      status: 403,
    });
  }

  if (!normalizedRollCode) {
    return errorJson({
      requestId,
      errorCode: 'missing-student-identifier',
      message: 'Required: student ID and password.',
      status: 400,
    });
  }

  const authCandidate = await getStudentByRollCode(normalizedRollCode);
  if (authCandidate?.auth_email) {
    try {
      const authSession = await signInWithPassword({
        email: authCandidate.auth_email,
        password: secret,
      });
      const roleContext = authSession.user?.id
        ? await resolveRoleContextByAuthUserId(authSession.user.id, 'student')
        : null;
      if (roleContext && roleContext.role !== 'student') {
        return errorJson({
          requestId,
          errorCode: 'student-role-required',
          message: 'Authenticated account does not have student access.',
          status: 403,
        });
      }
      if (schoolCode && roleContext?.schoolCode && schoolCode.toUpperCase() !== roleContext.schoolCode.toUpperCase()) {
        return errorJson({
          requestId,
          errorCode: 'student-school-mismatch',
          message: 'Provided school code does not match this student account.',
          status: 403,
        });
      }
      const student = await getStudentById(authCandidate.id);
      if (!student) {
        return errorJson({
          requestId,
          errorCode: 'student-profile-not-found',
          message: 'Student profile not found.',
          status: 404,
        });
      }
      await recordStudentActivity(student.id, new Date()).catch(() => undefined);
      const resolvedSchoolCode = roleContext?.schoolCode || schoolCode || undefined;
      const resolvedSchoolId = roleContext?.schoolId || student.schoolId;
      const response = dataJson({
        requestId,
        data: {
          ...buildSessionPayload(student),
          role: 'student',
          schoolCode: resolvedSchoolCode,
          schoolId: resolvedSchoolId,
          auth: 'supabase-roll-code',
          mustChangePassword: student.mustChangePassword === true,
          availableRoles: roleContext?.availableRoles || ['student'],
          sessionExpiry: Date.now() + SESSION_EXPIRY_MS,
        },
      });
      clearSupabaseSessionCookies(response);
      clearAllRoleSessionCookies(response);
      attachActiveRoleCookie(response, 'student');
      attachStudentSessionCookie(
        response,
        createStudentSessionToken({
          studentId: student.id,
          studentName: student.name,
          rollCode: student.rollCode,
          classLevel: student.classLevel,
          stream: student.stream,
          section: student.section,
          schoolId: resolvedSchoolId,
          schoolCode: resolvedSchoolCode,
          batch: student.batch,
          mustChangePassword: student.mustChangePassword === true,
        })
      );
      attachSupabaseSessionCookies(response, authSession, 'student');
      return response;
    } catch {
      return errorJson({
        requestId,
        errorCode: 'invalid-student-credentials',
        message: 'Invalid student credentials.',
        status: 401,
      });
    }
  }

  return errorJson({
    requestId,
    errorCode: 'student-password-login-not-provisioned',
    message: 'Student password login is not provisioned for this student ID. Ask admin to re-import roster with credentials.',
    status: 403,
  });
}
