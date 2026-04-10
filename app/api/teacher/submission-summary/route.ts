import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getTeacherSubmissionSummary } from '@/lib/teacher-admin-db';

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
    const url = new URL(req.url);
    const packId = url.searchParams.get('packId')?.trim() ?? '';
    if (!packId) {
      return errorJson({
        requestId,
        errorCode: 'missing-pack-id',
        message: 'packId query param is required.',
        status: 400,
      });
    }

    const summary = await getTeacherSubmissionSummary(teacherSession.teacher.id, packId);
    if (!summary) {
      return errorJson({
        requestId,
        errorCode: 'assignment-pack-not-found',
        message: 'Assignment pack not found.',
        status: 404,
      });
    }
    return dataJson({ requestId, data: summary });
  } catch (error) {
    console.error('[teacher-submission-summary:get] error', error);
    return errorJson({
      requestId,
      errorCode: 'submission-summary-read-failed',
      message: 'Failed to load submission summary.',
      status: 500,
    });
  }
}
