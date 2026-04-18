import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listTeacherGradebook } from '@/lib/school-ops-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);
  if (!teacherSession.teacher.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'teacher-school-missing',
      message: 'Teacher school context is required.',
      status: 403,
    });
  }
  try {
    const gradebook = await listTeacherGradebook({
      teacherId: teacherSession.teacher.id,
      schoolId: teacherSession.teacher.schoolId,
    });
    return dataJson({
      requestId,
      data: gradebook,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load teacher gradebook.';
    return errorJson({
      requestId,
      errorCode: 'teacher-gradebook-read-failed',
      message,
      status: 500,
    });
  }
}
