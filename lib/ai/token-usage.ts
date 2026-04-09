import type { RequestAuthContext } from '@/lib/auth/guards';
import { recordTokenUsageEvent } from '@/lib/platform-rbac-db';

function estimateTokensFromText(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.round(normalized.length / 4));
}

export async function logAiUsage(input: {
  context: RequestAuthContext | null;
  endpoint: string;
  provider?: string;
  model?: string;
  promptText?: string;
  completionText?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  requestId?: string;
  estimated?: boolean;
}) {
  const promptTokens =
    typeof input.promptTokens === 'number' && Number.isFinite(input.promptTokens)
      ? Math.max(0, Math.round(input.promptTokens))
      : estimateTokensFromText(input.promptText || '');
  const completionTokens =
    typeof input.completionTokens === 'number' && Number.isFinite(input.completionTokens)
      ? Math.max(0, Math.round(input.completionTokens))
      : estimateTokensFromText(input.completionText || '');
  const totalTokens =
    typeof input.totalTokens === 'number' && Number.isFinite(input.totalTokens)
      ? Math.max(0, Math.round(input.totalTokens))
      : promptTokens + completionTokens;

  await recordTokenUsageEvent({
    schoolId: input.context?.schoolId,
    authUserId: input.context?.authUserId,
    role: input.context?.role,
    endpoint: input.endpoint,
    provider: input.provider || 'unknown',
    model: input.model,
    requestId: input.requestId,
    promptTokens,
    completionTokens,
    totalTokens,
    estimated: input.estimated ?? true,
  });
}
