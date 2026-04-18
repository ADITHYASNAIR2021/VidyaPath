import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from '@/lib/config/env-validation';

const REQUIRED_KEYS = ['SESSION_SIGNING_SECRET', 'TEACHER_PORTAL_KEY'];

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

describe('validateEnv — report mode', () => {
  it('reports missing required keys', () => {
    const missing = Object.fromEntries(REQUIRED_KEYS.map((k) => [k, undefined]));
    withEnv(missing, () => {
      const result = validateEnv('report');
      expect(result.ok).toBe(false);
      expect(result.missing).toContain('SESSION_SIGNING_SECRET');
    });
  });

  it('returns ok=true when all required keys are set', () => {
    const full = Object.fromEntries(
      REQUIRED_KEYS.map((k) => [k, 'test-value-long-enough-32-characters-here'])
    );
    withEnv(full, () => {
      const result = validateEnv('report');
      expect(result.ok).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });

  it('warns when SESSION_SIGNING_SECRET is shorter than 32 chars', () => {
    withEnv(
      {
        SESSION_SIGNING_SECRET: 'short',
        TEACHER_PORTAL_KEY: 'test-teacher-key',
      },
      () => {
        const result = validateEnv('report');
        expect(result.ok).toBe(true); // key exists, so not missing
        const hasShortWarn = result.warnings.some((w) =>
          w.toLowerCase().includes('shorter than 32')
        );
        expect(hasShortWarn).toBe(true);
      }
    );
  });
});

describe('validateEnv — strict mode', () => {
  it('throws when SESSION_SIGNING_SECRET is missing', () => {
    withEnv(
      {
        SESSION_SIGNING_SECRET: undefined,
        TEACHER_PORTAL_KEY: 'test-teacher-key',
      },
      () => {
        expect(() => validateEnv('strict')).toThrow(/SESSION_SIGNING_SECRET/);
      }
    );
  });

  it('does not throw when all required keys are present', () => {
    const full = Object.fromEntries(
      REQUIRED_KEYS.map((k) => [k, 'test-value-long-enough-32-characters-here'])
    );
    withEnv(full, () => {
      expect(() => validateEnv('strict')).not.toThrow();
    });
  });
});
