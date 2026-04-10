import { attachTeacherSessionCookie, createTeacherSessionToken, isSessionSigningConfigured } from '@/lib/auth/session';
import { attachSupabaseSessionCookies, signInWithPassword } from '@/lib/auth/supabase-auth';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { logServerEvent } from '@/lib/observability';
import {
  findTeacherAuthIdentities,
  findTeacherAuthIdentity,
  getSchoolByCode,
} from '@/lib/platform-rbac-db';
import { recordAuditEvent } from '@/lib/security/audit';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { authenticateTeacher, authenticateTeacherByIdentifier, getTeacherSessionById } from '@/lib/teacher-admin-db';

const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000;

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
  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 12 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }

  const ipLimit = await checkRateLimit({
    key: buildRateLimitKey('auth:teacher:ip', [ip]),
    windowSeconds: 60,
    maxRequests: 15,
    blockSeconds: 180,
  });
  if (!ipLimit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many login attempts. Please wait before retrying.',
      status: 429,
      hint: `Retry after ${ipLimit.retryAfterSeconds}s`,
    });
  }

  const body = bodyResult.value;
  const schoolCode = typeof body.schoolCode === 'string'
    ? body.schoolCode.trim()
    : (process.env.DEFAULT_SCHOOL_CODE || '').trim();
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : identifier;
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  const password = typeof body.password === 'string' ? body.password.trim() : pin;
  if (!phone || !password) {
    return errorJson({
      requestId,
      errorCode: 'missing-teacher-credentials',
      message: 'identifier and password are required.',
      status: 400,
    });
  }

  const identityLimit = await checkRateLimit({
    key: buildRateLimitKey('auth:teacher:identity', [schoolCode || 'global', phone]),
    windowSeconds: 60,
    maxRequests: 8,
    blockSeconds: 300,
  });
  if (!identityLimit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many login attempts for this teacher identity.',
      status: 429,
      hint: `Retry after ${identityLimit.retryAfterSeconds}s`,
    });
  }

  if (schoolCode) {
    const school = await getSchoolByCode(schoolCode);
    if (!school || school.status !== 'active') {
      return errorJson({
        requestId,
        errorCode: 'school-not-active',
        message: 'School code not found or inactive.',
        status: 404,
      });
    }
    const authIdentity = await findTeacherAuthIdentity({
      schoolCode,
      identifier: phone,
    });
    if (!authIdentity?.authEmail) {
      const legacyResolved = await authenticateTeacherByIdentifier(phone, pin || password, school.id);
      if (legacyResolved.ambiguous) {
        return errorJson({
          requestId,
          errorCode: 'teacher-identity-ambiguous',
          message: 'Multiple teacher profiles matched this identifier. Ask admin to set unique phone/staff code.',
          status: 409,
        });
      }
      if (!legacyResolved.session) {
        await recordAuditEvent({
          requestId,
          endpoint: '/api/teacher/session/login',
          action: 'teacher-login-failed',
          statusCode: 401,
          actorRole: 'system',
          schoolId: school.id,
          metadata: { schoolCode, identifier: phone, mode: 'legacy-scoped' },
        });
        return errorJson({
          requestId,
          errorCode: 'invalid-teacher-credentials',
          message: 'Invalid teacher credentials for this school.',
          status: 401,
        });
      }
      const response = dataJson({
        requestId,
        data: {
          teacher: legacyResolved.session.teacher,
          effectiveScopes: legacyResolved.session.effectiveScopes,
          role: 'teacher',
          auth: 'legacy-scoped',
          schoolId: school.id,
          schoolCode,
          availableRoles: ['teacher'],
          sessionExpiry: Date.now() + SESSION_EXPIRY_MS,
        },
      });
      attachTeacherSessionCookie(response, createTeacherSessionToken(legacyResolved.session.teacher.id));
      return response;
    }
    try {
      const authSession = await signInWithPassword({
        email: authIdentity.authEmail,
        password,
      });
      const teacherSession = await getTeacherSessionById(authIdentity.teacherId, authIdentity.schoolId);
      if (!teacherSession) {
        return errorJson({
          requestId,
          errorCode: 'teacher-profile-inactive',
          message: 'Teacher profile is inactive or missing.',
          status: 403,
        });
      }
      const response = dataJson({
        requestId,
        data: {
          teacher: teacherSession.teacher,
          effectiveScopes: teacherSession.effectiveScopes,
          role: 'teacher',
          auth: 'supabase',
          schoolId: authIdentity.schoolId,
          schoolCode,
          availableRoles: ['teacher'],
          sessionExpiry: Date.now() + SESSION_EXPIRY_MS,
        },
      });
      attachSupabaseSessionCookies(response, authSession, 'teacher');
      attachTeacherSessionCookie(response, createTeacherSessionToken(teacherSession.teacher.id));
      await recordAuditEvent({
        requestId,
        endpoint: '/api/teacher/session/login',
        action: 'teacher-login-success',
        statusCode: 200,
        actorRole: 'teacher',
        actorAuthUserId: authSession.user?.id,
        schoolId: authIdentity.schoolId,
      });
      logServerEvent({
        event: 'teacher-login-success',
        requestId,
        endpoint: '/api/teacher/session/login',
        role: 'teacher',
        schoolId: authIdentity.schoolId,
        statusCode: 200,
      });
      return response;
    } catch {
      return errorJson({
        requestId,
        errorCode: 'invalid-teacher-credentials',
        message: 'Invalid teacher credentials.',
        status: 401,
      });
    }
  }

  const authCandidates = await findTeacherAuthIdentities({ identifier: phone });
  if (authCandidates.length === 1) {
    try {
      const authSession = await signInWithPassword({
        email: authCandidates[0].authEmail,
        password,
      });
      const teacherSession = await getTeacherSessionById(authCandidates[0].teacherId, authCandidates[0].schoolId);
      if (teacherSession) {
        const response = dataJson({
          requestId,
          data: {
            teacher: teacherSession.teacher,
            effectiveScopes: teacherSession.effectiveScopes,
            role: 'teacher',
            auth: 'supabase',
            schoolId: authCandidates[0].schoolId,
            availableRoles: ['teacher'],
            sessionExpiry: Date.now() + SESSION_EXPIRY_MS,
          },
        });
        attachSupabaseSessionCookies(response, authSession, 'teacher');
        attachTeacherSessionCookie(response, createTeacherSessionToken(teacherSession.teacher.id));
        return response;
      }
    } catch {
      // fall through to legacy auth
    }
  }
  if (authCandidates.length > 1) {
    return errorJson({
      requestId,
      errorCode: 'teacher-identity-ambiguous',
      message: 'Multiple schools matched this teacher identifier. Enter school code in admin-managed login flow.',
      status: 409,
    });
  }

  const legacyResolved = await authenticateTeacherByIdentifier(phone, pin || password);
  if (legacyResolved.ambiguous) {
    return errorJson({
      requestId,
      errorCode: 'teacher-identity-ambiguous',
      message: 'Multiple teacher profiles matched this identifier. Please contact admin.',
      status: 409,
    });
  }
  if (!legacyResolved.session) {
    const phoneSession = await authenticateTeacher(phone, pin || password);
    if (!phoneSession) {
      return errorJson({
        requestId,
        errorCode: 'invalid-teacher-credentials',
        message: 'Invalid teacher credentials.',
        status: 401,
      });
    }
    const response = dataJson({
      requestId,
      data: {
        teacher: phoneSession.teacher,
        effectiveScopes: phoneSession.effectiveScopes,
        role: 'teacher',
        auth: 'legacy',
        availableRoles: ['teacher'],
        sessionExpiry: Date.now() + SESSION_EXPIRY_MS,
      },
    });
    attachTeacherSessionCookie(response, createTeacherSessionToken(phoneSession.teacher.id));
    return response;
  }

  const response = dataJson({
    requestId,
    data: {
      teacher: legacyResolved.session.teacher,
      effectiveScopes: legacyResolved.session.effectiveScopes,
      role: 'teacher',
      auth: 'legacy',
      availableRoles: ['teacher'],
      sessionExpiry: Date.now() + SESSION_EXPIRY_MS,
    },
  });
  attachTeacherSessionCookie(response, createTeacherSessionToken(legacyResolved.session.teacher.id));
  return response;
}
