import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { createMockExamSession, getMockExamSession } from '@/lib/study-enhancements-db';

export const dynamic = 'force-dynamic';

function toClassLevel(value: unknown): 10 | 12 | null {
  const parsed = Number(value);
  if (parsed === 10 || parsed === 12) return parsed;
  return null;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  const sessionId = new URL(req.url).searchParams.get('sessionId')?.trim() || '';
  if (!sessionId) {
    return errorJson({ requestId, errorCode: 'missing-session-id', message: 'sessionId is required.', status: 400 });
  }

  try {
    const session = await getMockExamSession({ sessionId, studentId: studentSession.studentId });
    if (!session) {
      return errorJson({ requestId, errorCode: 'mock-exam-not-found', message: 'Mock exam session not found.', status: 404 });
    }

    const data = {
      sessionId: session.id,
      subject: session.subject,
      classLevel: session.class_level,
      durationMinutes: session.duration_minutes,
      questionCount: session.question_count,
      status: session.status,
      createdAt: session.created_at,
      submittedAt: session.submitted_at,
      score: session.score,
      questions: session.questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        options: question.options,
        chapterId: question.chapterId,
        answerIndex: session.status === 'submitted' ? question.answerIndex : undefined,
        explanation: session.status === 'submitted' ? question.explanation : undefined,
      })),
      answers: session.answers,
    };

    return dataJson({ requestId, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load mock exam session.';
    return errorJson({ requestId, errorCode: 'mock-exam-read-failed', message, status: 500 });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 128 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }

  const classLevel = toClassLevel(bodyResult.value.classLevel) || studentSession.classLevel;
  const subject = typeof bodyResult.value.subject === 'string' ? bodyResult.value.subject.trim() : '';
  const durationMinutes = Number(bodyResult.value.durationMinutes);
  const questionCount = Number(bodyResult.value.questionCount);

  if (!subject) {
    return errorJson({ requestId, errorCode: 'missing-subject', message: 'subject is required.', status: 400 });
  }

  try {
    const created = await createMockExamSession({
      studentId: studentSession.studentId,
      schoolId: studentSession.schoolId,
      classLevel,
      subject,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 60,
      questionCount: Number.isFinite(questionCount) ? questionCount : 20,
    });
    return dataJson({
      requestId,
      data: created,
      meta: { committedAt: new Date().toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create mock exam session.';
    return errorJson({ requestId, errorCode: 'mock-exam-create-failed', message, status: 500 });
  }
}

