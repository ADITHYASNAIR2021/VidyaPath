/**
 * AI token-cost guardrail.
 *
 * Enforces two limits:
 *   1. Per-request hard cap  — configurable via AI_MAX_TOKENS_PER_REQUEST (default 4000)
 *   2. Per-school daily budget — configurable via AI_DAILY_TOKEN_BUDGET_PER_SCHOOL (default 100,000)
 *
 * Storage: Upstash Redis when available, Supabase app_state table as fallback.
 * Counters expire automatically (24-hour rolling window).
 *
 * Usage:
 *   const guard = await checkAiTokenBudget({ schoolId, requestedTokens: estimatedMax });
 *   if (!guard.allowed) return Response.json({ error: 'token-budget-exceeded' }, { status: 429 });
 */
import { logger } from '@/lib/logger';

// ── Config ───────────────────────────────────────────────────────────────

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

const WINDOW_SECONDS = 24 * 60 * 60; // 24 hours

// ── Redis client (lazy) ──────────────────────────────────────────────────

function getRedisClient() {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) return null;
    // Dynamic import to avoid loading Redis in edge contexts that don't need it
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

// ── Supabase fallback ────────────────────────────────────────────────────

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
    // Expire stale counters (>24h)
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

// ── Public API ───────────────────────────────────────────────────────────

export interface TokenBudgetResult {
  allowed: boolean;
  /** Approximate tokens remaining in the current window (may be stale under high concurrency). */
  remaining: number;
  /** Tokens requested for this call. */
  requested: number;
  /** Budget limit that was checked. */
  limit: number;
  /** Reason code when not allowed. */
  reason?: 'per-request-cap' | 'school-daily-budget' | 'global-daily-budget';
}

/**
 * Check and decrement the AI token budget for a given school.
 * Call BEFORE making the AI request.
 *
 * @param schoolId  Optional; if absent, only the global budget is checked.
 * @param requestedTokens  Estimated upper-bound tokens for the request.
 */
export async function checkAiTokenBudget(input: {
  schoolId?: string | null;
  requestedTokens: number;
}): Promise<TokenBudgetResult> {
  const { schoolId, requestedTokens } = input;

  // 1. Hard per-request cap
  if (requestedTokens > MAX_TOKENS_PER_REQUEST) {
    return {
      allowed: false,
      remaining: 0,
      requested: requestedTokens,
      limit: MAX_TOKENS_PER_REQUEST,
      reason: 'per-request-cap',
    };
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const schoolKey = schoolId ? `ai:tokens:school:${schoolId}:${today}` : null;
  const globalKey = `ai:tokens:global:${today}`;

  try {
    const redis = getRedisClient();

    if (redis) {
      // ── Redis path (atomic) ─────────────────────────────────────────
      const pipeline: Array<Promise<unknown>> = [];

      if (schoolKey) {
        const schoolTotal = await redis.incrby(schoolKey, requestedTokens);
        await redis.expire(schoolKey, WINDOW_SECONDS + 3600); // +1h grace
        if (schoolTotal > DAILY_BUDGET_PER_SCHOOL) {
          return {
            allowed: false,
            remaining: 0,
            requested: requestedTokens,
            limit: DAILY_BUDGET_PER_SCHOOL,
            reason: 'school-daily-budget',
          };
        }
        const schoolRemaining = Math.max(0, DAILY_BUDGET_PER_SCHOOL - schoolTotal);
        // Global check
        const globalTotal = await redis.incrby(globalKey, requestedTokens);
        await redis.expire(globalKey, WINDOW_SECONDS + 3600);
        if (globalTotal > DAILY_BUDGET_GLOBAL) {
          return {
            allowed: false,
            remaining: 0,
            requested: requestedTokens,
            limit: DAILY_BUDGET_GLOBAL,
            reason: 'global-daily-budget',
          };
        }
        return {
          allowed: true,
          remaining: Math.min(schoolRemaining, Math.max(0, DAILY_BUDGET_GLOBAL - globalTotal)),
          requested: requestedTokens,
          limit: DAILY_BUDGET_PER_SCHOOL,
        };
      } else {
        const globalTotal = await redis.incrby(globalKey, requestedTokens);
        await redis.expire(globalKey, WINDOW_SECONDS + 3600);
        if (globalTotal > DAILY_BUDGET_GLOBAL) {
          return {
            allowed: false,
            remaining: 0,
            requested: requestedTokens,
            limit: DAILY_BUDGET_GLOBAL,
            reason: 'global-daily-budget',
          };
        }
        return {
          allowed: true,
          remaining: Math.max(0, DAILY_BUDGET_GLOBAL - globalTotal),
          requested: requestedTokens,
          limit: DAILY_BUDGET_GLOBAL,
        };
      }
      void pipeline; // suppress unused warning
    } else {
      // ── Supabase fallback ────────────────────────────────────────────
      if (schoolKey) {
        const schoolCurrent = await getSupabaseTokenCount(schoolKey);
        if (schoolCurrent + requestedTokens > DAILY_BUDGET_PER_SCHOOL) {
          return {
            allowed: false,
            remaining: 0,
            requested: requestedTokens,
            limit: DAILY_BUDGET_PER_SCHOOL,
            reason: 'school-daily-budget',
          };
        }
        await incrSupabaseTokenCount(schoolKey, requestedTokens);
      }
      const globalCurrent = await getSupabaseTokenCount(globalKey);
      if (globalCurrent + requestedTokens > DAILY_BUDGET_GLOBAL) {
        return {
          allowed: false,
          remaining: 0,
          requested: requestedTokens,
          limit: DAILY_BUDGET_GLOBAL,
          reason: 'global-daily-budget',
        };
      }
      await incrSupabaseTokenCount(globalKey, requestedTokens);
      return {
        allowed: true,
        remaining: Math.max(0, DAILY_BUDGET_GLOBAL - globalCurrent - requestedTokens),
        requested: requestedTokens,
        limit: DAILY_BUDGET_GLOBAL,
      };
    }
  } catch (err) {
    // Fail-open: if budget tracking fails, allow the request but log it
    logger.warn({ err, schoolId }, 'AI token budget check failed — failing open');
    return {
      allowed: true,
      remaining: MAX_TOKENS_PER_REQUEST,
      requested: requestedTokens,
      limit: MAX_TOKENS_PER_REQUEST,
    };
  }
}
