import type { RequestAuthContext } from '@/lib/auth/guards';
import { isSupabaseServiceConfigured, supabaseSelect } from '@/lib/supabase-rest';

interface TokenUsageRow {
  id: string;
  school_id: string | null;
  auth_user_id: string | null;
  total_tokens: number;
  created_at: string;
}

export interface TokenBudgetDecision {
  allowed: boolean;
  reason?: 'user-hourly-cap' | 'school-hourly-cap' | 'token-budget-unavailable';
  retryAfterSeconds?: number;
  remainingUserTokens?: number;
  remainingSchoolTokens?: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function estimateTokensFromText(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.round(normalized.length / 4));
}

function shouldFailOpenWhenUnavailable(): boolean {
  const configured = (process.env.AI_TOKEN_CAP_FAIL_OPEN || '').trim().toLowerCase();
  if (configured === '1' || configured === 'true' || configured === 'yes') return true;
  if (configured === '0' || configured === 'false' || configured === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}

export async function checkAiTokenBudget(input: {
  context: RequestAuthContext | null;
  endpoint: string;
  projectedInputText?: string;
  projectedOutputTokens?: number;
}): Promise<TokenBudgetDecision> {
  const userHourlyCap = parsePositiveInt(process.env.AI_TOKEN_CAP_USER_HOURLY, 120_000);
  const schoolHourlyCap = parsePositiveInt(process.env.AI_TOKEN_CAP_SCHOOL_HOURLY, 1_200_000);
  const retryAfterSeconds = parsePositiveInt(process.env.AI_TOKEN_CAP_RETRY_SECONDS, 300);

  if (!input.context?.authUserId) {
    return { allowed: true };
  }

  if (!isSupabaseServiceConfigured()) {
    if (shouldFailOpenWhenUnavailable()) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'token-budget-unavailable',
      retryAfterSeconds: Math.min(retryAfterSeconds, 120),
    };
  }

  const projectedInput = estimateTokensFromText(input.projectedInputText || '');
  const projectedOutput = Math.max(0, Math.floor(Number(input.projectedOutputTokens) || 0));
  const projectedTotal = projectedInput + projectedOutput;
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const userRows = await supabaseSelect<TokenUsageRow>('token_usage_events', {
    select: 'id,school_id,auth_user_id,total_tokens,created_at',
    filters: [
      { column: 'auth_user_id', value: input.context.authUserId },
      { column: 'created_at', op: 'gte', value: sinceIso },
    ],
    limit: 5000,
  }).catch(() => []);
  const userTotal = userRows.reduce((sum, row) => sum + Math.max(0, Number(row.total_tokens) || 0), 0);

  if (userTotal + projectedTotal > userHourlyCap) {
    return {
      allowed: false,
      reason: 'user-hourly-cap',
      retryAfterSeconds,
      remainingUserTokens: Math.max(0, userHourlyCap - userTotal),
    };
  }

  if (!input.context.schoolId) {
    return {
      allowed: true,
      remainingUserTokens: Math.max(0, userHourlyCap - (userTotal + projectedTotal)),
    };
  }

  const schoolRows = await supabaseSelect<TokenUsageRow>('token_usage_events', {
    select: 'id,school_id,auth_user_id,total_tokens,created_at',
    filters: [
      { column: 'school_id', value: input.context.schoolId },
      { column: 'created_at', op: 'gte', value: sinceIso },
    ],
    limit: 8000,
  }).catch(() => []);
  const schoolTotal = schoolRows.reduce((sum, row) => sum + Math.max(0, Number(row.total_tokens) || 0), 0);

  if (schoolTotal + projectedTotal > schoolHourlyCap) {
    return {
      allowed: false,
      reason: 'school-hourly-cap',
      retryAfterSeconds,
      remainingUserTokens: Math.max(0, userHourlyCap - (userTotal + projectedTotal)),
      remainingSchoolTokens: Math.max(0, schoolHourlyCap - schoolTotal),
    };
  }

  return {
    allowed: true,
    remainingUserTokens: Math.max(0, userHourlyCap - (userTotal + projectedTotal)),
    remainingSchoolTokens: Math.max(0, schoolHourlyCap - (schoolTotal + projectedTotal)),
  };
}
