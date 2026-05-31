import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeveloperSessionToken } from '@/lib/auth/session';
import { isDeveloperLoginIdentifier, normalizeDeveloperLoginIdentifier } from '@/lib/auth/developer-login';

const cookieStore = {
  get: vi.fn<(name: string) => { value: string } | undefined>(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieStore),
}));

describe('normalizeDeveloperLoginIdentifier', () => {
  it('treats developer identifiers case-insensitively', () => {
    expect(normalizeDeveloperLoginIdentifier(' Developer@Vidyapath ')).toBe('developer@vidyapath');
  });
});

describe('isDeveloperLoginIdentifier', () => {
  beforeEach(() => {
    process.env.DEVELOPER_USERNAME = 'developer@vidyapath';
  });

  it('recognizes the configured developer identifier on the shared login path', () => {
    expect(isDeveloperLoginIdentifier('Developer@Vidyapath')).toBe(true);
    expect(isDeveloperLoginIdentifier('admin@vidyapath')).toBe(false);
  });
});

describe('getDeveloperSessionFromRequestCookies', () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    process.env.SESSION_SIGNING_SECRET = 'developer-session-test-secret-1234567890';
    process.env.AUTH_ENABLE_LEGACY_SESSIONS = 'false';
    delete process.env.SINGLE_ENV_MODE;
  });

  it('accepts the signed developer cookie even when legacy sessions are disabled', async () => {
    const token = createDeveloperSessionToken('developer@vidyapath');
    cookieStore.get.mockImplementation((name: string) => {
      if (name === 'vp_developer_session') return { value: token };
      return undefined;
    });

    const { getDeveloperSessionFromRequestCookies } = await import('@/lib/auth/guards');
    const session = await getDeveloperSessionFromRequestCookies();

    expect(session).toMatchObject({
      username: 'developer@vidyapath',
    });
    expect(typeof session?.issuedAt).toBe('number');
    expect(typeof session?.expiresAt).toBe('number');
  });
});
