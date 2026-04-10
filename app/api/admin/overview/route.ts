import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { logServerEvent } from '@/lib/observability';
import { getAdminOverview } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  try {
    const overview = await getAdminOverview(adminSession.role === 'admin' ? adminSession.schoolId : undefined);
    logServerEvent({
      event: 'admin-overview-read',
      requestId,
      endpoint: '/api/admin/overview',
      role: adminSession.role,
      schoolId: adminSession.schoolId,
      statusCode: 200,
    });
    return dataJson({ requestId, data: overview });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load admin overview.';
    return errorJson({
      requestId,
      errorCode: 'admin-overview-read-failed',
      message,
      status: 500,
    });
  }
}
