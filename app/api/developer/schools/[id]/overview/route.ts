import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { logServerEvent } from '@/lib/observability';
import { getDeveloperSchoolOverview } from '@/lib/platform-rbac-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const requestId = getRequestId(req);
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);
  const schoolId = params.id?.trim();
  if (!schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-id',
      message: 'School id is required.',
      status: 400,
    });
  }
  try {
    const overview = await getDeveloperSchoolOverview(schoolId);
    if (!overview) {
      return errorJson({
        requestId,
        errorCode: 'school-not-found',
        message: 'School not found.',
        status: 404,
      });
    }
    logServerEvent({
      event: 'developer-school-overview-read',
      requestId,
      endpoint: '/api/developer/schools/[id]/overview',
      role: 'developer',
      schoolId,
      statusCode: 200,
    });
    return dataJson({ requestId, data: overview });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'developer-school-overview-failed',
      message: error instanceof Error ? error.message : 'Failed to load school overview.',
      status: 500,
    });
  }
}
