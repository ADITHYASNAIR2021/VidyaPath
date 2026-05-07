import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getDeveloperControlTower } from '@/lib/developer/control-tower';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);
  try {
    const url = new URL(req.url);
    const hours = Number(url.searchParams.get('hours') || '24');
    const data = await getDeveloperControlTower(hours);
    return dataJson({ requestId, data });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'developer-control-tower-failed',
      message: error instanceof Error ? error.message : 'Failed to load control tower.',
      status: 500,
    });
  }
}
