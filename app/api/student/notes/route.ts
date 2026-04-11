import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { getChapterNote, saveChapterNote } from '@/lib/study-enhancements-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  const chapterId = new URL(req.url).searchParams.get('chapterId')?.trim() || '';
  if (!chapterId) {
    return errorJson({
      requestId,
      errorCode: 'missing-chapter-id',
      message: 'chapterId is required.',
      status: 400,
    });
  }

  try {
    const note = await getChapterNote(studentSession.studentId, chapterId);
    return dataJson({ requestId, data: { chapterId, ...note } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load chapter note.';
    return errorJson({ requestId, errorCode: 'note-read-failed', message, status: 500 });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 256 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }

  const chapterId = typeof bodyResult.value.chapterId === 'string' ? bodyResult.value.chapterId.trim() : '';
  const content = typeof bodyResult.value.content === 'string' ? bodyResult.value.content : '';
  if (!chapterId) {
    return errorJson({
      requestId,
      errorCode: 'missing-chapter-id',
      message: 'chapterId is required.',
      status: 400,
    });
  }

  try {
    const saved = await saveChapterNote(studentSession.studentId, chapterId, content);
    return dataJson({
      requestId,
      data: { chapterId, ...saved },
      meta: { committedAt: saved.updatedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save chapter note.';
    return errorJson({ requestId, errorCode: 'note-write-failed', message, status: 500 });
  }
}

