import {
  attachActiveRoleCookie,
  attachAdminSessionCookie,
  clearAllRoleSessionCookies,
  createAdminSessionToken,
  isSessionSigningConfigured,
} from '@/lib/auth/session';
import {
  attachSupabaseSessionCookies,
  signInWithPassword,
} from '@/lib/auth/supabase-auth';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { adminBootstrapSchema } from '@/lib/schemas/auth';
import { dataJson, errorJson, getClientIp, getRequestId, hasResolvedClientIp } from '@/lib/http/api-response';
import { logServerEvent } from '@/lib/observability';
import { findAdminAuthIdentities, resolveRoleContextByAuthUserId } from '@/lib/platform-rbac-db';
import { recordAuditEvent } from '@/lib/security/audit';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

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
  if (hasResolvedClientIp(ip)) {
    const ipRateLimit = await checkRateLimit({
      key: buildRateLimitKey('auth:admin', [ip]),
      windowSeconds: 60,
      maxRequests: 12,
      blockSeconds: 120,
    });
    if (!ipRateLimit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many login attempts. Try again later.',
        hint: `Retry after ${ipRateLimit.retryAfterSeconds}s`,
        status: 429,
      });
    }
  }

  const bodyResult = await parseAndValidateJsonBody(req, 12 * 1024, adminBootstrapSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }

  const body = bodyResult.value;
  const identifier = String(body.identifier || body.email || '').trim().toLowerCase();
  const password = String(body.password || '').trim();
  if (!identifier || !password) {
    return errorJson({
      requestId,
      errorCode: 'missing-admin-credentials',
      message: 'Principal phone, ID, or email and password are required.',
      status: 400,
    });
  }
  const schoolCode = typeof body.schoolCode === 'string' ? body.schoolCode.trim().toUpperCase() : '';

  const identityRateLimit = await checkRateLimit({
    key: buildRateLimitKey('auth:admin:identity', [identifier]),
    windowSeconds: 60,
    maxRequests: 8,
    blockSeconds: 180,
  });
  if (!identityRateLimit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many login attempts for this admin account.',
      status: 429,
      hint: `Retry after ${identityRateLimit.retryAfterSeconds}s`,
    });
  }

  try {
    const identities = identifier.includes('@')
      ? [{ authEmail: identifier }]
      : await findAdminAuthIdentities({ identifier, schoolCode: schoolCode || undefined });
    if (identities.length === 0) {
      throw new Error('Invalid admin credentials.');
    }
    if (identities.length > 1) {
      return errorJson({
        requestId,
        errorCode: 'admin-identity-ambiguous',
        message: 'This phone number belongs to more than one school. Add your school code and try again.',
        status: 409,
      });
    }
    const authSession = await signInWithPassword({
      email: identities[0].authEmail,
      password,
    });
    const roleContext = authSession.user?.id
      ? await resolveRoleContextByAuthUserId(authSession.user.id, 'admin')
      : null;
    if (!roleContext || (roleContext.role !== 'admin' && roleContext.role !== 'developer')) {
      return errorJson({
        requestId,
        errorCode: 'admin-role-required',
        message: 'Authenticated account does not have admin access.',
        status: 403,
      });
    }

    const response = dataJson({
      requestId,
      data: {
        role: roleContext.role,
        schoolId: roleContext.schoolId,
        schoolCode: roleContext.schoolCode,
        availableRoles: roleContext.availableRoles,
        mustChangePassword: roleContext.mustChangePassword === true,
        sessionExpiry: Date.now() + 8 * 60 * 60 * 1000,
      },
    });
    attachSupabaseSessionCookies(response, authSession, roleContext.role);
    clearAllRoleSessionCookies(response);
    attachAdminSessionCookie(response, createAdminSessionToken({
      profileId: roleContext.profileId,
      mustChangePassword: roleContext.mustChangePassword === true,
    }));
    attachActiveRoleCookie(response, roleContext.role === 'developer' ? 'developer' : 'admin');
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/session/bootstrap',
      action: 'admin-login-success',
      statusCode: 200,
      actorRole: roleContext.role,
      actorAuthUserId: roleContext.authUserId,
      schoolId: roleContext.schoolId,
    });
    return response;
  } catch {
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/session/bootstrap',
      action: 'admin-login-failed',
      statusCode: 401,
      actorRole: 'system',
      metadata: { identifier },
    });
    logServerEvent({
      level: 'warn',
      event: 'admin-login-failed',
      requestId,
      endpoint: '/api/admin/session/bootstrap',
      statusCode: 401,
      details: { identifier },
    });
    return errorJson({
      requestId,
      errorCode: 'invalid-admin-credentials',
      message: 'Invalid admin credentials.',
      status: 401,
    });
  }
}
