import {
  attachAdminSessionCookie,
  clearAllRoleSessionCookies,
  createAdminSessionToken,
  isSessionSigningConfigured,
} from '@/lib/auth/session';
import {
  attachSupabaseSessionCookies,
  clearSupabaseSessionCookies,
  signInWithPassword,
} from '@/lib/auth/supabase-auth';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { logServerEvent } from '@/lib/observability';
import { findAdminAuthIdentity, resolveRoleContextByAuthUserId } from '@/lib/platform-rbac-db';
import { recordAuditEvent } from '@/lib/security/audit';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

function isValidAdminKey(key: string): boolean {
  const configured = process.env.ADMIN_PORTAL_KEY?.trim() || process.env.TEACHER_PORTAL_KEY?.trim();
  if (!configured) return false;
  return key.trim() === configured;
}

function isBootstrapKeyFlowEnabled(): boolean {
  if (process.env.SINGLE_ENV_MODE === '1') return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.ADMIN_BOOTSTRAP_ENABLED === 'true';
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
  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey('auth:admin-bootstrap', [ip]),
    windowSeconds: 60,
    maxRequests: 12,
    blockSeconds: 120,
  });
  if (!rateLimit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many login attempts. Try again later.',
      hint: `Retry after ${rateLimit.retryAfterSeconds}s`,
      status: 429,
    });
  }

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 12 * 1024);
  const url = new URL(req.url);
  const keyFromQuery = url.searchParams.get('key')?.trim() ?? '';
  const body = bodyResult.ok ? bodyResult.value : null;
  const keyFromBody = typeof body?.key === 'string' ? body.key.trim() : '';
  const schoolCode = typeof body?.schoolCode === 'string'
    ? body.schoolCode.trim()
    : (process.env.DEFAULT_SCHOOL_CODE || '').trim();
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body?.password === 'string' ? body.password.trim() : '';
  const key = keyFromQuery || keyFromBody;

  if (schoolCode && identifier && password) {
    const scopedRateLimit = await checkRateLimit({
      key: buildRateLimitKey('auth:admin-composite', [ip, schoolCode, identifier]),
      windowSeconds: 60,
      maxRequests: 6,
      blockSeconds: 180,
    });
    if (!scopedRateLimit.allowed) {
      await recordAuditEvent({
        requestId,
        endpoint: '/api/admin/session/bootstrap',
        action: 'admin-login-throttled',
        statusCode: 429,
        actorRole: 'system',
        metadata: { schoolCode, identifier },
      });
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many login attempts for this account.',
        status: 429,
        hint: `Retry after ${scopedRateLimit.retryAfterSeconds}s`,
      });
    }

    const identity = await findAdminAuthIdentity({ schoolCode, identifier });
    if (!identity?.authEmail) {
      await recordAuditEvent({
        requestId,
        endpoint: '/api/admin/session/bootstrap',
        action: 'admin-login-not-found',
        statusCode: 404,
        actorRole: 'system',
        metadata: { schoolCode, identifier },
      });
      return errorJson({
        requestId,
        errorCode: 'admin-identity-not-found',
        message: 'School admin identity not found.',
        status: 404,
      });
    }

    try {
      const authSession = await signInWithPassword({
        email: identity.authEmail,
        password,
      });
      const roleContext = authSession.user?.id
        ? await resolveRoleContextByAuthUserId(authSession.user.id)
        : null;
      if (!roleContext || (roleContext.role !== 'admin' && roleContext.role !== 'developer')) {
        await recordAuditEvent({
          requestId,
          endpoint: '/api/admin/session/bootstrap',
          action: 'admin-login-role-denied',
          statusCode: 403,
          actorRole: 'system',
          metadata: { schoolCode, identifier },
        });
        return errorJson({
          requestId,
          errorCode: 'admin-role-required',
          message: 'Authenticated user does not have admin access.',
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
          sessionExpiry: Date.now() + 8 * 60 * 60 * 1000,
        },
      });
      attachSupabaseSessionCookies(response, authSession, roleContext.role);
      clearAllRoleSessionCookies(response);
      attachAdminSessionCookie(response, createAdminSessionToken());
      await recordAuditEvent({
        requestId,
        endpoint: '/api/admin/session/bootstrap',
        action: 'admin-login-success',
        statusCode: 200,
        actorRole: roleContext.role,
        actorAuthUserId: roleContext.authUserId,
        schoolId: roleContext.schoolId,
      });
      logServerEvent({
        event: 'admin-login-success',
        requestId,
        endpoint: '/api/admin/session/bootstrap',
        role: roleContext.role,
        schoolId: roleContext.schoolId,
        statusCode: 200,
      });
      return response;
    } catch {
      await recordAuditEvent({
        requestId,
        endpoint: '/api/admin/session/bootstrap',
        action: 'admin-login-failed',
        statusCode: 401,
        actorRole: 'system',
        metadata: { schoolCode, identifier },
      });
      logServerEvent({
        level: 'warn',
        event: 'admin-login-failed',
        requestId,
        endpoint: '/api/admin/session/bootstrap',
        statusCode: 401,
        details: { schoolCode, identifier },
      });
      return errorJson({
        requestId,
        errorCode: 'invalid-admin-credentials',
        message: 'Invalid admin credentials.',
        status: 401,
      });
    }
  }

  if (!isBootstrapKeyFlowEnabled()) {
    return errorJson({
      requestId,
      errorCode: 'bootstrap-disabled',
      message: 'Admin bootstrap key flow is disabled in production.',
      status: 403,
    });
  }

  if (!isValidAdminKey(key)) {
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/session/bootstrap',
      action: 'admin-bootstrap-invalid-key',
      statusCode: 401,
      actorRole: 'system',
    });
    return errorJson({
      requestId,
      errorCode: 'invalid-admin-bootstrap-key',
      message: 'Invalid admin bootstrap key.',
      status: 401,
    });
  }
  const response = dataJson({
    requestId,
    data: {
      role: 'admin',
      availableRoles: ['admin'],
      sessionExpiry: Date.now() + 8 * 60 * 60 * 1000,
    },
  });
  clearAllRoleSessionCookies(response);
  clearSupabaseSessionCookies(response);
  attachAdminSessionCookie(response, createAdminSessionToken());
  await recordAuditEvent({
    requestId,
    endpoint: '/api/admin/session/bootstrap',
    action: 'admin-bootstrap-key-success',
    statusCode: 200,
    actorRole: 'system',
  });
  return response;
}
