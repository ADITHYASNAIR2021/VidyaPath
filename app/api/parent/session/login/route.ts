import { NextResponse } from 'next/server';
import { createParentSessionToken, attachParentSessionCookie } from '@/lib/auth/parent-session';
import { errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { authenticateParent } from '@/lib/parent-portal-db';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const ip = getClientIp(req);
  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 64 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }

  const phone = typeof bodyResult.value.phone === 'string' ? bodyResult.value.phone.trim() : '';
  const pin = typeof bodyResult.value.pin === 'string' ? bodyResult.value.pin.trim() : '';
  const schoolId = typeof bodyResult.value.schoolId === 'string' ? bodyResult.value.schoolId.trim() : '';
  const studentId = typeof bodyResult.value.studentId === 'string' ? bodyResult.value.studentId.trim() : '';
  if (!phone || !pin) {
    return errorJson({
      requestId,
      errorCode: 'missing-login-fields',
      message: 'phone and pin are required.',
      status: 400,
    });
  }

  const ipLimit = await checkRateLimit({
    key: buildRateLimitKey('auth:parent:ip', [ip]),
    windowSeconds: 60,
    maxRequests: 20,
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

  const identityLimit = await checkRateLimit({
    key: buildRateLimitKey('auth:parent:identity', [schoolId || 'global', phone]),
    windowSeconds: 60,
    maxRequests: 8,
    blockSeconds: 300,
  });
  if (!identityLimit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many login attempts for this parent identity.',
      status: 429,
      hint: `Retry after ${identityLimit.retryAfterSeconds}s`,
    });
  }

  try {
    const authResult = await authenticateParent({
      phone,
      pin,
      schoolId: schoolId || undefined,
      studentId: studentId || undefined,
    });
    if (authResult && 'ambiguous' in authResult) {
      return errorJson({
        requestId,
        errorCode: 'parent-identity-ambiguous',
        message: 'Multiple parent links matched this phone/PIN. Include schoolId or studentId in login request.',
        status: 409,
      });
    }
    const parent = authResult;
    if (!parent) {
      return errorJson({
        requestId,
        errorCode: 'invalid-parent-credentials',
        message: 'Invalid parent phone or PIN.',
        status: 401,
      });
    }

    const token = createParentSessionToken({
      studentId: parent.studentId,
      schoolId: parent.schoolId,
      phone: parent.phone,
      parentName: parent.parentName,
    });

    const response = NextResponse.json({
      ok: true,
      requestId,
      data: {
        studentId: parent.studentId,
        schoolId: parent.schoolId,
        parentName: parent.parentName,
      },
    });
    attachParentSessionCookie(response, token);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Parent login failed.';
    return errorJson({ requestId, errorCode: 'parent-login-failed', message, status: 500 });
  }
}
