import { checkAiTokenBudget as reserveGlobalBudget } from '@/lib/ai/cost-guard';

export interface TokenBudgetDecision {
  allowed: boolean;
  reason?: 'per-request-cap' | 'global-daily-budget' | 'budget-unavailable';
  retryAfterSeconds?: number;
}

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
}

/**
 * Route-facing budget check. Every AI route calls this before generating.
 * There are no user accounts, so the budget is a single daily pool shared by
 * all visitors (per-IP fairness is handled by the rate limiter).
 */
export async function checkAiTokenBudget(input: {
  endpoint: string;
  projectedInputText?: string;
  projectedOutputTokens?: number;
  /** HTTP preflight does not reserve; the generation boundary reserves actual provider payloads. */
  reserve?: boolean;
}): Promise<TokenBudgetDecision> {
  if (input.reserve === false) {
    const cap = Math.max(256, Math.min(32768, Number(process.env.AI_MAX_TOKENS_PER_REQUEST) || 16000));
    const size = Math.ceil((input.projectedInputText?.length || 0) / 4) + (input.projectedOutputTokens || 0);
    return size <= cap ? { allowed: true } : { allowed: false, reason: 'per-request-cap', retryAfterSeconds: 5 };
  }
  const result = await reserveGlobalBudget(input);
  if (result.allowed) return { allowed: true };
  return {
    allowed: false,
    reason: result.reason,
    retryAfterSeconds: result.reason === 'global-daily-budget' ? secondsUntilUtcMidnight() : result.reason === 'budget-unavailable' ? 60 : 5,
  };
}
