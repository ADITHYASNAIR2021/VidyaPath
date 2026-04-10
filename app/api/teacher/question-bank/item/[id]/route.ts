import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { deleteTeacherQuestionBankItem, updateTeacherQuestionBankItem } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) {
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Unauthorized teacher access.',
        status: 401,
      });
    }
    await assertTeacherStorageWritable();
    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 64 * 1024);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
      });
    }
    const body = bodyResult.value;
    const item = await updateTeacherQuestionBankItem({
      teacherId: session.teacher.id,
      itemId: params.id,
      prompt: typeof body?.prompt === 'string' ? body.prompt : undefined,
      options: Array.isArray(body?.options) ? body.options.filter((v: unknown): v is string => typeof v === 'string') : undefined,
      answerIndex: Number.isFinite(Number(body?.answerIndex)) ? Number(body.answerIndex) : undefined,
      rubric: typeof body?.rubric === 'string' ? body.rubric : undefined,
      maxMarks: Number.isFinite(Number(body?.maxMarks)) ? Number(body.maxMarks) : undefined,
      imageUrl: typeof body?.imageUrl === 'string' ? body.imageUrl : undefined,
    });
    if (!item) {
      return errorJson({
        requestId,
        errorCode: 'question-item-not-found',
        message: 'Question bank item not found.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/question-bank/item/[id]',
      action: 'teacher-update-question-bank-item',
      statusCode: 200,
      actorRole: 'teacher',
      metadata: { teacherId: session.teacher.id, itemId: params.id, committedAt },
    });
    return dataJson({
      requestId,
      data: { item },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update question bank item.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'question-item-update-failed',
      message,
      status,
    });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) {
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Unauthorized teacher access.',
        status: 401,
      });
    }
    await assertTeacherStorageWritable();

    const ok = await deleteTeacherQuestionBankItem(session.teacher.id, params.id);
    if (!ok) {
      return errorJson({
        requestId,
        errorCode: 'question-item-not-found',
        message: 'Question bank item not found.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/question-bank/item/[id]',
      action: 'teacher-delete-question-bank-item',
      statusCode: 200,
      actorRole: 'teacher',
      metadata: { teacherId: session.teacher.id, itemId: params.id, committedAt },
    });
    return dataJson({
      requestId,
      data: { ok: true },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete question bank item.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'question-item-delete-failed',
      message,
      status,
    });
  }
}
