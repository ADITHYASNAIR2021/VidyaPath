import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { mockExamSubmitSchema } from '@/lib/schemas/exam';
import { submitMockExamSession } from '@/lib/study-enhancements-db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  const bodyResult = await parseAndValidateJsonBody(req, 256 * 1024, mockExamSubmitSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }

  const { sessionId, answers: answersRaw } = bodyResult.value;
  const answers: Record<string, number> = {};
  for (const [questionId, value] of Object.entries(answersRaw ?? {})) {
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

