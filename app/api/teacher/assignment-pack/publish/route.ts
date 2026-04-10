import { NextResponse } from 'next/server';
import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { errorJson, getClientIp, getRequestId, withRequestIdHeader } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { logServerEvent } from '@/lib/observability';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import { beginIdempotentRequest, commitIdempotentResponse } from '@/lib/security/idempotency';
import { updateAssignmentPackStatus } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const ip = getClientIp(req);
  const endpoint = '/api/teacher/assignment-pack/publish';
  try {
    const teacherSession = await getTeacherSessionFromRequestCookies();
    if (!teacherSession) {
      await recordAuditEvent({
        requestId,
        endpoint,
        action: 'teacher-publish-denied',
        statusCode: 401,
        actorRole: 'system',
        metadata: { ip },
      });
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Unauthorized teacher access.',
        status: 401,
      });
    }

    await assertTeacherStorageWritable();

    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 16 * 1024);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
      });
    }
    const body = bodyResult.value;
    const packId = typeof body.packId === 'string' ? body.packId.trim() : '';
    if (!packId) {
      return errorJson({
        requestId,
        errorCode: 'missing-pack-id',
        message: 'packId is required.',
        status: 400,
      });
    }

    const idempotencyKey = req.headers.get('x-idempotency-key')?.trim() || `pack:${packId}:publish`;
    const idempotency = await beginIdempotentRequest({
      endpoint,
      actorScope: `teacher:${teacherSession.teacher.id}`,
      idempotencyKey,
      requestBody: body,
      ttlSeconds: 24 * 60 * 60,
    });
    if (idempotency.kind === 'replay') {
      return withRequestIdHeader(NextResponse.json(idempotency.response, { status: idempotency.statusCode }), requestId);
    }
    if (idempotency.kind === 'conflict') {
      return errorJson({
        requestId,
        errorCode: 'idempotency-conflict',
        message: idempotency.message,
        status: 409,
      });
    }

    const pack = await updateAssignmentPackStatus({
      teacherId: teacherSession.teacher.id,
      packId,
      status: 'published',
      approved: true,
    });
    if (!pack) {
      return errorJson({
        requestId,
        errorCode: 'assignment-pack-not-found',
        message: 'Assignment pack not found.',
        status: 404,
      });
    }

    const committedAt = new Date().toISOString();
    const responseBody = {
      ok: true,
      requestId,
      data: { pack },
      meta: { committedAt },
    } as const;
    await commitIdempotentResponse({
      rowId: idempotency.rowId,
      response: responseBody as unknown as Record<string, unknown>,
      statusCode: 200,
    });
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'assignment-pack-published',
      statusCode: 200,
      actorRole: 'teacher',
      metadata: { teacherId: teacherSession.teacher.id, packId, committedAt },
    });
    logServerEvent({
      event: 'assignment-pack-published',
      requestId,
      endpoint,
      role: 'teacher',
      statusCode: 200,
      details: { teacherId: teacherSession.teacher.id, packId },
    });
    return withRequestIdHeader(NextResponse.json(responseBody), requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish assignment pack.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'assignment-pack-publish-failed',
      statusCode: status,
      actorRole: 'system',
      metadata: { ip, message: message.slice(0, 300) },
    });
    logServerEvent({
      level: 'error',
      event: 'assignment-pack-publish-failed',
      requestId,
      endpoint,
      statusCode: status,
      details: { message },
    });
    return errorJson({
      requestId,
      errorCode: 'assignment-pack-publish-failed',
      message,
      status,
    });
  }
}
