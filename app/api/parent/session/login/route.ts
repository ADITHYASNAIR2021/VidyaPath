import { NextResponse } from 'next/server';
import { createParentSessionToken, attachParentSessionCookie } from '@/lib/auth/parent-session';
import { errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { authenticateParent } from '@/lib/parent-portal-db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
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
  if (!phone || !pin) {
    return errorJson({
      requestId,
      errorCode: 'missing-login-fields',
      message: 'phone and pin are required.',
      status: 400,
    });
  }

  try {
    const parent = await authenticateParent({ phone, pin });
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

