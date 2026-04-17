import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { validateRuntimeEnv } from '@/lib/runtime-env';
import { getServiceClient, isSupabaseServiceConfigured } from '@/lib/supabase-rest';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const validation = validateRuntimeEnv();

  if (!validation.ok) {
    return errorJson({
      requestId,
      errorCode: 'runtime-env-invalid',
      message: 'Runtime environment validation failed.',
      status: 503,
      hint: validation.issues.map((issue) => `${issue.name}:${issue.reason}`).join(', '),
    });
  }

  if (!isSupabaseServiceConfigured()) {
    return errorJson({
      requestId,
      errorCode: 'supabase-not-configured',
      message: 'Supabase service connection is not configured.',
      status: 503,
    });
  }

  const client = getServiceClient();
  const { error: pingError } = await client.from('schools').select('id', { head: true, count: 'exact' }).limit(1);
  if (pingError) {
    return errorJson({
      requestId,
      errorCode: 'db-ping-failed',
      message: `Database ping failed: ${pingError.message || 'unknown error'}`,
      status: 503,
    });
  }

  return dataJson({
    requestId,
    data: {
      status: 'ready',
      db: 'ok',
      checkedAt: validation.checkedAt,
      mode: validation.mode,
    },
  });
}
