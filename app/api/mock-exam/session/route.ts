import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { startMockExamSchema } from '@/lib/schemas/mock-exam';

export const dynamic = 'force-dynamic';

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

import { createMockExamSession, getMockExamSession } from '@/lib/study-enhancements-db';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  const bodyResult = await parseAndValidateJsonBody(req, 64 * 1024, startMockExamSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }

  const { classLevel: rawClassLevel, subject = '', questionCount, timeLimit } = bodyResult.value;
  // Prefer schema classLevel, fall back to session
  const classLevel = rawClassLevel ?? studentSession.classLevel;

  if (!subject) {
    return errorJson({ requestId, errorCode: 'missing-subject', message: 'subject is required.', status: 400 });
  }

  try {
    const created = await createMockExamSession({
      studentId: studentSession.studentId,
      schoolId: studentSession.schoolId,
      classLevel,
      subject,
      durationMinutes: timeLimit ?? 60,
      questionCount: questionCount ?? 20,
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

