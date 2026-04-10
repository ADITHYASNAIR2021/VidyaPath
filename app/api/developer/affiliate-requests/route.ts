import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listAffiliateRequests } from '@/lib/onboarding-db';
import { logServerEvent } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const endpoint = '/api/developer/affiliate-requests';
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const requests = await listAffiliateRequests({
      status: status === 'pending' || status === 'approved' || status === 'rejected'
        ? status
        : undefined,
      limit: Number(url.searchParams.get('limit')) || 300,
    });
    logServerEvent({
      event: 'developer-affiliate-requests-read',
      requestId,
      endpoint,
      role: 'developer',
      statusCode: 200,
      details: { count: requests.length },
    });
    return dataJson({
      requestId,
      data: { requests },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load affiliate requests.';
    return errorJson({
      requestId,
      errorCode: 'developer-affiliate-requests-read-failed',
      message,
      status: 500,
    });
  }
}
