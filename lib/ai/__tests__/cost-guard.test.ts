/**
 * Unit tests for lib/ai/cost-guard.ts
 */
import { describe, expect, it } from 'vitest';
import { checkAiTokenBudget, type TokenBudgetResult } from '@/lib/ai/cost-guard';

describe('checkAiTokenBudget', () => {
  it('rejects requests above AI_MAX_TOKENS_PER_REQUEST (default 4000)', async () => {
    const result = await checkAiTokenBudget({
      schoolId: null,
      requestedTokens: 99_999,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('per-request-cap');
    expect(result.remaining).toBe(0);
  });

  it('accepts rich route input and computes requested token estimate internally', async () => {
    const projectedInputText = 'Electrostatics derivation for potential due to dipole.';
    const result = await checkAiTokenBudget({
      context: { schoolId: 'sch_test' },
      endpoint: '/api/chapter-pack',
      projectedInputText,
      projectedOutputTokens: 1200,
    });

    expect(typeof result.allowed).toBe('boolean');
    expect(result.requested).toBeGreaterThan(1200);
    expect(result.reason ?? 'ok').not.toBe('per-request-cap');
  });

  it('uses backward-compatible legacy shape', async () => {
    const result: TokenBudgetResult = await checkAiTokenBudget({
      requestedTokens: 200,
    });
    expect('allowed' in result).toBe(true);
    expect('remaining' in result).toBe(true);
    expect('requested' in result).toBe(true);
    expect('limit' in result).toBe(true);
    expect(result.requested).toBe(200);
  });

  it('handles missing numeric token fields without NaN', async () => {
    const result = await checkAiTokenBudget({
      context: { schoolId: 'sch_test' },
      endpoint: '/api/test',
      projectedInputText: '',
      projectedOutputTokens: Number.NaN,
    });
    expect(result).toBeDefined();
    expect(Number.isFinite(result.requested)).toBe(true);
    expect(result.requested).toBeGreaterThanOrEqual(1);
  });
});
