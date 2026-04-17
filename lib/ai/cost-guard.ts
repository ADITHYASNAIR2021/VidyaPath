/**
 * AI token-cost guardrail.
 *
 * Enforces:
 *   1) per-request hard cap (AI_MAX_TOKENS_PER_REQUEST, default 4000)
 *   2) per-school daily budget (AI_DAILY_TOKEN_BUDGET_PER_SCHOOL, default 100000)
 *   3) global daily budget (AI_DAILY_TOKEN_BUDGET_GLOBAL, default 1000000)
 *
 * Usage (preferred route input):
 *   const guard = await checkAiTokenBudget({
 *     context,
 *     endpoint: '/api/ai-tutor',
 *     projectedInputText: userPrompt,
 *     projectedOutputTokens: 1800,
 *   });
 */
import { logger } from '@/lib/logger';

const MAX_TOKENS_PER_REQUEST = Math.max(
  256,
  Math.min(32_768, Number(process.env.AI_MAX_TOKENS_PER_REQUEST) || 4_000),
);

const DAILY_BUDGET_PER_SCHOOL = Math.max(
  1_000,
  Math.min(10_000_000, Number(process.env.AI_DAILY_TOKEN_BUDGET_PER_SCHOOL) || 100_000),
);

const DAILY_BUDGET_GLOBAL = Math.max(
  10_000,
  Math.min(100_000_000, Number(process.env.AI_DAILY_TOKEN_BUDGET_GLOBAL) || 1_000_000),
);

const WINDOW_SECONDS = 24 * 60 * 60;

function getRedisClient() {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) return null;
    const { Redis } = require('@upstash/redis');
    return new Redis({ url, token }) as {
      incrby(key: string, delta: number): Promise<number>;
      expire(key: string, seconds: number): Promise<number>;
      get(key: string): Promise<number | null>;
    };
  } catch {
    return null;
  }
}

async function getSupabaseTokenCount(key: string): Promise<number> {
  try {
    const { supabaseSelect } = await import('@/lib/supabase-rest');
    const rows = await supabaseSelect<{ value: string; updated_at: string }>('app_state', {
      select: 'value,updated_at',
      filters: [{ column: 'key', value: key }],
      limit: 1,
    }).catch(() => []);
    const row = rows[0];
    if (!row) return 0;
    const updated = Date.parse(row.updated_at);
    if (!Number.isFinite(updated) || Date.now() - updated > WINDOW_SECONDS * 1000) return 0;
    return Number(row.value) || 0;
  } catch {
    return 0;
  }
}

async function incrSupabaseTokenCount(key: string, delta: number): Promise<number> {
  try {
    const { supabaseInsert, supabaseUpdate, supabaseSelect } = await import('@/lib/supabase-rest');
    const rows = await supabaseSelect<{ value: string; updated_at: string }>('app_state', {
      select: 'value,updated_at',
      filters: [{ column: 'key', value: key }],
      limit: 1,
    }).catch(() => []);
    const row = rows[0];
    const now = new Date().toISOString();
    const current = (() => {
      if (!row) return 0;
      const updated = Date.parse(row.updated_at);
      if (!Number.isFinite(updated) || Date.now() - updated > WINDOW_SECONDS * 1000) return 0;
      return Number(row.value) || 0;
    })();
    const next = current + delta;

    if (row) {
      await supabaseUpdate('app_state', { value: String(next), updated_at: now }, [
        { column: 'key', value: key },
      ]).catch(() => {});
    } else {
      await supabaseInsert('app_state', { key, value: String(next), updated_at: now }).catch(() => {});
    }

    return next;
  } catch {
    return 0;
  }
}

export interface TokenBudgetResult {
  allowed: boolean;
  remaining: number;
  requested: number;
  limit: number;
  reason?: 'per-request-cap' | 'school-daily-budget' | 'global-daily-budget';
}

