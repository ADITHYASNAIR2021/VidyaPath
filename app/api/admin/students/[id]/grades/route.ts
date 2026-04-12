import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listStudentGrades } from '@/lib/school-ops-db';
import { getStudentById } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  const studentId = params.id?.trim();
  if (!studentId) {
    return errorJson({
      requestId,
      errorCode: 'missing-student-id',
      message: 'Student id is required.',
      status: 400,
    });
  }
  if (adminSession.role === 'admin' && !adminSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-scope',
      message: 'School scope missing for admin session.',
      status: 400,
    });
  }

  try {
    const student = await getStudentById(studentId, adminSession.role === 'admin' ? adminSession.schoolId : undefined);
    if (!student) {
      return errorJson({
        requestId,
        errorCode: 'student-not-found',
        message: 'Student not found.',
        status: 404,
      });
    }
    const grades = await listStudentGrades({
      studentId: student.id,
      rollCode: student.rollCode,
      schoolId: student.schoolId,
    });
    return dataJson({
      requestId,
      data: { student, grades },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load student grades.';
    return errorJson({
      requestId,
      errorCode: 'admin-student-grades-read-failed',
      message,
      status: 500,
    });
  }
}
