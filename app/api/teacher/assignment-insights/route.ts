import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getTeacherAssignmentClassInsights } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const teacherSession = await getTeacherSessionFromRequestCookies();
    if (!teacherSession) {
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Unauthorized teacher access.',
        status: 401,
      });
    }
    const insights = await getTeacherAssignmentClassInsights(teacherSession.teacher.id);
    return dataJson({ requestId, data: insights });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load assignment insights.';
    return errorJson({
      requestId,
      errorCode: 'teacher-assignment-insights-read-failed',
      message,
      status: 500,
    });
  }
}
