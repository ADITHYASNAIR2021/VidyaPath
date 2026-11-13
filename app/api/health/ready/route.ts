import { dataJson, getRequestId } from '@/lib/http/api-response';
import { validateEnv } from '@/lib/config/env-validation';

export const dynamic = 'force-dynamic';

/** Readiness: the site has no database, so it is ready whenever the process is up. */
export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const env = validateEnv('report');
  return dataJson({
    requestId,
    data: {
      status: 'ready',
      warnings: env.warnings.length,
      checkedAt: new Date().toISOString(),
      mode: process.env.NODE_ENV || 'development',
    },
  });
}
