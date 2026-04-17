import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { enrollSubjectsSchema } from '@/lib/schemas/teacher-roster';
import {
  getClassSectionById,
  isTeacherClassTeacherForSection,
  setStudentSubjectEnrollmentsForClassSection,
} from '@/lib/school-management-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Teacher session required.', requestId);
  const classSectionId = params.id?.trim();
  if (!classSectionId) {
    return errorJson({
      requestId,
      errorCode: 'missing-class-section-id',
      message: 'Class section id is required.',
      status: 400,
    });
  }

  const bodyResult = await parseAndValidateJsonBody(req, 64 * 1024, enrollSubjectsSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  const subjects = Array.isArray(bodyResult.value.subjects)
    ? bodyResult.value.subjects.filter((item): item is string => typeof item === 'string')
    : [];

  try {
    const section = await getClassSectionById(classSectionId);
    if (!section) {
      return errorJson({
        requestId,
        errorCode: 'class-section-not-found',
        message: 'Class section not found.',
        status: 404,
      });
    }
    const allowed = await isTeacherClassTeacherForSection(session.teacher.id, classSectionId, section.schoolId);
    if (!allowed) {
      return errorJson({
        requestId,
        errorCode: 'class-teacher-required',
        message: 'Only class teacher can update student subject enrollments for this section.',
        status: 403,
      });
    }
    const result = await setStudentSubjectEnrollmentsForClassSection({
      schoolId: section.schoolId,
      classSectionId,
      subjects,
      assignedByTeacherId: session.teacher.id,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/class-sections/[id]/enroll-subjects',
      action: 'teacher-enroll-student-subjects',
      statusCode: 200,
      actorRole: 'teacher',
      metadata: {
        classSectionId,
        teacherId: session.teacher.id,
        subjects: result.subjects,
        students: result.students,
        committedAt,
      },
    });
    return dataJson({
      requestId,
      data: result,
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update student subject enrollments.';
    const status = /required|valid|class section|subject/i.test(message) ? 400 : 500;
    return errorJson({
      requestId,
      errorCode: 'teacher-enroll-subjects-failed',
      message,
      status,
    });
  }
}
