import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listVisibleAssignmentsForStudent } from '@/lib/student/assignments.db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);
  if (!studentSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'student-school-missing',
      message: 'Student school context is required.',
      status: 403,
    });
  }

  try {
    const assignments = await listVisibleAssignmentsForStudent({
      classLevel: studentSession.classLevel,
      schoolId: studentSession.schoolId,
      section: studentSession.section,
      stream: studentSession.stream,
      enrolledSubjects: studentSession.enrolledSubjects,
    });

    return dataJson({
      requestId,
      data: { assignments },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load assignments.';
    return errorJson({
      requestId,
      errorCode: 'student-assignments-read-failed',
      message,
      status: 500,
    });
  }
}
