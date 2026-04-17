import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { gradeSubmissionSchema } from '@/lib/schemas/teacher-submission';

export const dynamic = 'force-dynamic';

import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import { gradeSubmission } from '@/lib/teacher-admin-db';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) return unauthorizedJson('Unauthorized teacher access.', requestId);
    await assertTeacherStorageWritable();

    const bodyResult = await parseAndValidateJsonBody(req, 64 * 1024, gradeSubmissionSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }
    const { submissionId, grades: questionGrades } = bodyResult.value;

    if (!submissionId || questionGrades.length === 0) {
      return errorJson({
        requestId,
        errorCode: 'invalid-grade-payload',
        message: 'Required: submissionId and grades[]',
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
