import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { getClassSectionById, isTeacherClassTeacherForSection } from '@/lib/school-management-db';
import { getStudentById, updateStudent } from '@/lib/teacher-admin-db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const patchStudentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  rollNo: z.string().trim().max(50).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  password: z.string().trim().min(8).max(128).optional(),
});

async function resolveTeacherAccessForStudent(
  teacherId: string,
  studentId: string
): Promise<{ ok: true; schoolId: string; section: Awaited<ReturnType<typeof getClassSectionById>> } | { ok: false; status: number; message: string }> {
  const student = await getStudentById(studentId);
  if (!student) return { ok: false, status: 404, message: 'Student not found.' };
  if (!student.schoolId) return { ok: false, status: 400, message: 'Student has no school.' };
  if (!student.section) return { ok: false, status: 400, message: 'Student has no section assigned.' };

  // Find the class section for this student
  const { listClassSectionsForSchool } = await import('@/lib/school-management-db');
  const allSections = await listClassSectionsForSchool(student.schoolId);
  const matchingSection = allSections.find(
    (s) => s.classLevel === student.classLevel && s.section === student.section
  );
  if (!matchingSection) return { ok: false, status: 404, message: 'Section not found for student.' };

  const allowed = await isTeacherClassTeacherForSection(teacherId, matchingSection.id, student.schoolId);
  if (!allowed) return { ok: false, status: 403, message: 'Only the class teacher for this section can manage students.' };

  return { ok: true, schoolId: student.schoolId, section: matchingSection };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Teacher session required.', requestId);

  const access = await resolveTeacherAccessForStudent(session.teacher.id, params.id);
  if (!access.ok) {
    return errorJson({ requestId, errorCode: 'access-denied', message: access.message, status: access.status });
  }

  const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, patchStudentSchema);
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
  const updates: Parameters<typeof updateStudent>[1] = {};
  if (typeof body.name === 'string') updates.name = body.name;
  if (typeof body.rollNo === 'string') updates.rollNo = body.rollNo;
  if (body.status === 'active' || body.status === 'inactive') updates.status = body.status;
  if (typeof body.password === 'string') updates.password = body.password;

  try {
    const student = await updateStudent(params.id, updates, access.schoolId);
    if (!student) {
      return errorJson({ requestId, errorCode: 'student-not-found', message: 'Student not found.', status: 404 });
    }
    return dataJson({ requestId, data: { student } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update student.';
    return errorJson({ requestId, errorCode: 'student-update-failed', message, status: 500 });
  }
}
