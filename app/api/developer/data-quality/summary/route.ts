import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listCareerSourceIssues } from '@/lib/career-verification';
import { getDataQualitySummary } from '@/lib/data-quality';
import { getObservabilitySummary } from '@/lib/observability-summary';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);
  try {
    const [summary, careerIssues, observability] = await Promise.all([
      getDataQualitySummary(),
      listCareerSourceIssues(120),
      getObservabilitySummary(24),
    ]);
    const openCareerIssues = careerIssues.filter((issue) => issue.status !== 'resolved').length;
    return dataJson({
      requestId,
      data: {
        ...summary,
        careerSourceHealth: {
          totalIssues: careerIssues.length,
          openIssues: openCareerIssues,
        },
        observability,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build data quality summary.';
    return errorJson({
      requestId,
      errorCode: 'data-quality-summary-failed',
      message,
      status: 500,
    });
  }
}
