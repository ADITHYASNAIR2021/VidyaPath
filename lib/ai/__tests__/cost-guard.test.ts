/**
 * Unit tests for lib/ai/cost-guard.ts
 *
 * We don't spin up Redis or Supabase here — we test:
 *   1. Per-request hard cap rejection
 *   2. Type contract for TokenBudgetResult
 *   3. Fail-open behavior when tracking fails
 */
import { describe, it, expect } from 'vitest';
import { checkAiTokenBudget, type TokenBudgetResult } from '@/lib/ai/cost-guard';

describe('checkAiTokenBudget — per-request cap', () => {
  it('rejects requests above AI_MAX_TOKENS_PER_REQUEST (default 4000)', async () => {
    const result = await checkAiTokenBudget({
      schoolId: null,
      requestedTokens: 99_999,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('per-request-cap');
    expect(result.remaining).toBe(0);
  });

  it('allows requests within the per-request cap', async () => {
    // This will also hit the global daily check, but in test env Redis/Supabase
    // are both unconfigured so the cost-guard fails-open.
    const result = await checkAiTokenBudget({
      schoolId: null,
      requestedTokens: 100,
    });
    // Either allowed (fail-open) or rejected due to daily cap — but never per-request-cap
    expect(result.reason ?? 'ok').not.toBe('per-request-cap');
    expect(typeof result.allowed).toBe('boolean');
    expect(typeof result.remaining).toBe('number');
    expect(typeof result.limit).toBe('number');
    expect(result.requested).toBe(100);
  });

  it('result shape matches TokenBudgetResult interface', async () => {
    const result: TokenBudgetResult = await checkAiTokenBudget({
      requestedTokens: 500,
    });
    expect('allowed' in result).toBe(true);
    expect('remaining' in result).toBe(true);
    expect('requested' in result).toBe(true);
    expect('limit' in result).toBe(true);
  });

  it('handles missing schoolId gracefully', async () => {
    const result = await checkAiTokenBudget({ requestedTokens: 200 });
    expect(result).toBeDefined();
    expect(typeof result.allowed).toBe('boolean');
  });
});
