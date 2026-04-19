import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { addStudentQuestion, listStudentQuestions } from '@/lib/school-ops-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getStudentSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Student session required.', requestId);
  if (!session.schoolId) {
    return errorJson({ requestId, errorCode: 'no-school', message: 'School context required.', status: 403 });
  }
  try {
    const url = new URL(req.url);
    const chapterId = url.searchParams.get('chapterId') ?? undefined;
    const items = await listStudentQuestions({
      studentId: session.studentId,
      schoolId: session.schoolId,
      chapterId,
      limit: 50,
    });
    return dataJson({ requestId, data: items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load questions.';
    return errorJson({ requestId, errorCode: 'student-questions-read-failed', message, status: 500 });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const session = await getStudentSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Student session required.', requestId);
  if (!session.schoolId) {
    return errorJson({ requestId, errorCode: 'no-school', message: 'School context required.', status: 403 });
  }
  try {
    const body = await req.json().catch(() => null);
    const { chapterId, subject, classLevel, topic, question } = body ?? {};
    if (!chapterId || !subject || !classLevel || !question) {
      return errorJson({ requestId, errorCode: 'missing-fields', message: 'chapterId, subject, classLevel, and question are required.', status: 400 });
    }
    if (typeof question !== 'string' || question.trim().length < 5) {
      return errorJson({ requestId, errorCode: 'question-too-short', message: 'Question must be at least 5 characters.', status: 400 });
    }
    const item = await addStudentQuestion({
      schoolId: session.schoolId,
      studentId: session.studentId,
      chapterId: String(chapterId),
      subject: String(subject),
      classLevel: Number(classLevel) as 10 | 12,
      topic: topic ? String(topic) : undefined,
      question: String(question).trim(),
    });
    if (!item) {
      return errorJson({ requestId, errorCode: 'insert-failed', message: 'Failed to submit question. Please try again.', status: 500 });
    }
    return dataJson({ requestId, data: item });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit question.';
    return errorJson({ requestId, errorCode: 'student-question-post-failed', message, status: 500 });
  }
}
