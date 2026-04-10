import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import { gradeSubmission } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

type QuestionGradeInput = {
  questionNo: string;
  scoreAwarded: number;
  maxScore: number;
  feedback?: string;
};

function parseQuestionGrades(value: unknown): QuestionGradeInput[] {
  if (!Array.isArray(value)) return [];
  const rows: QuestionGradeInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const questionNo = typeof row.questionNo === 'string' ? row.questionNo.trim() : '';
    const scoreAwarded = Number(row.scoreAwarded);
    const maxScore = Number(row.maxScore);
    const feedback = typeof row.feedback === 'string' ? row.feedback.trim() : undefined;
    if (!questionNo || !Number.isFinite(scoreAwarded) || !Number.isFinite(maxScore)) continue;
    rows.push({ questionNo, scoreAwarded, maxScore, feedback });
  }
  return rows;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) return unauthorizedJson('Unauthorized teacher access.', requestId);
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
    const submissionId = typeof body.submissionId === 'string' ? body.submissionId.trim() : '';
    const questionGrades = parseQuestionGrades(body.questionGrades);

    if (!submissionId || questionGrades.length === 0) {
      return errorJson({
        requestId,
        errorCode: 'invalid-grade-payload',
        message: 'Required: submissionId and questionGrades[]',
        status: 400,
      });
    }

    const submission = await gradeSubmission({
      teacherId: session.teacher.id,
      submissionId,
      questionGrades,
    });

    if (!submission) {
      return errorJson({
        requestId,
        errorCode: 'submission-not-found',
        message: 'Submission not found.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/submission/grade',
      action: 'teacher-grade-submission',
      statusCode: 200,
      actorRole: 'teacher',
      metadata: { teacherId: session.teacher.id, submissionId, committedAt },
    });
    return dataJson({
      requestId,
      data: { submission },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to grade submission.';
    const status = /required|valid|grade/i.test(message)
      ? 400
      : /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message)
        ? 503
        : 500;
    return errorJson({
      requestId,
      errorCode: 'grade-submission-failed',
      message,
      status,
    });
  }
}
