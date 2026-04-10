import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { runContextReindex } from '@/lib/data-quality';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);
  if (process.env.NODE_ENV === 'production') {
    return errorJson({
      requestId,
      errorCode: 'reindex-disabled-in-production',
      message: 'Context reindex is disabled on production runtime. Trigger via CI/CD job.',
      status: 403,
    });
  }
  const result = await runContextReindex();
  if (!result.ok) {
    return errorJson({
      requestId,
      errorCode: 'reindex-failed',
      message: 'Context reindex failed.',
      status: 500,
      hint: result.stderr || undefined,
    });
  }
  return dataJson({ requestId, data: result });
}
