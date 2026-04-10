import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import {
  listCareerSourceIssues,
  listCareerSourceTargets,
  runCareerSourceVerification,
} from '@/lib/career-verification';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);
  try {
    const issues = await listCareerSourceIssues(80);
    return dataJson({
      requestId,
      data: {
        targets: listCareerSourceTargets(),
        issues,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load career source issues.';
    return errorJson({
      requestId,
      errorCode: 'career-source-issues-read-failed',
      message,
      status: 500,
    });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 8 * 1024);
  let persistIssues = true;
  if (bodyResult.ok && typeof bodyResult.value.persistIssues === 'boolean') {
    persistIssues = Boolean(bodyResult.value.persistIssues);
  }

  try {
    const result = await runCareerSourceVerification({ persistIssues });
    return dataJson({
      requestId,
      data: result,
      meta: { committedAt: new Date().toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run career source verification.';
    return errorJson({
      requestId,
      errorCode: 'career-source-verify-failed',
      message,
      status: 500,
    });
  }
}
