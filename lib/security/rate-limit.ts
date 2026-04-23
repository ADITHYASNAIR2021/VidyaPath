import { createHash } from 'node:crypto';
import {
  isSupabaseServiceConfigured,
  supabaseInsert,
  supabaseRpc,
  supabaseSelect,
  supabaseUpdate,
} from '@/lib/supabase-rest';
import { checkRateLimitRedis, isRedisRateLimitConfigured } from '@/lib/security/redis-rate-limit';

interface RequestThrottleRow {
  id: string;
  throttle_key: string;
  bucket_start: string;
  window_seconds: number;
  request_count: number;
  blocked_until: string | null;
  first_seen_at: string;
  last_seen_at: string;
  metadata: Record<string, unknown> | null;
}

interface RateLimitInput {
  key: string;
  windowSeconds: number;
  maxRequests: number;
  blockSeconds?: number;
  metadata?: Record<string, unknown>;
}

interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  limit: number;
}

interface RateLimitRpcRow {
  allowed: boolean;
  retry_after_seconds: number;
  remaining: number;
  limit: number;
}

const TABLE = 'request_throttle';

function normalizeKey(input: string): string {
  return input.trim().toLowerCase().slice(0, 240);
}

function hashKey(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function bucketStartIso(windowSeconds: number, nowMs: number): string {
  const windowMs = windowSeconds * 1000;
  const bucketMs = Math.floor(nowMs / windowMs) * windowMs;
  return new Date(bucketMs).toISOString();
}

function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function shouldFailOpen(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const configured = (process.env.RATE_LIMIT_FAIL_OPEN || '').trim().toLowerCase();
  if (configured === '1' || configured === 'true' || configured === 'yes') return true;
  if (configured === '0' || configured === 'false' || configured === 'no') return false;
  // Local/dev default remains fail-open for smoother setup.
  return true;
}

function fallbackDecision(limit: number): RateLimitDecision {
  if (shouldFailOpen()) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, limit - 1),
      limit,
    };
  }
  return {
    allowed: false,
    retryAfterSeconds: 30,
    remaining: 0,
    limit,
  };
}

export function buildRateLimitKey(prefix: string, parts: Array<string | undefined | null>): string {
  const cleanPrefix = normalizeKey(prefix || 'global');
  const cleanParts = parts
    .map((item) => normalizeKey(item || 'unknown'))
    .filter((item) => item.length > 0);
  return `${cleanPrefix}:${cleanParts.join(':')}`;
}

async function checkRateLimitViaRpc(input: {
  throttleKey: string;
  bucketStart: string;
  windowSeconds: number;
  limit: number;
  blockSeconds: number;
  metadata?: Record<string, unknown>;
}): Promise<RateLimitDecision | null> {
  try {
    const raw = await supabaseRpc<RateLimitRpcRow | RateLimitRpcRow[] | null>('check_rate_limit', {
      p_throttle_key: input.throttleKey,
      p_bucket_start: input.bucketStart,
      p_window_seconds: input.windowSeconds,
      p_limit: input.limit,
      p_block_seconds: input.blockSeconds,
      p_metadata: input.metadata ?? {},
    });
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row || typeof row.allowed !== 'boolean') return null;
    return {
      allowed: row.allowed,
      retryAfterSeconds: Math.max(0, Math.floor(Number(row.retry_after_seconds) || 0)),
      remaining: Math.max(0, Math.floor(Number(row.remaining) || 0)),
      limit: Math.max(1, Math.floor(Number(row.limit) || input.limit)),
    };
  } catch {
    return null;
  }
}

async function checkRateLimitLegacy(input: {
  throttleKey: string;
  bucketStart: string;
  windowSeconds: number;
  limit: number;
  blockSeconds: number;
  metadata?: Record<string, unknown>;
}): Promise<RateLimitDecision> {
  const nowMs = Date.now();

  const rows = await supabaseSelect<RequestThrottleRow>(TABLE, {
    select: '*',
    filters: [
      { column: 'throttle_key', value: input.throttleKey },
      { column: 'bucket_start', value: input.bucketStart },
    ],
    limit: 1,
  });
  const existing = rows[0];

  if (!existing) {
    await supabaseInsert<RequestThrottleRow>(TABLE, {
      throttle_key: input.throttleKey,
      bucket_start: input.bucketStart,
      window_seconds: input.windowSeconds,
      request_count: 1,
      first_seen_at: new Date(nowMs).toISOString(),
      last_seen_at: new Date(nowMs).toISOString(),
      blocked_until: null,
      metadata: input.metadata ?? null,
    });
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, input.limit - 1),
      limit: input.limit,
    };
  }

  const blockedUntilMs = parseDateMs(existing.blocked_until);
  if (blockedUntilMs && blockedUntilMs > nowMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((blockedUntilMs - nowMs) / 1000),
      remaining: 0,
      limit: input.limit,
    };
  }

  const nextCount = (Number(existing.request_count) || 0) + 1;
  if (nextCount > input.limit) {
    const blockedUntil = new Date(nowMs + input.blockSeconds * 1000).toISOString();
    await supabaseUpdate<RequestThrottleRow>(
      TABLE,
      {
        request_count: nextCount,
        last_seen_at: new Date(nowMs).toISOString(),
        blocked_until: blockedUntil,
      },
      [{ column: 'id', value: existing.id }]
    );
    return {
      allowed: false,
      retryAfterSeconds: input.blockSeconds,
      remaining: 0,
      limit: input.limit,
    };
  }

  await supabaseUpdate<RequestThrottleRow>(
    TABLE,
    {
      request_count: nextCount,
      last_seen_at: new Date(nowMs).toISOString(),
      blocked_until: null,
    },
    [{ column: 'id', value: existing.id }]
  );

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, input.limit - nextCount),
    limit: input.limit,
  };
}

export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitDecision> {
  const limit = Math.max(1, Math.min(5000, Math.floor(input.maxRequests)));
  const windowSeconds = Math.max(5, Math.min(86400, Math.floor(input.windowSeconds)));
  const blockSeconds = Math.max(5, Math.min(86400, Math.floor(input.blockSeconds || windowSeconds)));

  const key = normalizeKey(input.key);
  if (!key) {
    return fallbackDecision(limit);
  }

  // ── Fast path: Redis/Upstash ────────────────────────────────────────────
  if (isRedisRateLimitConfigured()) {
    const redisDecision = await checkRateLimitRedis({
      throttleKey: hashKey(key),
      windowSeconds,
      limit,
      blockSeconds,
    });
    if (redisDecision) return redisDecision;
    // null = Redis error → fall through to DB
  }

  // ── Slow path: Supabase DB ──────────────────────────────────────────────
  if (!isSupabaseServiceConfigured()) {
    return fallbackDecision(limit);
  }

  const rpcInput = {
    throttleKey: hashKey(key),
    bucketStart: bucketStartIso(windowSeconds, Date.now()),
    windowSeconds,
    limit,
    blockSeconds,
    metadata: input.metadata,
  };

  const rpcDecision = await checkRateLimitViaRpc(rpcInput);
  if (rpcDecision) return rpcDecision;

  try {
    return await checkRateLimitLegacy(rpcInput);
  } catch {
    return fallbackDecision(limit);
  }
}
