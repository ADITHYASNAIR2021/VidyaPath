import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getObservabilitySummary } from '@/lib/observability-summary';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);

  const url = new URL(req.url);
  const hours = Number(url.searchParams.get('hours') || 24);
  if (Number.isFinite(hours) && (hours < 1 || hours > 168)) {
    return errorJson({
      requestId,
      errorCode: 'invalid-hours-window',
      message: 'hours must be between 1 and 168.',
      status: 400,
    });
  }

  const summary = await getObservabilitySummary(Number.isFinite(hours) ? hours : 24);
  return dataJson({ requestId, data: summary });
}
