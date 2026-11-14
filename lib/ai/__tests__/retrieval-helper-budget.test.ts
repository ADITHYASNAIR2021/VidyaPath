import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/ai/token-budget', () => ({ checkAiTokenBudget: vi.fn(async () => ({ allowed: true })) }));
import { checkAiTokenBudget } from '@/lib/ai/token-budget';
import { buildHyDEPassage } from '@/lib/ai/retrieval-llm';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('optional query helper', () => {
  it('reserves a separate full prompt allowance for each fallback provider', async () => {
    vi.stubEnv('AI_ENABLE_RETRIEVAL_LLM', '1'); vi.stubEnv('AI_RETRIEVAL_HELPER_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'AIza' + 't'.repeat(35)); vi.stubEnv('GROQ_API_KEY', 'gsk_' + 't'.repeat(35));
    const network = vi.fn(async (url: unknown) => String(url).includes('googleapis') ? new Response('{}', { status: 503 }) : Response.json({ choices: [{ message: { content: 'Acids have a pH below seven and turn blue litmus red. Bases turn red litmus blue.' } }] }));
    vi.stubGlobal('fetch', network);
    expect(await buildHyDEPassage({ query: 'Define pH for the budget regression fixture', classLevel: 10, subject: 'Chemistry' })).toContain('litmus');
    expect(network).toHaveBeenCalledTimes(2);
    expect(checkAiTokenBudget).toHaveBeenCalledTimes(2);
    for (const [input] of vi.mocked(checkAiTokenBudget).mock.calls) expect(input.projectedInputText).toContain('UNTRUSTED DATA');
  });
});
