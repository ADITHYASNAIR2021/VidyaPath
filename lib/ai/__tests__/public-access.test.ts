import { afterEach, describe, expect, it } from 'vitest';
import { requirePublicAiAccess } from '@/lib/ai/public-access';

const original = process.env.AI_PUBLIC_DAILY_REQUESTS_PER_IP;

afterEach(() => {
  if (original === undefined) delete process.env.AI_PUBLIC_DAILY_REQUESTS_PER_IP;
  else process.env.AI_PUBLIC_DAILY_REQUESTS_PER_IP = original;
});

function requestFrom(ip: string) {
  return new Request('https://vidyapath.test/api/generate-quiz', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

describe('requirePublicAiAccess', () => {
  it('allows anonymous requests with no cookies or session', async () => {
    const result = await requirePublicAiAccess(requestFrom('203.0.113.10'));
    expect(result.response).toBeNull();
    expect(result.context?.clientIp).toBe('203.0.113.10');
  });

  it('enforces the per-IP daily cap', async () => {
    process.env.AI_PUBLIC_DAILY_REQUESTS_PER_IP = '2';
    const ip = '203.0.113.77';
    expect((await requirePublicAiAccess(requestFrom(ip))).response).toBeNull();
    expect((await requirePublicAiAccess(requestFrom(ip))).response).toBeNull();
    const blocked = await requirePublicAiAccess(requestFrom(ip));
    expect(blocked.response?.status).toBe(429);
  });
});
