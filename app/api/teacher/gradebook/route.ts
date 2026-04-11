import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listTeacherGradebook } from '@/lib/school-ops-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);
  try {
    const gradebook = await listTeacherGradebook(teacherSession.teacher.id);
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

