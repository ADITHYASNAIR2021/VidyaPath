import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  DEVELOPER_COOKIE,
  createDeveloperSessionValue,
  developerCookieOptions,
  getDeveloperKeyStatus,
  hasDeveloperSession,
  isValidDeveloperKey,
} from '@/lib/developer/auth';
import { getClientIp } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const loginSchema = z.object({ key: z.string().trim().min(1).max(512) });

/** Session status — lets the console decide between the login form and the dashboard. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: getDeveloperKeyStatus() === 'ok',
    keyStatus: getDeveloperKeyStatus(),
    authenticated: getDeveloperKeyStatus() === 'ok' && (await hasDeveloperSession()),
  });
}

export async function POST(req: Request) {
  const keyStatus = getDeveloperKeyStatus();
  if (keyStatus !== 'ok') {
    return NextResponse.json(
      { ok: false, errorCode: 'developer-console-disabled', message: 'Set DEVELOPER_DASHBOARD_KEY (24+ characters) to enable the developer console.' },
      { status: 503 }
    );
  }

  const ip = getClientIp(req);
  const limit = await checkRateLimit({
    key: buildRateLimitKey('developer:login', [ip]),
    windowSeconds: 15 * 60,
    maxRequests: 5,
    blockSeconds: 15 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, errorCode: 'rate-limit-exceeded', message: `Too many attempts. Retry in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const body = await parseAndValidateJsonBody(req, 2 * 1024, loginSchema);
  if (!body.ok) {
    return NextResponse.json({ ok: false, errorCode: body.reason, message: body.message }, { status: bodyReasonToStatus(body.reason) });
  }

  if (!isValidDeveloperKey(body.value.key)) {
    logger.warn({ event: 'developer-login-failed', ip }, 'developer login failed');
    return NextResponse.json({ ok: false, errorCode: 'invalid-developer-key', message: 'Invalid developer key.' }, { status: 401 });
  }

  const session = createDeveloperSessionValue();
  if (!session) {
    return NextResponse.json({ ok: false, errorCode: 'developer-console-disabled', message: 'Developer console disabled.' }, { status: 503 });
  }
  logger.info({ event: 'developer-login', ip }, 'developer login');
  const response = NextResponse.json({ ok: true, authenticated: true });
  response.cookies.set(DEVELOPER_COOKIE, session.value, developerCookieOptions(session.maxAgeSeconds));
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, authenticated: false });
  response.cookies.set(DEVELOPER_COOKIE, '', developerCookieOptions(0));
  return response;
}
