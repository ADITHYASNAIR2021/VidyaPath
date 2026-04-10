import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { runCareerSourceVerification } from '@/lib/career-verification';

export const dynamic = 'force-dynamic';

function isVercelCronRequest(req: Request): boolean {
  const marker = req.headers.get('x-vercel-cron');
  return typeof marker === 'string' && marker.trim().length > 0;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  if (!isVercelCronRequest(req)) {
    const developerSession = await getDeveloperSessionFromRequestCookies();
    if (!developerSession) {
      return unauthorizedJson('Developer session required.', requestId);
    }
  }

  try {
    const result = await runCareerSourceVerification({ persistIssues: true });
    return dataJson({
      requestId,
      data: result,
      meta: { committedAt: new Date().toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Career source verification cron failed.';
    return errorJson({
      requestId,
      errorCode: 'career-source-cron-failed',
      message,
      status: 500,
    });
  }
}
