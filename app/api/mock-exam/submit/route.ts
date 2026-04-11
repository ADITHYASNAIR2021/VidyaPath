import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { submitMockExamSession } from '@/lib/study-enhancements-db';

export const dynamic = 'force-dynamic';

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

  const sessionId = typeof bodyResult.value.sessionId === 'string' ? bodyResult.value.sessionId.trim() : '';
  const answersRaw = bodyResult.value.answers;
  if (!sessionId || !answersRaw || typeof answersRaw !== 'object') {
    return errorJson({
      requestId,
      errorCode: 'invalid-submit-payload',
      message: 'sessionId and answers are required.',
      status: 400,
    });
  }

  const answers: Record<string, number> = {};
  for (const [questionId, value] of Object.entries(answersRaw as Record<string, unknown>)) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) continue;
    answers[questionId] = Math.trunc(parsed);
  }

  try {
    const result = await submitMockExamSession({
      sessionId,
      studentId: studentSession.studentId,
      answers,
    });
    return dataJson({
      requestId,
      data: result,
      meta: { committedAt: new Date().toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit mock exam.';
    return errorJson({ requestId, errorCode: 'mock-exam-submit-failed', message, status: 500 });
  }
}

