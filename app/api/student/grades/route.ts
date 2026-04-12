import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listStudentGrades } from '@/lib/school-ops-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);
  try {
    const grades = await listStudentGrades({
      studentId: studentSession.studentId,
      rollCode: studentSession.rollCode,
      schoolId: studentSession.schoolId,
    });
    return dataJson({
      requestId,
      data: { grades },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load grades.';
    return errorJson({
      requestId,
      errorCode: 'student-grades-read-failed',
      message,
      status: 500,
    });
  }
}
