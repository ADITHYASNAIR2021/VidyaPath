import { afterEach, expect, it, vi } from 'vitest';
import { requirePublicAiAccess } from '@/lib/ai/public-access';
const { limit } = vi.hoisted(() => ({ limit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/security/rate-limit', () => ({ buildRateLimitKey: () => 'fixture', checkRateLimit: limit }));
vi.mock('@/lib/security/redis-rate-limit', () => ({ isRedisRateLimitConfigured: () => true }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it('starts production AI paused even if keys and Redis are configured', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AI_PUBLIC_ENABLED', '');
  const result = await requirePublicAiAccess(new Request('https://example.com/api/ai-tutor'));
  expect(result.response?.status).toBe(503);
  expect((await result.response?.json()).errorCode).toBe('public-ai-paused');
  expect(limit).not.toHaveBeenCalled();
});
it('permits explicitly enabled production AI to reach the existing protection checks', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AI_PUBLIC_ENABLED', '1'); vi.stubEnv('AI_PUBLIC_PROVIDERS', 'groq');
  expect((await requirePublicAiAccess(new Request('https://example.com/api/ai-tutor'))).response).toBeNull();
  expect(limit).toHaveBeenCalledOnce();
});
it('requires a reviewed provider even when the public switch is enabled', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AI_PUBLIC_ENABLED', '1'); vi.stubEnv('AI_PUBLIC_PROVIDERS', 'gemini,unknown');
  const result = await requirePublicAiAccess(new Request('https://example.com/api/ai-tutor'));
  expect((await result.response?.json()).errorCode).toBe('public-ai-provider-unavailable');
  expect(limit).not.toHaveBeenCalled();
});
it('supports an immediate operator pause without consuming quota', async () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AI_PUBLIC_ENABLED', '0');
  expect((await requirePublicAiAccess(new Request('https://example.com/api/ai-tutor'))).response?.status).toBe(503);
  expect(limit).not.toHaveBeenCalled();
});
