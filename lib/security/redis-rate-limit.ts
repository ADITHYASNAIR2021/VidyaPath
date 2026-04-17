/**
 * Redis-backed rate limiting via Upstash REST API.
 *
 * Uses a fixed-window counter implemented as:
 *   INCR  {key}:{bucket}
 *   EXPIRE {key}:{bucket} {windowSeconds}   (only on first increment)
 *
 * The Upstash REST API is edge-compatible (pure HTTP, no TCP socket).
 * Falls back to null when UPSTASH_REDIS_REST_URL / TOKEN are not set,
 * allowing callers to fall through to the DB-backed implementation.
 */
import { Redis } from '@upstash/redis';

export interface RedisRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  limit: number;
}

let _client: Redis | null = null;

function getClient(): Redis | null {
  if (_client) return _client;
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return null;
  try {
    _client = new Redis({ url, token });
    return _client;
  } catch {
    return null;
  }
}

export function isRedisRateLimitConfigured(): boolean {
  return getClient() !== null;
}

/** Fixed-window rate limit using Upstash Redis. */
export async function checkRateLimitRedis(input: {
  throttleKey: string;
  windowSeconds: number;
  limit: number;
  blockSeconds: number;
}): Promise<RedisRateLimitDecision | null> {
  const client = getClient();
  if (!client) return null;

  const { throttleKey, windowSeconds, limit, blockSeconds } = input;
  const nowMs = Date.now();
  const windowMs = windowSeconds * 1_000;
  const bucketIndex = Math.floor(nowMs / windowMs);
  const redisKey = `rl:${throttleKey}:${bucketIndex}`;
  const blockKey = `rl:blk:${throttleKey}`;

  try {
    // Check if currently blocked
    const blockedUntil = await client.get<number>(blockKey);
    if (blockedUntil && blockedUntil > nowMs) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((blockedUntil - nowMs) / 1_000),
        remaining: 0,
        limit,
      };
    }

    // Increment counter
    const [count] = await client.pipeline()
      .incr(redisKey)
      .expire(redisKey, windowSeconds + 5)
      .exec() as [number, number];

    const currentCount = Number(count) || 1;

    if (currentCount > limit) {
      const blockedUntilMs = nowMs + blockSeconds * 1_000;
      await client.set(blockKey, blockedUntilMs, { px: blockSeconds * 1_000 });
      return {
        allowed: false,
        retryAfterSeconds: blockSeconds,
        remaining: 0,
        limit,
      };
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, limit - currentCount),
      limit,
    };
  } catch {
    // If Redis fails, return null so caller falls back to DB
    return null;
  }
}
