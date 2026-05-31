import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { runRagBenchmark } from '@/lib/ai/rag-benchmark';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);

  try {
    const report = await runRagBenchmark();
    return dataJson({ requestId, data: report });
  } catch (error) {
    logger.error({ err: error }, '[developer/data-quality/rag-benchmark] failed');
    return errorJson({
      requestId,
      errorCode: 'rag-benchmark-failed',
      message: error instanceof Error ? error.message : 'Failed to run RAG benchmark.',
      status: 500,
    });
  }
}
