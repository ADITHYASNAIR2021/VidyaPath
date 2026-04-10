import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { logServerEvent } from '@/lib/observability';
import { getDeveloperAuditFeed } from '@/lib/platform-rbac-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit'));
  if (Number.isFinite(limit) && (limit < 20 || limit > 2000)) {
    return errorJson({
      requestId,
      errorCode: 'invalid-limit',
      message: 'limit must be between 20 and 2000.',
      status: 400,
    });
  }
  const events = await getDeveloperAuditFeed(Number.isFinite(limit) ? limit : undefined);
  logServerEvent({
    event: 'developer-audit-read',
    requestId,
    endpoint: '/api/developer/audit',
    role: 'developer',
    statusCode: 200,
    details: { events: events.length },
  });
  return dataJson({ requestId, data: { events } });
}
