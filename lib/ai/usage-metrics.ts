import { logger } from '@/lib/logger';
import { sharedState } from '@/lib/runtime/shared-state';

/**
 * Lightweight daily AI usage metrics for the developer console.
 *
 * Counters are keyed by UTC day. With Upstash configured they are shared by every
 * server instance (Redis hash per day, kept 8 days); otherwise they live in this
 * process's memory (reset on restart / per serverless instance).
 */

const RETENTION_DAYS = 8;

type Counters = Record<string, number>;

interface RedisHashClient {
  hincrby(key: string, field: string, increment: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  hgetall<T extends Record<string, unknown>>(key: string): Promise<T | null>;
}

const memoryDays = sharedState('ai-usage-metrics', () => new Map<string, Counters>());
const redisHolder = sharedState<{ client: RedisHashClient | null | undefined }>('ai-usage-redis', () => ({ client: undefined }));

function getRedis(): RedisHashClient | null {
  if (redisHolder.client !== undefined) return redisHolder.client;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    redisHolder.client = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis');
    redisHolder.client = new Redis({ url, token }) as RedisHashClient;
  } catch {
    redisHolder.client = null;
  }
  return redisHolder.client;
}

export function usageBackend(): 'redis' | 'memory' {
  return getRedis() ? 'redis' : 'memory';
}

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function safeField(input: string): string {
  return input.replace(/[^a-zA-Z0-9/_.:\-|]/g, '_').slice(0, 120);
}

async function increment(fields: Record<string, number>): Promise<void> {
  const day = dayKey();
  const redis = getRedis();
  if (redis) {
    const key = `vp:ai-metrics:${day}`;
    await Promise.all(Object.entries(fields).map(([field, value]) => redis.hincrby(key, field, Math.round(value))));
    await redis.expire(key, RETENTION_DAYS * 86_400);
    return;
  }
  const counters = memoryDays.get(day) ?? {};
  for (const [field, value] of Object.entries(fields)) counters[field] = (counters[field] ?? 0) + value;
  memoryDays.set(day, counters);
  if (memoryDays.size > RETENTION_DAYS) {
    const oldest = [...memoryDays.keys()].sort()[0];
    memoryDays.delete(oldest);
  }
}

function fireAndForget(task: Promise<void>): void {
  task.catch((error) => logger.warn({ err: String(error).slice(0, 200) }, '[usage-metrics] write failed'));
}

/** Called once per AI route request (see withAiMetrics). */
export function recordAiRequest(input: { endpoint: string; status: number; latencyMs: number }): void {
  const ep = safeField(input.endpoint);
  const outcome = input.status === 429 ? 'limited' : input.status >= 500 ? 'errors' : input.status >= 400 ? 'rejected' : 'ok';
  fireAndForget(
    increment({
      requests: 1,
      [outcome]: 1,
      latencyMs: Math.max(0, input.latencyMs),
      [`ep:${ep}:requests`]: 1,
      [`ep:${ep}:${outcome}`]: 1,
      [`ep:${ep}:latencyMs`]: Math.max(0, input.latencyMs),
    })
  );
}

/** Called from logAiUsage after each successful model call. */
export function recordAiTokens(input: { endpoint: string; provider: string; model?: string; totalTokens: number }): void {
  const ep = safeField(input.endpoint);
  const pm = safeField(`${input.provider}|${input.model || 'unknown'}`);
  const tokens = Math.max(0, Math.round(input.totalTokens));
  fireAndForget(
    increment({
      tokens,
      modelCalls: 1,
      [`ep:${ep}:tokens`]: tokens,
      [`pm:${pm}:calls`]: 1,
      [`pm:${pm}:tokens`]: tokens,
    })
  );
}

export interface EndpointUsage {
  endpoint: string;
  requests: number;
  ok: number;
  errors: number;
  limited: number;
  rejected: number;
  avgLatencyMs: number;
  tokens: number;
}

export interface DayUsage {
  day: string;
  requests: number;
  ok: number;
  errors: number;
  limited: number;
  rejected: number;
  tokens: number;
  avgLatencyMs: number;
}

export interface UsageSummary {
  backend: 'redis' | 'memory';
  days: DayUsage[];
  today: { endpoints: EndpointUsage[]; models: Array<{ provider: string; model: string; calls: number; tokens: number }> };
}

async function readDay(day: string): Promise<Counters> {
  const redis = getRedis();
  if (redis) {
    const raw = (await redis.hgetall<Record<string, unknown>>(`vp:ai-metrics:${day}`).catch(() => null)) ?? {};
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Number(value) || 0]));
  }
  return memoryDays.get(day) ?? {};
}

export async function getUsageSummary(days = 7): Promise<UsageSummary> {
  const dayKeys = Array.from({ length: days }, (_, index) => dayKey(new Date(Date.now() - index * 86_400_000)));
  const counters = await Promise.all(dayKeys.map(readDay));

  const daySummaries: DayUsage[] = dayKeys.map((day, index) => {
    const c = counters[index];
    const requests = c.requests ?? 0;
    return {
      day,
      requests,
      ok: c.ok ?? 0,
      errors: c.errors ?? 0,
      limited: c.limited ?? 0,
      rejected: c.rejected ?? 0,
      tokens: c.tokens ?? 0,
      avgLatencyMs: requests > 0 ? Math.round((c.latencyMs ?? 0) / requests) : 0,
    };
  });

  const today = counters[0];
  const endpoints = new Map<string, EndpointUsage>();
  const models = new Map<string, { provider: string; model: string; calls: number; tokens: number }>();
  for (const [field, value] of Object.entries(today)) {
    if (field.startsWith('ep:')) {
      const lastColon = field.lastIndexOf(':');
      const endpoint = field.slice(3, lastColon);
      const metric = field.slice(lastColon + 1);
      const row = endpoints.get(endpoint) ?? { endpoint, requests: 0, ok: 0, errors: 0, limited: 0, rejected: 0, avgLatencyMs: 0, tokens: 0 };
      if (metric === 'latencyMs') row.avgLatencyMs += value;
      else if (metric in row) (row as unknown as Record<string, number>)[metric] += value;
      endpoints.set(endpoint, row);
    } else if (field.startsWith('pm:')) {
      const lastColon = field.lastIndexOf(':');
      const [provider, model] = field.slice(3, lastColon).split('|');
      const metric = field.slice(lastColon + 1);
      const row = models.get(`${provider}|${model}`) ?? { provider, model, calls: 0, tokens: 0 };
      if (metric === 'calls') row.calls += value;
      if (metric === 'tokens') row.tokens += value;
      models.set(`${provider}|${model}`, row);
    }
  }
  const endpointRows = [...endpoints.values()].map((row) => ({
    ...row,
    avgLatencyMs: row.requests > 0 ? Math.round(row.avgLatencyMs / row.requests) : 0,
  }));

  return {
    backend: usageBackend(),
    days: daySummaries,
    today: {
      endpoints: endpointRows.sort((a, b) => b.requests - a.requests),
      models: [...models.values()].sort((a, b) => b.tokens - a.tokens),
    },
  };
}
