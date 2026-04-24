import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { logServerEvent } from '@/lib/observability';
import { getAdminOverview } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  if (adminSession.role === 'admin' && !adminSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-scope',
      message: 'School scope missing for admin session.',
      status: 403,
    });
  }
  try {
    const url = new URL(req.url);
    const scopedSchoolId = adminSession.role === 'admin'
      ? adminSession.schoolId
      : (url.searchParams.get('schoolId')?.trim() || undefined);
    const overview = await getAdminOverview(scopedSchoolId);
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
