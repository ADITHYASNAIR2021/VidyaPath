import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { isRedisRateLimitConfigured } from '@/lib/security/redis-rate-limit';

export const dynamic = 'force-dynamic';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  db: 'ok' | 'error' | 'unconfigured';
  redis: 'ok' | 'error' | 'unconfigured';
  version: string;
  region: string;
  timestamp: string;
  uptime: number;
}

async function checkDatabase(): Promise<'ok' | 'error' | 'unconfigured'> {
  try {
    const { isSupabaseServiceConfigured, supabaseSelect } = await import('@/lib/supabase-rest');
    if (!isSupabaseServiceConfigured()) return 'unconfigured';
    // Minimal DB ping — just check app_state table exists
    await supabaseSelect('app_state', { select: 'key', filters: [], limit: 1 });
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkRedis(): Promise<'ok' | 'error' | 'unconfigured'> {
  if (!isRedisRateLimitConfigured()) return 'unconfigured';
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) return 'unconfigured';
    const res = await fetch(`${url}/ping`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

const startTime = Date.now();

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);

  const status: HealthStatus['status'] =
    db === 'error' || redis === 'error' ? 'degraded' : 'ok';

  const body: HealthStatus = {
    status,
    db,
    redis,
    version: process.env.npm_package_version ?? '0.1.0',
    region: process.env.VERCEL_REGION ?? process.env.FLY_REGION ?? 'local',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };

  const httpStatus = status === 'ok' ? 200 : 207;
  return Response.json({ ok: status === 'ok', requestId, data: body }, { status: httpStatus });
}
