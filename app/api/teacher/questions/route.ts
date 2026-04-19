import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listTeacherQuestions, answerStudentQuestion } from '@/lib/school-ops-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const sessionResult = await getTeacherSessionFromRequestCookies();
  if (!sessionResult) return unauthorizedJson('Teacher session required.', requestId);
  const { teacher } = sessionResult;
  if (!teacher.schoolId) {
    return errorJson({ requestId, errorCode: 'teacher-school-missing', message: 'Teacher school context is required.', status: 403 });
  }
  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get('status');
    const classLevelParam = url.searchParams.get('classLevel');
    const subject = url.searchParams.get('subject') ?? undefined;

    const status = statusParam === 'pending' || statusParam === 'answered' || statusParam === 'closed'
      ? statusParam
      : undefined;
    const classLevel = classLevelParam === '10' || classLevelParam === '12'
      ? (Number(classLevelParam) as 10 | 12)
      : undefined;

    const items = await listTeacherQuestions({
      schoolId: teacher.schoolId,
      classLevel,
      subject,
      status,
      limit: 100,
    });
    return dataJson({ requestId, data: items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load questions.';
    return errorJson({ requestId, errorCode: 'teacher-questions-read-failed', message, status: 500 });
  }
}

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);
  const sessionResult = await getTeacherSessionFromRequestCookies();
  if (!sessionResult) return unauthorizedJson('Teacher session required.', requestId);
  const { teacher } = sessionResult;
  if (!teacher.schoolId) {
    return errorJson({ requestId, errorCode: 'teacher-school-missing', message: 'Teacher school context is required.', status: 403 });
  }
  try {
    const body = await req.json().catch(() => null);
    const { questionId, answer } = body ?? {};
    if (!questionId || !answer) {
      return errorJson({ requestId, errorCode: 'missing-fields', message: 'questionId and answer are required.', status: 400 });
    }
    if (typeof answer !== 'string' || answer.trim().length < 3) {
      return errorJson({ requestId, errorCode: 'answer-too-short', message: 'Answer must be at least 3 characters.', status: 400 });
    }
    const ok = await answerStudentQuestion({
      questionId: String(questionId),
      schoolId: teacher.schoolId,
      teacherId: teacher.id,
      answer: String(answer).trim(),
    });
    if (!ok) {
      return errorJson({ requestId, errorCode: 'answer-failed', message: 'Failed to save answer.', status: 500 });
    }
    return dataJson({ requestId, data: { success: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to answer question.';
    return errorJson({ requestId, errorCode: 'teacher-answer-failed', message, status: 500 });
  }
}
