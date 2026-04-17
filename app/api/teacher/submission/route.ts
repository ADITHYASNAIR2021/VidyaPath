import { addSubmission, getAssignmentPack, getAssignmentPackSchoolId } from '@/lib/teacher-admin-db';
import { evaluateTeacherAssignmentSubmission } from '@/lib/teacher-assignment';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { teacherSubmissionCreateSchema } from '@/lib/schemas/teacher';
import { logServerEvent } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/security/audit';
import { studentCanAccessChapter } from '@/lib/school-management-db';
import { resolveRequestSupabaseClient } from '@/lib/supabase/request-client';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const endpoint = '/api/teacher/submission';
  const ip = getClientIp(req);
  try {
    await assertTeacherStorageWritable();
    const studentSession = await getStudentSessionFromRequestCookies();
    if (!studentSession) {
      await recordAuditEvent({
        requestId,
        endpoint,
        action: 'submission-denied',
        statusCode: 401,
        actorRole: 'system',
        metadata: { ip },
      });
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Student login required.',
        status: 401,
      });
    }
    const bodyResult = await parseAndValidateJsonBody(req, 256 * 1024, teacherSubmissionCreateSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }
    const parsed = bodyResult.value;

    const pack = await getAssignmentPack(parsed.packId);
    if (!pack || pack.status !== 'published') {
      return errorJson({
        requestId,
        errorCode: 'assignment-pack-not-found',
        message: 'Assignment pack not found.',
        status: 404,
      });
    }
    const packSchoolId = await getAssignmentPackSchoolId(pack.packId);
    if (!studentSession.schoolId || !packSchoolId || packSchoolId !== studentSession.schoolId) {
      return errorJson({
        requestId,
        errorCode: 'school-mismatch',
        message: 'This assignment is not available for your school.',
        status: 403,
      });
    }
    if (pack.classLevel !== studentSession.classLevel) {
      return errorJson({
        requestId,
        errorCode: 'class-mismatch',
        message: 'This assignment is not available for your class.',
        status: 403,
      });
    }
    if (pack.section && studentSession.section && pack.section !== studentSession.section) {
      return errorJson({
        requestId,
        errorCode: 'section-restricted',
        message: 'This assignment is section restricted.',
        status: 403,
      });
    }
    if (pack.section && !studentSession.section) {
      return errorJson({
        requestId,
        errorCode: 'missing-student-section',
        message: 'Student section is missing for this restricted assignment.',
        status: 403,
      });
    }
    const allowedByEnrollment = await studentCanAccessChapter({
      studentId: studentSession.studentId,
      chapterId: pack.chapterId,
      schoolId: studentSession.schoolId,
    });
    if (!allowedByEnrollment) {
      return errorJson({
        requestId,
        errorCode: 'subject-enrollment-required',
        message: 'This assignment is not available for your enrolled subjects.',
        status: 403,
      });
    }

    // Server-side duplicate guard: block re-submission for the same student + pack
    const resolvedClient = resolveRequestSupabaseClient(req, 'user-first');
    const existingRows = resolvedClient
      ? await resolvedClient.client
          .from('teacher_submissions')
          .select('id')
          .eq('pack_id', parsed.packId)
          .eq('submission_code', studentSession.rollCode.toUpperCase())
          .limit(1)
          .then(({ data, error }) => {
            if (error) throw new Error(error.message || 'Failed to check duplicate submission.');
            return (data || []) as Array<{ id: string }>;
          })
          .then(undefined, () => [] as Array<{ id: string }>)
      : [];
    if (existingRows.length > 0) {
      return errorJson({
        requestId,
        errorCode: 'already-submitted',
        message: 'You have already submitted this assignment.',
        status: 409,
      });
    }

    const result = evaluateTeacherAssignmentSubmission(pack, parsed.answers);
    const { submission, duplicate } = await addSubmission({
      packId: parsed.packId,
      studentId: studentSession.studentId,
      studentName: studentSession.studentName,
      submissionCode: studentSession.rollCode,
      answers: parsed.answers,
      result,
    });

    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'submission-recorded',
      statusCode: 200,
      actorRole: 'student',
      metadata: {
        studentId: studentSession.studentId,
        submissionId: submission.submissionId,
        packId: parsed.packId,
        duplicate,
        committedAt,
      },
    });
    logServerEvent({
      event: 'submission-recorded',
      requestId,
      endpoint,
      role: 'student',
      statusCode: 200,
      details: { studentId: studentSession.studentId, packId: parsed.packId, duplicate },
    });
    return dataJson({
      requestId,
      data: {
        submissionId: submission.submissionId,
        status: submission.status,
        message: 'Submission recorded. Waiting for teacher review and result release.',
        duplicate,
      },
      meta: { committedAt },
    });
  } catch (error) {
    console.error('[teacher-submission:post] error', error);
    const message = error instanceof Error ? error.message : 'Failed to submit assignment.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'submission-failed',
      statusCode: status,
      actorRole: 'system',
      metadata: { message: message.slice(0, 300), ip },
    });
    return errorJson({
      requestId,
      errorCode: 'submission-failed',
      message,
      status,
    });
  }
}
