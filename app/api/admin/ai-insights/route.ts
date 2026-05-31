import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { getAiQualitySummary } from '@/lib/ai/quality-store';
import { getTokenUsageRollup } from '@/lib/platform-rbac-db';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

function isAiEndpoint(endpoint: string): boolean {
  return endpoint.startsWith('/api/ai') || endpoint.startsWith('/api/generate-') || endpoint.startsWith('/api/chapter-');
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getAdminSessionFromRequestCookies();
  if (!session || !session.schoolId) return unauthorizedJson('Admin session required.', requestId);

  try {
    const url = new URL(req.url);
    const hours = Number(url.searchParams.get('hours') || '168');
    const [quality, usage] = await Promise.all([
      getAiQualitySummary(hours, { schoolId: session.schoolId }),
      getTokenUsageRollup({ schoolId: session.schoolId, limit: 1200 }),
    ]);

    const aiUsage = usage.records.filter((record) => isAiEndpoint(record.endpoint));
    const topEndpoints = [...aiUsage.reduce((map, record) => {
      const current = map.get(record.endpoint) ?? { endpoint: record.endpoint, events: 0, totalTokens: 0 };
      current.events += 1;
      current.totalTokens += Math.max(0, Number(record.totalTokens) || 0);
      map.set(record.endpoint, current);
      return map;
    }, new Map<string, { endpoint: string; events: number; totalTokens: number }>()).values()]
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 8);

    return dataJson({
      requestId,
      data: {
        schoolId: session.schoolId,
        quality,
        usage: {
          events: aiUsage.length,
          totalTokens: aiUsage.reduce((sum, record) => sum + Math.max(0, Number(record.totalTokens) || 0), 0),
          topEndpoints,
        },
      },
    });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'admin-ai-insights-failed',
      message: error instanceof Error ? error.message : 'Failed to load admin AI insights.',
      status: 500,
    });
  }
}
