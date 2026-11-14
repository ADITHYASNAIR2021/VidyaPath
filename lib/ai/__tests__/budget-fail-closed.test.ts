import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAiTokenBudget } from '@/lib/ai/cost-guard';
afterEach(() => vi.unstubAllEnvs());
describe('shared production budget', () => {
  it('does not fall back to an instance-local allowance without Redis in production', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('UPSTASH_REDIS_REST_URL', ''); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    expect(await checkAiTokenBudget({ requestedTokens: 200 })).toMatchObject({ allowed: false, reason: 'budget-unavailable' });
  });
});
