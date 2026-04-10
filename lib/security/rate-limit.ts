import { createHash } from 'node:crypto';
import { isSupabaseServiceConfigured, supabaseInsert, supabaseSelect, supabaseUpdate } from '@/lib/supabase-rest';

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

export function buildRateLimitKey(prefix: string, parts: Array<string | undefined | null>): string {
  const cleanPrefix = normalizeKey(prefix || 'global');
  const cleanParts = parts
    .map((item) => normalizeKey(item || 'unknown'))
    .filter((item) => item.length > 0);
  return `${cleanPrefix}:${cleanParts.join(':')}`;
}

export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitDecision> {
  const limit = Math.max(1, Math.min(5000, Math.floor(input.maxRequests)));
  const windowSeconds = Math.max(5, Math.min(86400, Math.floor(input.windowSeconds)));
  const blockSeconds = Math.max(5, Math.min(86400, Math.floor(input.blockSeconds || windowSeconds)));
  const nowMs = Date.now();

  if (!isSupabaseServiceConfigured()) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: limit - 1,
      limit,
    };
  }

  const key = normalizeKey(input.key);
  if (!key) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: limit - 1,
      limit,
    };
  }
  const throttleKey = hashKey(key);
  const bucketStart = bucketStartIso(windowSeconds, nowMs);

  const rows = await supabaseSelect<RequestThrottleRow>(TABLE, {
    select: '*',
    filters: [
      { column: 'throttle_key', value: throttleKey },
      { column: 'bucket_start', value: bucketStart },
    ],
    limit: 1,
  }).catch(() => []);
  const existing = rows[0];

  if (!existing) {
    await supabaseInsert<RequestThrottleRow>(TABLE, {
      throttle_key: throttleKey,
      bucket_start: bucketStart,
      window_seconds: windowSeconds,
      request_count: 1,
      first_seen_at: new Date(nowMs).toISOString(),
      last_seen_at: new Date(nowMs).toISOString(),
      blocked_until: null,
      metadata: input.metadata ?? null,
    }).catch(() => undefined);
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, limit - 1),
      limit,
    };
  }

  const blockedUntilMs = parseDateMs(existing.blocked_until);
  if (blockedUntilMs && blockedUntilMs > nowMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((blockedUntilMs - nowMs) / 1000),
      remaining: 0,
      limit,
    };
  }

  const nextCount = (Number(existing.request_count) || 0) + 1;
  if (nextCount > limit) {
    const retryAfter = blockSeconds;
    const blockedUntil = new Date(nowMs + blockSeconds * 1000).toISOString();
    await supabaseUpdate<RequestThrottleRow>(
      TABLE,
      {
        request_count: nextCount,
        last_seen_at: new Date(nowMs).toISOString(),
        blocked_until: blockedUntil,
      },
      [{ column: 'id', value: existing.id }]
    ).catch(() => undefined);
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      remaining: 0,
      limit,
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
  ).catch(() => undefined);

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, limit - nextCount),
    limit,
  };
}
