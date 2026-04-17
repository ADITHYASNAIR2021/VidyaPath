/**
 * POST /api/developer/session/login
 *
 * Authenticates with Supabase developer role credentials when available.
 * Falls back to DEVELOPER_USERNAME + DEVELOPER_PASSWORD env vars.
 * Issues a vp_developer_session cookie (HMAC-signed, httpOnly).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  attachDeveloperSessionCookie,
  clearAllRoleSessionCookies,
  createDeveloperSessionToken,
  isSessionSigningConfigured,
} from '@/lib/auth/session';
import {
  attachSupabaseSessionCookies,
  clearSupabaseSessionCookies,
  signInWithPassword,
} from '@/lib/auth/supabase-auth';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { developerLoginSchema } from '@/lib/schemas/auth';
import { resolveRoleContextByAuthUserId } from '@/lib/platform-rbac-db';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

function getDeveloperCredentials(): { username: string; password: string } | null {
  const username = (process.env.DEVELOPER_USERNAME || '').trim();
  const password = (process.env.DEVELOPER_PASSWORD || '').trim();
  if (username && password) return { username, password };
  if (process.env.NODE_ENV !== 'production') {
    return {
      username: 'developer@vidyapath',
      password: 'Developer@Vidyapath.org',
    };
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(
    createHmac('sha256', 'vp-dev-compare').update(a).digest('hex'),
    'utf8'
  );
  const bBuf = Buffer.from(
    createHmac('sha256', 'vp-dev-compare').update(b).digest('hex'),
    'utf8'
  );
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
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

  const credentials = getDeveloperCredentials();
  if (!credentials) {
    return errorJson({
      requestId,
      errorCode: 'developer-access-not-configured',
      message: 'Developer access is not configured. Set DEVELOPER_USERNAME and DEVELOPER_PASSWORD in environment.',
      status: 503,
    });
  }

  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey('auth:developer-login', [ip]),
    windowSeconds: 60,
    maxRequests: 8,
    blockSeconds: 180,
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

  const bodyResult = await parseAndValidateJsonBody(req, 4 * 1024, developerLoginSchema);
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
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password.trim() : '';
  const normalizedUsername = username.toLowerCase();

  if (!username || !password) {
    return errorJson({
      requestId,
      errorCode: 'missing-credentials',
      message: 'Username and password are required.',
      status: 400,
    });
  }

  if (normalizedUsername.includes('@')) {
    try {
      const authSession = await signInWithPassword({
        email: normalizedUsername,
        password,
      });
      const roleContext = authSession.user?.id
        ? await resolveRoleContextByAuthUserId(authSession.user.id)
        : null;
      if (roleContext && roleContext.role !== 'developer') {
        return errorJson({
          requestId,
          errorCode: 'developer-role-required',
          message: 'Authenticated account does not have developer access.',
          status: 403,
        });
      }
      if (roleContext?.role === 'developer') {
        const token = createDeveloperSessionToken(normalizedUsername);
        const response = dataJson({
          requestId,
          data: {
            role: 'developer',
            username: normalizedUsername,
            availableRoles: roleContext.availableRoles,
            schoolId: roleContext.schoolId,
            schoolCode: roleContext.schoolCode,
            sessionExpiry: Date.now() + 8 * 60 * 60 * 1000,
            auth: 'supabase',
          },
        });
        clearAllRoleSessionCookies(response);
        clearSupabaseSessionCookies(response);
        attachSupabaseSessionCookies(response, authSession, 'developer');
        attachDeveloperSessionCookie(response, token);
        await recordAuditEvent({
          requestId,
          endpoint: '/api/developer/session/login',
          action: 'developer-login-success',
          statusCode: 200,
          actorRole: 'developer',
          actorAuthUserId: roleContext.authUserId,
          schoolId: roleContext.schoolId,
          metadata: { username: normalizedUsername, auth: 'supabase' },
        });
        return response;
      }
    } catch {
      // Fallback to env-based credentials below.
    }
  }

  const usernameMatch = safeEqual(username, credentials.username);
  const passwordMatch = safeEqual(password, credentials.password);

  if (!usernameMatch || !passwordMatch) {
    await recordAuditEvent({
      requestId,
      endpoint: '/api/developer/session/login',
      action: 'developer-login-failed',
      statusCode: 401,
      actorRole: 'system',
      metadata: { username },
    });
    return errorJson({
      requestId,
      errorCode: 'invalid-developer-credentials',
      message: 'Invalid username or password.',
      status: 401,
    });
  }

  const token = createDeveloperSessionToken(credentials.username);
  const response = dataJson({
    requestId,
    data: {
      role: 'developer',
      username: credentials.username,
      sessionExpiry: Date.now() + 8 * 60 * 60 * 1000,
    },
  });
  clearAllRoleSessionCookies(response);
  clearSupabaseSessionCookies(response);
  attachDeveloperSessionCookie(response, token);

  await recordAuditEvent({
    requestId,
    endpoint: '/api/developer/session/login',
    action: 'developer-login-success',
    statusCode: 200,
    actorRole: 'developer',
    metadata: { username: credentials.username },
  });

  return response;
}
