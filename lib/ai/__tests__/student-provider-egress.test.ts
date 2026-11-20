import { afterEach, expect, it, vi } from 'vitest';
import { buildHyDEPassage } from '@/lib/ai/retrieval-llm';
import { verifySelfCheck } from '@/lib/ai/question-verifier';
import { POST } from '@/app/api/image-solve/route';

vi.mock('@/lib/ai/public-access', () => ({ requirePublicAiAccess: async () => ({ context: { clientIp: 'fixture' }, response: null }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('never sends production questions or images to Gemini, including helper fallback', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AI_PUBLIC_ENABLED', '1');
  vi.stubEnv('AI_PUBLIC_PROVIDERS', 'gemini');
  vi.stubEnv('AI_ENABLE_RETRIEVAL_LLM', '1'); vi.stubEnv('AI_ENABLE_SELF_VERIFY', '1');
  vi.stubEnv('GEMINI_API_KEY', 'AIza-fixture-key'); vi.stubEnv('GROQ_API_KEY', 'gsk_fixture-key-long-enough');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  expect(await buildHyDEPassage({ query: 'Explain acids and bases for this policy fixture', subject: 'Chemistry', classLevel: 10 })).toBeNull();
  expect(await verifySelfCheck([{ question: 'Acid?', options: ['A', 'B', 'C', 'D'], answer: 0, explanation: 'fixture' }], [])).toHaveLength(1);
  // Access is deliberately mocked open to exercise the image provider check itself.
  const response = await POST(new Request('https://example.com/api/image-solve', { method: 'POST', body: '{}' }));
  expect(response.status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});
