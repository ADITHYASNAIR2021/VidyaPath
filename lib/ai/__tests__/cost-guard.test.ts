/**
 * Unit tests for lib/ai/cost-guard.ts (public platform: global daily budget, memory fallback).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalBudget = process.env.AI_DAILY_TOKEN_BUDGET_GLOBAL;

afterEach(() => {
  if (originalBudget === undefined) delete process.env.AI_DAILY_TOKEN_BUDGET_GLOBAL;
  else process.env.AI_DAILY_TOKEN_BUDGET_GLOBAL = originalBudget;
  vi.resetModules();
});

async function loadGuard() {
  // Counters live in process-wide shared state; start every test from a clean slate.
  delete (globalThis as Record<string, unknown>).__vidyapathRuntimeState__;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  return import('@/lib/ai/cost-guard');
}

describe('checkAiTokenBudget', () => {
  it('rejects requests above AI_MAX_TOKENS_PER_REQUEST (default 4000)', async () => {
    const { checkAiTokenBudget } = await loadGuard();
    const result = await checkAiTokenBudget({ requestedTokens: 99_999 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('per-request-cap');
    expect(result.remaining).toBe(0);
  });

  it('estimates tokens from projected input and output', async () => {
    const { checkAiTokenBudget } = await loadGuard();
    const result = await checkAiTokenBudget({
      endpoint: '/api/chapter-pack',
      projectedInputText: 'Electrostatics derivation for potential due to dipole.',
      projectedOutputTokens: 1200,
    });
    expect(result.allowed).toBe(true);
    expect(result.requested).toBeGreaterThan(1200);
  });

  it('blocks once the global daily budget is spent', async () => {
    process.env.AI_DAILY_TOKEN_BUDGET_GLOBAL = '10000';
    const { checkAiTokenBudget } = await loadGuard();
    for (let i = 0; i < 3; i += 1) {
      const ok = await checkAiTokenBudget({ requestedTokens: 3000 });
      expect(ok.allowed).toBe(true);
    }
    const blocked = await checkAiTokenBudget({ requestedTokens: 3000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('global-daily-budget');
  });

  it('handles missing numeric token fields without NaN', async () => {
    const { checkAiTokenBudget } = await loadGuard();
    const result = await checkAiTokenBudget({
      endpoint: '/api/test',
      projectedInputText: '',
      projectedOutputTokens: Number.NaN,
    });
    expect(Number.isFinite(result.requested)).toBe(true);
    expect(result.requested).toBeGreaterThanOrEqual(1);
  });
});
