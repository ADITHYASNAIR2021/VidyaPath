import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { getAssignmentPack, getAssignmentPackSchoolId, startExamSession } from '@/lib/teacher-admin-db';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { startExamSessionSchema } from '@/lib/schemas/exam-session';
import { recordAuditEvent } from '@/lib/security/audit';
import { studentCanAccessChapter } from '@/lib/school-management-db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const endpoint = '/api/exam/session/start';
  try {
    await assertTeacherStorageWritable();
    const bodyResult = await parseAndValidateJsonBody(req, 16 * 1024, startExamSessionSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
      });
    }
    const body = bodyResult.value;
    const { packId } = bodyResult.value;
    const studentSession = await getStudentSessionFromRequestCookies();
    if (!studentSession) {
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Student login required.',
        status: 401,
      });
    }
    const studentName = studentSession.studentName;
    const submissionCode = studentSession.rollCode;
    if (!packId || !studentName || !submissionCode) {
      return errorJson({
        requestId,
        errorCode: 'invalid-exam-start-input',
        message: 'Required: { packId }',
        status: 400,
      });
    }
    const pack = await getAssignmentPack(packId);
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

    const session = await startExamSession({ packId, studentName, submissionCode });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'exam-session-started',
      statusCode: 200,
      actorRole: 'student',
      metadata: {
        studentId: studentSession.studentId,
        packId,
        sessionId: session.sessionId,
        committedAt,
      },
    });
    return dataJson({
      requestId,
      data: { session },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start exam session.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'exam-session-start-failed',
      message,
      status,
    });
  }
}
