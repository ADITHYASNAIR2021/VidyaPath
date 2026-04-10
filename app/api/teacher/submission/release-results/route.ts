import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getClientIp, getRequestId, withRequestIdHeader } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { logServerEvent } from '@/lib/observability';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import { beginIdempotentRequest, commitIdempotentResponse } from '@/lib/security/idempotency';
import { releaseSubmissionResults } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

function parseSubmissionIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim();
    if (!normalized) continue;
    ids.push(normalized);
  }
  return ids.length > 0 ? ids : undefined;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const ip = getClientIp(req);
  const endpoint = '/api/teacher/submission/release-results';
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) {
      await recordAuditEvent({
        requestId,
        endpoint,
        action: 'teacher-release-results-denied',
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
    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 24 * 1024);
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
    const submissionIds = parseSubmissionIds(body.submissionIds);
    if (!packId) {
      return errorJson({
        requestId,
        errorCode: 'missing-pack-id',
        message: 'packId is required.',
        status: 400,
      });
    }

    const stableSubmissionKey = (submissionIds || []).slice().sort().join(',');
    const idempotencyKey =
      req.headers.get('x-idempotency-key')?.trim() ||
      `release:${packId}:${stableSubmissionKey || 'all'}`;
    const idempotency = await beginIdempotentRequest({
      endpoint,
      actorScope: `teacher:${session.teacher.id}`,
      idempotencyKey,
      requestBody: { packId, submissionIds: submissionIds || [] },
      ttlSeconds: 24 * 60 * 60,
    });
    if (idempotency.kind === 'replay') {
      return withRequestIdHeader(Response.json(idempotency.response, { status: idempotency.statusCode }), requestId);
    }
    if (idempotency.kind === 'conflict') {
      return errorJson({
        requestId,
        errorCode: 'idempotency-conflict',
        message: idempotency.message,
        status: 409,
      });
    }

    const released = await releaseSubmissionResults({
      teacherId: session.teacher.id,
      packId,
      submissionIds,
    });
    const committedAt = new Date().toISOString();
    const responseBody = {
      ok: true,
      requestId,
      data: released,
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
      action: 'submission-results-released',
      statusCode: 200,
      actorRole: 'teacher',
      metadata: {
        teacherId: session.teacher.id,
        packId,
        releasedCount: released.releasedCount,
        committedAt,
      },
    });
    logServerEvent({
      event: 'submission-results-released',
      requestId,
      endpoint,
      role: 'teacher',
      statusCode: 200,
      details: { teacherId: session.teacher.id, packId, releasedCount: released.releasedCount },
    });
    return dataJson({
      requestId,
      data: released,
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to release results.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'submission-results-release-failed',
      statusCode: status,
      actorRole: 'system',
      metadata: { ip, message: message.slice(0, 300) },
    });
    return errorJson({
      requestId,
      errorCode: 'submission-results-release-failed',
      message,
      status,
    });
  }
}
