import { afterEach, describe, expect, it } from 'vitest';
import {
  createDeveloperSessionValue,
  getDeveloperKeyStatus,
  isValidDeveloperKey,
  verifyDeveloperSessionValue,
} from '@/lib/developer/auth';

const original = process.env.DEVELOPER_DASHBOARD_KEY;
const KEY = 'test-developer-key-0123456789abcdef';

afterEach(() => {
  if (original === undefined) delete process.env.DEVELOPER_DASHBOARD_KEY;
  else process.env.DEVELOPER_DASHBOARD_KEY = original;
});

describe('developer console auth', () => {
  it('is disabled when no key or a short key is configured', () => {
    delete process.env.DEVELOPER_DASHBOARD_KEY;
    expect(getDeveloperKeyStatus()).toBe('missing');
    expect(createDeveloperSessionValue()).toBeNull();
    process.env.DEVELOPER_DASHBOARD_KEY = 'short';
    expect(getDeveloperKeyStatus()).toBe('too-short');
    expect(isValidDeveloperKey('short')).toBe(false);
  });

  it('accepts only the exact key', () => {
    process.env.DEVELOPER_DASHBOARD_KEY = KEY;
    expect(isValidDeveloperKey(KEY)).toBe(true);
    expect(isValidDeveloperKey(`${KEY}x`)).toBe(false);
    expect(isValidDeveloperKey('')).toBe(false);
    expect(isValidDeveloperKey(undefined)).toBe(false);
  });

  it('issues sessions that verify, expire, and die when the key rotates', () => {
    process.env.DEVELOPER_DASHBOARD_KEY = KEY;
    const now = Date.now();
    const session = createDeveloperSessionValue(now);
    expect(session).not.toBeNull();
    expect(verifyDeveloperSessionValue(session!.value, now + 1000)).toBe(true);
    expect(verifyDeveloperSessionValue(session!.value, now + session!.maxAgeSeconds * 1000 + 1)).toBe(false);
    expect(verifyDeveloperSessionValue(`${session!.value}tampered`, now)).toBe(false);
    process.env.DEVELOPER_DASHBOARD_KEY = `${KEY}-rotated`;
    expect(verifyDeveloperSessionValue(session!.value, now + 1000)).toBe(false);
  });
});
