import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { runCareerSourceVerification } from '@/lib/career-verification';
import { hasValidCronAuthorization, isVercelCronRequest } from '@/lib/security/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const isCron = isVercelCronRequest(req);
  if (isCron && !hasValidCronAuthorization(req)) {
    return unauthorizedJson('Invalid cron authorization.', requestId);
  }

  if (!isCron) {
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
