import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import {
  getStudentEnrolledSubjects,
  isTeacherClassTeacherForSection,
  listClassSectionsForSchool,
  setStudentSubjectEnrollmentsForStudent,
} from '@/lib/school-management-db';
import { getStudentById } from '@/lib/teacher-admin-db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const putSubjectsSchema = z.object({
  subjects: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
});

async function resolveTeacherAccess(teacherId: string, studentId: string) {
  const student = await getStudentById(studentId);
  if (!student) return { ok: false as const, status: 404, message: 'Student not found.' };
  if (!student.schoolId) return { ok: false as const, status: 400, message: 'Student has no school.' };
  if (student.classLevel !== 12) {
    return { ok: false as const, status: 400, message: 'Subject enrollment management is only for Class 12 students.' };
  }
  if (!student.section) return { ok: false as const, status: 400, message: 'Student has no section assigned.' };

  const allSections = await listClassSectionsForSchool(student.schoolId);
  const matchingSection = allSections.find(
    (s) => s.classLevel === student.classLevel && s.section === student.section
  );
  if (!matchingSection) return { ok: false as const, status: 404, message: 'Section not found.' };

  const allowed = await isTeacherClassTeacherForSection(teacherId, matchingSection.id, student.schoolId);
  if (!allowed) {
    return { ok: false as const, status: 403, message: 'Only the class teacher for this section can manage subjects.' };
  }

  return { ok: true as const, student, schoolId: student.schoolId, section: matchingSection };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Teacher session required.', requestId);

  const access = await resolveTeacherAccess(session.teacher.id, params.id);
  if (!access.ok) {
    return errorJson({ requestId, errorCode: 'access-denied', message: access.message, status: access.status });
  }

  try {
    const subjects = await getStudentEnrolledSubjects(params.id, access.schoolId);
    return dataJson({ requestId, data: { subjects, studentId: params.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subjects.';
    return errorJson({ requestId, errorCode: 'subjects-fetch-failed', message, status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Teacher session required.', requestId);

  const access = await resolveTeacherAccess(session.teacher.id, params.id);
  if (!access.ok) {
    return errorJson({ requestId, errorCode: 'access-denied', message: access.message, status: access.status });
  }

  const bodyResult = await parseAndValidateJsonBody(req, 16 * 1024, putSubjectsSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }

  try {
    const result = await setStudentSubjectEnrollmentsForStudent({
      schoolId: access.schoolId,
      studentId: params.id,
      classLevel: 12,
      section: access.student.section,
      classSectionId: access.section.id,
      subjects: bodyResult.value.subjects,
      assignedByTeacherId: session.teacher.id,
      replaceExisting: true,
    });
    return dataJson({ requestId, data: { subjects: result.subjects, activated: result.activated, deactivated: result.deactivated } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update subjects.';
    return errorJson({ requestId, errorCode: 'subjects-update-failed', message, status: 500 });
  }
}
