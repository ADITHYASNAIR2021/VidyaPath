import { afterEach, describe, expect, it } from 'vitest';
import { checkRateLimit } from '@/lib/security/rate-limit';

const originalMode = process.env.RATE_LIMIT_USE_LOCAL_MEMORY;

afterEach(() => {
  if (originalMode === undefined) delete process.env.RATE_LIMIT_USE_LOCAL_MEMORY;
  else process.env.RATE_LIMIT_USE_LOCAL_MEMORY = originalMode;
});

describe('local demo rate limiter', () => {
  it('allows requests within the configured bucket', async () => {
    process.env.RATE_LIMIT_USE_LOCAL_MEMORY = '1';
    const decision = await checkRateLimit({
      key: `test:allow:${crypto.randomUUID()}`,
      windowSeconds: 60,
      maxRequests: 2,
      blockSeconds: 30,
    });
    expect(decision).toMatchObject({ allowed: true, remaining: 1, limit: 2 });
  });

  it('blocks and supplies a retry window after the limit', async () => {
    process.env.RATE_LIMIT_USE_LOCAL_MEMORY = '1';
    const key = `test:block:${crypto.randomUUID()}`;
    await checkRateLimit({ key, windowSeconds: 60, maxRequests: 2, blockSeconds: 30 });
    await checkRateLimit({ key, windowSeconds: 60, maxRequests: 2, blockSeconds: 30 });
    const decision = await checkRateLimit({ key, windowSeconds: 60, maxRequests: 2, blockSeconds: 30 });
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });
});
