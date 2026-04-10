import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { createTeacherQuestionBankItem, listTeacherQuestionBank } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) {
    return errorJson({
      requestId,
      errorCode: 'unauthorized',
      message: 'Unauthorized teacher access.',
      status: 401,
    });
  }
  const url = new URL(req.url);
  const chapterId = url.searchParams.get('chapterId')?.trim() || undefined;
  const items = await listTeacherQuestionBank(session.teacher.id, { chapterId });
  return dataJson({ requestId, data: { items } });
}

export async function POST(req: Request) {
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
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
    const kind = body.kind === 'mcq' || body.kind === 'short' || body.kind === 'long' ? body.kind : '';
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!chapterId || !kind || !prompt) {
      return errorJson({
        requestId,
        errorCode: 'invalid-question-input',
        message: 'Required: chapterId, kind, prompt.',
        status: 400,
      });
    }

    const item = await createTeacherQuestionBankItem({
      teacherId: session.teacher.id,
      chapterId,
      kind,
      prompt,
      options: Array.isArray(body.options) ? body.options.filter((v: unknown): v is string => typeof v === 'string') : undefined,
      answerIndex: Number.isFinite(Number(body.answerIndex)) ? Number(body.answerIndex) : undefined,
      rubric: typeof body.rubric === 'string' ? body.rubric : undefined,
      maxMarks: Number.isFinite(Number(body.maxMarks)) ? Number(body.maxMarks) : undefined,
      imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
      section: typeof body.section === 'string' ? body.section : undefined,
    });
    if (!item) {
      return errorJson({
        requestId,
        errorCode: 'question-item-create-failed',
        message: 'Failed to create question bank item.',
        status: 500,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/question-bank/item',
      action: 'teacher-create-question-bank-item',
      statusCode: 200,
      actorRole: 'teacher',
      metadata: { teacherId: session.teacher.id, itemId: item.id, chapterId, committedAt },
    });
    return dataJson({
      requestId,
      data: { item },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create question bank item.';
    const status = /required|valid|scope|chapter|kind/i.test(message)
      ? 400
      : /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message)
        ? 503
        : 500;
    return errorJson({
      requestId,
      errorCode: 'question-item-create-failed',
      message,
      status,
    });
  }
}
