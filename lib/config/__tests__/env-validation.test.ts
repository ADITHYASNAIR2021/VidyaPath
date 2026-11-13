import { describe, it, expect } from 'vitest';
import { validateEnv } from '@/lib/config/env-validation';

const AI_KEYS = ['GROQ_API_KEY', 'GEMINI_API_KEY', 'NVIDIA_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY'];

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

describe('validateEnv (public platform)', () => {
  it('never requires login/session secrets', () => {
    withEnv(
      {
        SESSION_SIGNING_SECRET: undefined,
        TEACHER_PORTAL_KEY: undefined,
        DEVELOPER_USERNAME: undefined,
        DEVELOPER_PASSWORD: undefined,
      },
      () => {
        const result = validateEnv('strict');
        expect(result.ok).toBe(true);
        expect(result.missing).toHaveLength(0);
      }
    );
  });

  it('warns when no AI provider key is configured', () => {
    withEnv(Object.fromEntries(AI_KEYS.map((key) => [key, undefined])), () => {
      const result = validateEnv('report');
      expect(result.warnings.some((w) => w.includes('No AI provider key'))).toBe(true);
    });
  });

  it('does not warn about AI when one provider key is set', () => {
    withEnv({ ...Object.fromEntries(AI_KEYS.map((key) => [key, undefined])), GROQ_API_KEY: 'gsk_test' }, () => {
      const result = validateEnv('report');
      expect(result.warnings.some((w) => w.includes('No AI provider key'))).toBe(false);
    });
  });

  it('warns when Upstash is not configured', () => {
    withEnv({ UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined }, () => {
      const result = validateEnv('report');
      expect(result.warnings.some((w) => w.includes('UPSTASH_REDIS_REST_URL'))).toBe(true);
    });
  });
});