export interface TokenBudgetInput {
  context?: { schoolId?: string | null } | null;
  endpoint?: string;
  projectedInputText?: string;
  projectedOutputTokens?: number;
  schoolId?: string | null;
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

function resolveSchoolId(input: TokenBudgetInput): string | null {
  const fromContext = input.context?.schoolId;
  if (typeof fromContext === 'string' && fromContext.trim().length > 0) return fromContext.trim();
  if (typeof input.schoolId === 'string' && input.schoolId.trim().length > 0) return input.schoolId.trim();
  return null;
}

/**
 * Check and consume token budget before AI invocation.
 *
 * Accepts either:
 *   A) rich route shape: { context, endpoint, projectedInputText, projectedOutputTokens }
 *   B) legacy shape: { schoolId, requestedTokens }
 */
export async function checkAiTokenBudget(input: TokenBudgetInput): Promise<TokenBudgetResult> {
  const schoolId = resolveSchoolId(input);
  const requestedTokens = resolveRequestedTokens(input);

  if (requestedTokens > MAX_TOKENS_PER_REQUEST) {
    return {
      allowed: false,
      remaining: 0,
      requested: requestedTokens,
      limit: MAX_TOKENS_PER_REQUEST,
      reason: 'per-request-cap',
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const schoolKey = schoolId ? `ai:tokens:school:${schoolId}:${today}` : null;
  const globalKey = `ai:tokens:global:${today}`;
  const delta = Math.max(1, Math.floor(requestedTokens));

  try {
    const redis = getRedisClient();
    if (redis) {
      let schoolRemaining = DAILY_BUDGET_GLOBAL;
      if (schoolKey) {
        const schoolTotal = await redis.incrby(schoolKey, delta);
        await redis.expire(schoolKey, WINDOW_SECONDS + 3600);

        if (schoolTotal > DAILY_BUDGET_PER_SCHOOL) {
          return {
            allowed: false,
            remaining: 0,
            requested: delta,
            limit: DAILY_BUDGET_PER_SCHOOL,
            reason: 'school-daily-budget',
          };
        }
        schoolRemaining = Math.max(0, DAILY_BUDGET_PER_SCHOOL - schoolTotal);
      }

      const globalTotal = await redis.incrby(globalKey, delta);
      await redis.expire(globalKey, WINDOW_SECONDS + 3600);
      if (globalTotal > DAILY_BUDGET_GLOBAL) {
        return {
          allowed: false,
          remaining: 0,
          requested: delta,
          limit: DAILY_BUDGET_GLOBAL,
          reason: 'global-daily-budget',
        };
      }

      return {
        allowed: true,
        remaining: Math.min(schoolRemaining, Math.max(0, DAILY_BUDGET_GLOBAL - globalTotal)),
        requested: delta,
        limit: schoolKey ? DAILY_BUDGET_PER_SCHOOL : DAILY_BUDGET_GLOBAL,
      };
    }

    if (schoolKey) {
      const schoolCurrent = await getSupabaseTokenCount(schoolKey);
      if (schoolCurrent + delta > DAILY_BUDGET_PER_SCHOOL) {
        return {
          allowed: false,
          remaining: 0,
          requested: delta,
          limit: DAILY_BUDGET_PER_SCHOOL,
          reason: 'school-daily-budget',
        };
      }
      await incrSupabaseTokenCount(schoolKey, delta);
    }

    const globalCurrent = await getSupabaseTokenCount(globalKey);
    if (globalCurrent + delta > DAILY_BUDGET_GLOBAL) {
      return {
        allowed: false,
        remaining: 0,
        requested: delta,
        limit: DAILY_BUDGET_GLOBAL,
        reason: 'global-daily-budget',
      };
    }
    await incrSupabaseTokenCount(globalKey, delta);

    return {
      allowed: true,
      remaining: Math.max(0, DAILY_BUDGET_GLOBAL - globalCurrent - delta),
      requested: delta,
      limit: DAILY_BUDGET_GLOBAL,
    };
  } catch (err) {
    logger.warn(
      { err, schoolId, endpoint: input.endpoint, requestedTokens: delta },
      'AI token budget check failed; failing open'
    );
    return {
      allowed: true,
      remaining: MAX_TOKENS_PER_REQUEST,
      requested: delta,
      limit: MAX_TOKENS_PER_REQUEST,
    };
  }
}
