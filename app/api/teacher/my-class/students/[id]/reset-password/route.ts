import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { generateStrongPassword } from '@/lib/auth/password-policy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getClassSectionById, isTeacherClassTeacherForSection, listClassSectionsForSchool } from '@/lib/school-management-db';
import { getStudentById, updateStudent } from '@/lib/teacher-admin-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: studentId } = await context.params;
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Teacher session required.', requestId);

  const student = await getStudentById(studentId);
  if (!student?.schoolId || !student.section) {
    return errorJson({ requestId, errorCode: 'student-not-found', message: 'Student or section mapping not found.', status: 404 });
  }
  const sections = await listClassSectionsForSchool(student.schoolId);
  const section = sections.find((item) => item.classLevel === student.classLevel && item.section === student.section);
  if (!section || !(await getClassSectionById(section.id))) {
    return errorJson({ requestId, errorCode: 'section-not-found', message: 'Class section not found.', status: 404 });
  }
  const allowed = await isTeacherClassTeacherForSection(session.teacher.id, section.id, student.schoolId);
  if (!allowed) {
    return errorJson({ requestId, errorCode: 'class-teacher-required', message: 'Only this student’s class teacher can reset the password.', status: 403 });
  }

  const temporaryPassword = generateStrongPassword(12);
  const updated = await updateStudent(student.id, { password: temporaryPassword }, student.schoolId);
  if (!updated) {
    return errorJson({ requestId, errorCode: 'student-password-reset-failed', message: 'Student password could not be reset.', status: 500 });
  }
  await recordAuditEvent({
    requestId,
    endpoint: '/api/teacher/my-class/students/[id]/reset-password',
    action: 'class-teacher-reset-student-password',
    statusCode: 200,
    actorRole: 'teacher',
    schoolId: student.schoolId,
    metadata: { teacherId: session.teacher.id, studentId: student.id, classSectionId: section.id },
  });
  return dataJson({
    requestId,
    data: {
      studentId: student.id,
      studentName: student.name,
      loginIdentifier: student.rollCode,
      temporaryPassword,
      mustChangePassword: true,
    },
  });
}
