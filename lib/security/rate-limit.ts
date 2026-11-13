import { createHash } from 'node:crypto';
import { checkRateLimitRedis, isRedisRateLimitConfigured } from '@/lib/security/redis-rate-limit';
import { logger } from '@/lib/logger';
import { sharedState } from '@/lib/runtime/shared-state';

/**
 * Rate limiter for the public (no-login) platform.
 *
 * - Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set (shared across instances).
 * - Otherwise an in-process memory bucket (per server instance). This keeps the site
 *   usable with zero infrastructure; configure Upstash for real protection at scale.
 */

interface RateLimitInput {
  key: string;
  windowSeconds: number;
  maxRequests: number;
  blockSeconds?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  limit: number;
}

const localBuckets = sharedState(
  'rate-limit-buckets',
  () => new Map<string, { windowStartedAt: number; count: number; blockedUntil: number }>()
);
const memoryModeNotice = sharedState('rate-limit-memory-notice', () => ({ warned: false }));

function normalizeKey(input: string): string {
  return input.trim().toLowerCase().slice(0, 240);
}

function hashKey(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function checkRateLimitInMemory(input: {
  key: string;
  windowSeconds: number;
  limit: number;
  blockSeconds: number;
}): RateLimitDecision {
  const now = Date.now();
  const windowMs = input.windowSeconds * 1000;
  const existing = localBuckets.get(input.key);
  const bucket = !existing || now - existing.windowStartedAt >= windowMs
    ? { windowStartedAt: now, count: 0, blockedUntil: existing?.blockedUntil ?? 0 }
    : existing;

  if (bucket.blockedUntil > now) {
    localBuckets.set(input.key, bucket);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000)),
      remaining: 0,
      limit: input.limit,
    };
  }

  bucket.count += 1;
  if (bucket.count > input.limit) {
    bucket.blockedUntil = now + input.blockSeconds * 1000;
    localBuckets.set(input.key, bucket);
    return { allowed: false, retryAfterSeconds: input.blockSeconds, remaining: 0, limit: input.limit };
  }

  localBuckets.set(input.key, bucket);
  if (localBuckets.size > 10_000) {
    for (const [key, value] of localBuckets) {
      if (value.blockedUntil <= now && now - value.windowStartedAt >= windowMs) localBuckets.delete(key);
    }
  }
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, input.limit - bucket.count),
    limit: input.limit,
  };
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

  const key = normalizeKey(input.key);
  if (!key) {
    return { allowed: false, retryAfterSeconds: 30, remaining: 0, limit };
  }

  if (isRedisRateLimitConfigured()) {
    const redisDecision = await checkRateLimitRedis({
      throttleKey: hashKey(key),
      windowSeconds,
      limit,
      blockSeconds,
    });
    if (redisDecision) return redisDecision;
    // null = Redis error → fall back to the in-process limiter below.
  } else if (!memoryModeNotice.warned && process.env.NODE_ENV === 'production') {
    memoryModeNotice.warned = true;
    logger.warn('[rate-limit] Upstash Redis not configured; using per-instance memory limits.');
  }

  return checkRateLimitInMemory({ key, windowSeconds, limit, blockSeconds });
}
