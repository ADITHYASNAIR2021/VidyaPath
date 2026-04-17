import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { getAssignmentPack, getAssignmentPackSchoolId, getExamSession, recordExamHeartbeat } from '@/lib/teacher-admin-db';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { examHeartbeatSchema } from '@/lib/schemas/exam-session';
import type { ExamViolationEvent } from '@/lib/teacher-types';


export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    await assertTeacherStorageWritable();
    const studentSession = await getStudentSessionFromRequestCookies();
    if (!studentSession) {
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Student login required.',
        status: 401,
      });
    }

    const bodyResult = await parseAndValidateJsonBody(req, 64 * 1024, examHeartbeatSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }
    const { sessionId, violations = [] } = bodyResult.value;
    const session = await getExamSession(sessionId);
    if (!session) {
      return errorJson({
        requestId,
        errorCode: 'exam-session-not-found',
        message: 'Exam session not found.',
        status: 404,
      });
    }
    if (session.status !== 'active') {
      return errorJson({
        requestId,
        errorCode: 'exam-session-closed',
        message: 'Exam session is already closed.',
        status: 409,
      });
    }
    if (session.submissionCode.toUpperCase() !== studentSession.rollCode.toUpperCase()) {
      return errorJson({
        requestId,
        errorCode: 'session-identity-mismatch',
        message: 'Session identity mismatch. Please login again.',
        status: 403,
      });
    }
    const pack = await getAssignmentPack(session.packId);
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

    const events: import('@/lib/teacher-types').ExamViolationEvent[] = violations.map((v) => ({
      type: (v.eventType ?? 'window-blur') as import('@/lib/teacher-types').ExamViolationEvent['type'],
      occurredAt: v.occurredAt ?? new Date().toISOString(),
      detail: v.detail,
    }));
    const data = await recordExamHeartbeat({ sessionId, events });
    return dataJson({ requestId, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update exam session.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'exam-heartbeat-failed',
      message,
      status,
    });
  }
}
