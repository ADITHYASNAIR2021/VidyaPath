/**
 * AI token-cost guardrail for the public platform.
 *
 * Enforces:
 *   1) per-request hard cap (AI_MAX_TOKENS_PER_REQUEST, default 4000)
 *   2) global daily budget across all visitors (AI_DAILY_TOKEN_BUDGET_GLOBAL, default 1,000,000)
 *
 * Counters live in Upstash Redis when configured, otherwise in process memory
 * (per server instance — configure Upstash in production for a hard global cap).
 */
import { logger } from '@/lib/logger';
import { sharedState } from '@/lib/runtime/shared-state';

const WINDOW_SECONDS = 24 * 60 * 60;

function maxTokensPerRequest(): number {
  return Math.max(256, Math.min(32_768, Number(process.env.AI_MAX_TOKENS_PER_REQUEST) || 4_000));
}

function dailyBudgetGlobal(): number {
  return Math.max(10_000, Math.min(100_000_000, Number(process.env.AI_DAILY_TOKEN_BUDGET_GLOBAL) || 1_000_000));
}

interface CounterClient {
  incrby(key: string, delta: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get(key: string): Promise<number | string | null>;
}

let redisClient: CounterClient | null | undefined;

function getRedisClient(): CounterClient | null {
  if (redisClient !== undefined) return redisClient;
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) {
      redisClient = null;
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis');
    redisClient = new Redis({ url, token }) as CounterClient;
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

const memoryCounters = sharedState('ai-budget-counters', () => new Map<string, number>());

async function incrementCounter(key: string, delta: number): Promise<number> {
  const redis = getRedisClient();
  if (redis) {
    const total = await redis.incrby(key, delta);
    await redis.expire(key, WINDOW_SECONDS + 3600);
    return total;
  }
  const next = (memoryCounters.get(key) ?? 0) + delta;
  memoryCounters.set(key, next);
  if (memoryCounters.size > 64) {
    const today = new Date().toISOString().slice(0, 10);
    for (const existing of memoryCounters.keys()) {
      if (!existing.endsWith(today)) memoryCounters.delete(existing);
    }
  }
  return next;
}

export interface TokenBudgetResult {
  allowed: boolean;
  remaining: number;
  requested: number;
  limit: number;
  reason?: 'per-request-cap' | 'global-daily-budget';
}

export interface TokenBudgetInput {
  endpoint?: string;
  projectedInputText?: string;
  projectedOutputTokens?: number;
  requestedTokens?: number;
}

function estimateTokens(text: string): number {
  const normalized = String(text || '').trim();
  if (!normalized) return 0;
  return Math.max(1, Math.round(normalized.length / 4));
}

function toStrictTokenInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  return Math.floor(n);
}

function resolveRequestedTokens(input: TokenBudgetInput): number {
  const direct = toStrictTokenInt(input.requestedTokens);
  if (direct !== null && direct > 0) return direct;

  const projectedInput = estimateTokens(input.projectedInputText || '');
  const projectedOutput = toStrictTokenInt(input.projectedOutputTokens) ?? 0;
  return Math.max(1, projectedInput + projectedOutput);
}

/** Check and reserve token budget before an AI invocation. */
export async function checkAiTokenBudget(input: TokenBudgetInput): Promise<TokenBudgetResult> {
  const requestedTokens = resolveRequestedTokens(input);
  const perRequestCap = maxTokensPerRequest();
  const globalBudget = dailyBudgetGlobal();

  if (requestedTokens > perRequestCap) {
    return {
      allowed: false,
      remaining: 0,
      requested: requestedTokens,
      limit: perRequestCap,
      reason: 'per-request-cap',
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const globalKey = `ai:tokens:global:${today}`;
  const delta = Math.max(1, Math.floor(requestedTokens));

  try {
    const globalTotal = await incrementCounter(globalKey, delta);
    if (globalTotal > globalBudget) {
      return {
        allowed: false,
        remaining: 0,
        requested: delta,
        limit: globalBudget,
        reason: 'global-daily-budget',
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, globalBudget - globalTotal),
      requested: delta,
      limit: globalBudget,
    };
  } catch (err) {
    logger.warn({ err, endpoint: input.endpoint, requestedTokens: delta }, 'AI token budget check failed; failing open');
    return { allowed: true, remaining: perRequestCap, requested: delta, limit: perRequestCap };
  }
}

/** Today's global token usage for the developer console (reads only, never increments). */
export async function getGlobalBudgetUsage(): Promise<{
  used: number;
  limit: number;
  maxTokensPerRequest: number;
  resetsAt: string;
  backend: 'redis' | 'memory';
}> {
  const now = new Date();
  const key = `ai:tokens:global:${now.toISOString().slice(0, 10)}`;
  const redis = getRedisClient();
  let used = 0;
  if (redis) {
    used = Number(await redis.get(key).catch(() => 0)) || 0;
  } else {
    used = memoryCounters.get(key) ?? 0;
  }
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
  return {
    used,
    limit: dailyBudgetGlobal(),
    maxTokensPerRequest: maxTokensPerRequest(),
    resetsAt,
    backend: redis ? 'redis' : 'memory',
  };
}
