import { getRequestId } from '@/lib/http/api-response';
import { isRedisRateLimitConfigured } from '@/lib/security/redis-rate-limit';

export const dynamic = 'force-dynamic';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  db: 'ok' | 'error' | 'unconfigured';
  redis: 'ok' | 'error' | 'unconfigured';
  llm: 'ok' | 'error' | 'unconfigured';
  version: string;
  region: string;
  timestamp: string;
  uptime: number;
}

async function checkDatabase(): Promise<'ok' | 'error' | 'unconfigured'> {
  try {
    const { isSupabaseServiceConfigured } = await import('@/lib/supabase-rest');
    if (!isSupabaseServiceConfigured()) return 'unconfigured';
    // Deep DB ping is exposed via /api/health/ready.
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

// ── LLM probe (30s module-level cache) ──────────────────────────────────────

let llmProbeCache: { result: 'ok' | 'error' | 'unconfigured'; expiresAt: number } | null = null;
const LLM_PROBE_TTL_MS = 30_000;

async function checkLlm(): Promise<'ok' | 'error' | 'unconfigured'> {
  if (llmProbeCache && Date.now() < llmProbeCache.expiresAt) {
    return llmProbeCache.result;
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  const nvidiaKey = process.env.NVIDIA_API_KEY?.trim();

  if (!groqKey && !nvidiaKey) {
    llmProbeCache = { result: 'unconfigured', expiresAt: Date.now() + LLM_PROBE_TTL_MS };
    return 'unconfigured';
  }

  let result: 'ok' | 'error' = 'error';

  // Try Groq first (cheaper ping endpoint)
  if (groqKey?.startsWith('gsk_')) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${groqKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) result = 'ok';
    } catch {
      // fall through to NVIDIA
    }
  }

  // Try NVIDIA as fallback
  if (result !== 'ok' && nvidiaKey) {
    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
        headers: { Authorization: `Bearer ${nvidiaKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) result = 'ok';
    } catch {
      result = 'error';
    }
  }

  llmProbeCache = { result, expiresAt: Date.now() + LLM_PROBE_TTL_MS };
  return result;
}

const startTime = Date.now();

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  const [db, redis, llm] = await Promise.all([checkDatabase(), checkRedis(), checkLlm()]);

  const status: HealthStatus['status'] =
    db === 'error' || redis === 'error' || llm === 'error' ? 'degraded' : 'ok';

  const body: HealthStatus = {
    status,
    db,
    redis,
    llm,
    version: process.env.npm_package_version ?? '0.1.0',
    region: process.env.VERCEL_REGION ?? process.env.FLY_REGION ?? 'local',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };

  const httpStatus = status === 'ok' ? 200 : 207;
  return Response.json({ ok: status === 'ok', requestId, data: body }, { status: httpStatus });
}
