import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { logServerEvent } from '@/lib/observability';
import { getTokenUsageRollup } from '@/lib/platform-rbac-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);
  const url = new URL(req.url);
  const schoolId = url.searchParams.get('schoolId')?.trim() || undefined;
  const endpoint = url.searchParams.get('endpoint')?.trim() || undefined;
  const limit = Number(url.searchParams.get('limit'));
  if (Number.isFinite(limit) && (limit < 1 || limit > 2000)) {
    return errorJson({
      requestId,
      errorCode: 'invalid-limit',
      message: 'limit must be between 1 and 2000.',
      status: 400,
    });
  }
  const payload = await getTokenUsageRollup({
    schoolId,
    endpoint,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  logServerEvent({
    event: 'developer-token-usage-read',
    requestId,
    endpoint: '/api/developer/usage/tokens',
    role: 'developer',
    schoolId,
    statusCode: 200,
    details: { events: payload.events },
  });
  return dataJson({ requestId, data: payload });
}
