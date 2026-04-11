import {
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
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import {
  findStudentAuthIdentitiesByRollNo,
  findStudentAuthIdentity,
} from '@/lib/platform-rbac-db';
import { logServerEvent } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/security/audit';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { recordStudentActivity } from '@/lib/study-enhancements-db';
import { authenticateStudent, authenticateStudentByRollNo, getStudentById } from '@/lib/teacher-admin-db';

const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000;

function buildSessionPayload(student: {
  id: string;
  name: string;
  rollCode: string;
  classLevel: 10 | 12;
  section?: string;
  schoolId?: string;
  batch?: string;
}) {
  return {
    studentId: student.id,
    studentName: student.name,
    rollCode: student.rollCode,
    classLevel: student.classLevel,
    section: student.section,
    schoolId: student.schoolId,
    batch: student.batch,
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
  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 16 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
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
      ? body.rollCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 80)
      : '';
  const pin = typeof body.pin === 'string' ? body.pin.trim().slice(0, 64) : '';
  const password = typeof body.password === 'string' ? body.password.trim().slice(0, 128) : (pin || '');
  const secret = password || pin;
  const normalizedRollNo = (rollNo || rollNoFromInput).trim().toUpperCase();
  const normalizedRollCode = (rollCode || rollCodeFromInput).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 80);
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
      message: 'Key/PIN is required for student login.',
      status: 400,
    });
  }

  const useCompositeLogin =
    !!schoolCode &&
    (classLevel === 10 || classLevel === 12) &&
    !!normalizedRollNo;

  const buildSuccessResponse = async (data: {
    studentId: string;
    studentName: string;
    rollCode: string;
    classLevel: 10 | 12;
    section?: string;
    schoolId?: string;
    batch?: string;
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
        availableRoles: ['student'],
        sessionExpiry: Date.now() + SESSION_EXPIRY_MS,
      },
    });
    clearSupabaseSessionCookies(response);
    clearAllRoleSessionCookies(response);
    attachStudentSessionCookie(
      response,
      createStudentSessionToken({
        studentId: data.studentId,
        studentName: data.studentName,
        rollCode: data.rollCode,
        classLevel: data.classLevel,
        section: data.section,
        schoolId: data.schoolId,
        schoolCode: schoolCode || undefined,
        batch: data.batch,
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
    const legacyByRoll = await authenticateStudentByRollNo({
      rollNo: normalizedRollNo,
      pin: secret,
      classLevel: classLevel as 10 | 12,
      section: section || undefined,
      batch: batch || undefined,
    });
    if (legacyByRoll.ambiguous) {
      return errorJson({
        requestId,
        errorCode: 'student-identity-ambiguous',
        message: 'Multiple students matched this roll number. Include section/batch or ask admin to resolve duplicates.',
        status: 409,
      });
    }
    if (legacyByRoll.session) {
      return await buildSuccessResponse({
        ...legacyByRoll.session,
        schoolId: undefined,
        auth: 'legacy-roll',
      });
    }
    return errorJson({
      requestId,
      errorCode: 'student-roster-not-found',
      message: 'Student roster identity not found for this school/class/section.',
      status: 404,
    });
  }

  if (normalizedRollNo) {
    const legacyByRoll = await authenticateStudentByRollNo({
      rollNo: normalizedRollNo,
      pin: secret,
      schoolId: undefined,
      classLevel: classLevel === 10 || classLevel === 12 ? (classLevel as 10 | 12) : undefined,
      section: section || undefined,
      batch: batch || undefined,
    });
    if (legacyByRoll.ambiguous) {
      return errorJson({
        requestId,
        errorCode: 'student-identity-ambiguous',
        message: 'Roll number matched multiple schools/sections. Ask admin to provide school code or resolve duplicates.',
        status: 409,
      });
    }
    if (legacyByRoll.session) {
      return await buildSuccessResponse({
        ...legacyByRoll.session,
        schoolId: undefined,
        auth: 'legacy-roll',
      });
    }

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
      errorCode: 'student-roll-not-found',
      message: 'Student roll number not found.',
      status: 404,
    });
  }

  if (!normalizedRollCode) {
    return errorJson({
      requestId,
      errorCode: 'missing-student-identifier',
      message: 'Required: roll number and key, or legacy rollCode and key.',
      status: 400,
    });
  }

  const session = await authenticateStudent(normalizedRollCode, secret || undefined);
  if (!session) {
    return errorJson({
      requestId,
      errorCode: 'invalid-student-credentials',
      message: 'Invalid roll code or PIN.',
      status: 401,
    });
  }

  return await buildSuccessResponse({
    ...session,
    schoolId: undefined,
    auth: 'legacy',
  });
}
