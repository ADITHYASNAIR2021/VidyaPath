import { afterEach, expect, it, vi } from 'vitest';
import { getTaskChatModelCandidates } from '@/lib/ai/model-routing';
import { isStudentAiProviderAllowed } from '@/lib/ai/provider-policy';
afterEach(() => vi.unstubAllEnvs());

it('does not send production student data to providers just because keys exist', () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AI_PUBLIC_ENABLED', '1'); vi.stubEnv('AI_PUBLIC_PROVIDERS', '');
  expect(getTaskChatModelCandidates('chat')).toEqual([]);
});
it('restricts defaults and explicit model overrides to reviewed providers, excluding Gemini', () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AI_PUBLIC_ENABLED', '1'); vi.stubEnv('AI_PUBLIC_PROVIDERS', 'groq,gemini');
  vi.stubEnv('AI_TASK_MODEL_CHAT', 'GEMINI_25_FLASH,GROQ_GPT_OSS_20B');
  const models = getTaskChatModelCandidates('chat');
  expect(models.length).toBeGreaterThan(0);
  expect(models.every((model) => model.provider === 'groq')).toBe(true);
  expect(isStudentAiProviderAllowed('gemini')).toBe(false);
});
it('stops auxiliary hosted AI requests when public AI is paused', () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AI_PUBLIC_ENABLED', '0'); vi.stubEnv('AI_PUBLIC_PROVIDERS', 'groq,nvidia');
  expect(isStudentAiProviderAllowed('groq')).toBe(false);
  expect(isStudentAiProviderAllowed('nvidia')).toBe(false);
});
