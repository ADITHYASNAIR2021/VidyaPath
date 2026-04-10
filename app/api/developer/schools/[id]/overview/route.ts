import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { logServerEvent } from '@/lib/observability';
import { getDeveloperSchoolOverview } from '@/lib/platform-rbac-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
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
}
