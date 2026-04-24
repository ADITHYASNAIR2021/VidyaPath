import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import {
  listTeacherQuestions,
  answerStudentQuestion,
  getTeacherQuestionById,
  type StudentQuestionItem,
} from '@/lib/school-ops-db';
import { teacherHasScopeForTarget } from '@/lib/teacher/scope-guards';

export const dynamic = 'force-dynamic';

function normalizeSubject(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function toScopedPairs(
  scopes: Array<{ classLevel: 10 | 12; subject: string; isActive: boolean }>,
  requestedClassLevel?: 10 | 12
): Array<{ classLevel: 10 | 12; subject: string }> {
  const dedup = new Map<string, { classLevel: 10 | 12; subject: string }>();
  for (const scope of scopes) {
    if (!scope?.isActive) continue;
    if (requestedClassLevel && scope.classLevel !== requestedClassLevel) continue;
    const normalizedScopeSubject = normalizeSubject(scope.subject || '');
    if (!normalizedScopeSubject) continue;
    const key = `${scope.classLevel}:${normalizedScopeSubject}`;
    if (!dedup.has(key)) {
      dedup.set(key, { classLevel: scope.classLevel, subject: scope.subject });
    }
  }
  return [...dedup.values()];
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const sessionResult = await getTeacherSessionFromRequestCookies();
  if (!sessionResult) return unauthorizedJson('Teacher session required.', requestId);
  const { teacher } = sessionResult;
  const schoolId = teacher.schoolId;
  if (!schoolId) {
    return errorJson({ requestId, errorCode: 'teacher-school-missing', message: 'Teacher school context is required.', status: 403 });
  }
  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get('status');
    const classLevelParam = url.searchParams.get('classLevel');
    const subjectParam = url.searchParams.get('subject')?.trim() ?? '';

    const status = statusParam === 'pending' || statusParam === 'answered' || statusParam === 'closed'
      ? statusParam
      : undefined;
    const classLevel = classLevelParam === '10' || classLevelParam === '12'
      ? (Number(classLevelParam) as 10 | 12)
      : undefined;
    const scopedPairs = toScopedPairs(sessionResult.effectiveScopes, classLevel);
    if (scopedPairs.length === 0) {
      return dataJson({ requestId, data: [] });
    }
    const normalizedSubjectParam = normalizeSubject(subjectParam);
    const subjectFilterRequested =
      normalizedSubjectParam.length > 0 && normalizedSubjectParam !== 'all';

    const scopedPairsToQuery = subjectFilterRequested
      ? scopedPairs.filter((pair) => normalizeSubject(pair.subject) === normalizedSubjectParam)
      : scopedPairs;

    if (subjectFilterRequested && scopedPairsToQuery.length === 0) {
      return errorJson({
        requestId,
        errorCode: 'teacher-scope-forbidden',
        message: 'Requested subject is outside your assigned scope.',
        status: 403,
      });
    }

    const lists = await Promise.all(
      scopedPairsToQuery.map((pair) =>
        listTeacherQuestions({
          schoolId,
          classLevel: pair.classLevel,
          subject: pair.subject,
          status,
          limit: 100,
        })
      )
    );

    const dedup = new Map<string, StudentQuestionItem>();
    for (const list of lists) {
      for (const item of list) {
        if (!dedup.has(item.id)) dedup.set(item.id, item);
      }
    }

    const items = [...dedup.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
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
  const schoolId = teacher.schoolId;
  if (!schoolId) {
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
    const question = await getTeacherQuestionById({
      questionId: String(questionId),
      schoolId,
    });
    if (!question) {
      return errorJson({ requestId, errorCode: 'question-not-found', message: 'Question not found.', status: 404 });
    }
    const hasScope = teacherHasScopeForTarget(sessionResult, {
      classLevel: question.classLevel,
      subject: question.subject,
    });
    if (!hasScope) {
      return errorJson({
        requestId,
        errorCode: 'teacher-scope-forbidden',
        message: 'This question is outside your assigned class/subject scope.',
        status: 403,
      });
    }
    const ok = await answerStudentQuestion({
      questionId: String(questionId),
      schoolId,
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
