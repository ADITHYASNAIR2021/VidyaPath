import { logger } from '@/lib/logger';
import { recordAiTokens } from '@/lib/ai/usage-metrics';

function estimateTokensFromText(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.round(normalized.length / 4));
}

/** Structured log line per AI call (picked up by the hosting provider's log drain). */
export async function logAiUsage(input: {
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

  recordAiTokens({ endpoint: input.endpoint, provider: input.provider || 'unknown', model: input.model, totalTokens });

  logger.info(
    {
      event: 'ai_usage',
      endpoint: input.endpoint,
      provider: input.provider || 'unknown',
      model: input.model,
      requestId: input.requestId,
      promptTokens,
      completionTokens,
      totalTokens,
      estimated: input.estimated ?? true,
    },
    'ai usage'
  );
}
