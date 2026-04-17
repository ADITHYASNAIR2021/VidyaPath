import { describe, it, expect } from 'vitest';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

// ── buildRateLimitKey ─────────────────────────────────────────────────────

describe('buildRateLimitKey', () => {
  it('builds a key with route and single segment', () => {
    const key = buildRateLimitKey('auth:login', ['127.0.0.1']);
    expect(key).toContain('auth:login');
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('builds a key with multiple segments', () => {
    const key = buildRateLimitKey('api:ai', ['127.0.0.1', 'teacher-001']);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('creates different keys for different IPs', () => {
    const k1 = buildRateLimitKey('route', ['1.1.1.1']);
    const k2 = buildRateLimitKey('route', ['2.2.2.2']);
    expect(k1).not.toBe(k2);
  });

  it('creates different keys for different routes', () => {
    const k1 = buildRateLimitKey('route-a', ['1.1.1.1']);
    const k2 = buildRateLimitKey('route-b', ['1.1.1.1']);
    expect(k1).not.toBe(k2);
  });

  it('is deterministic for same inputs', () => {
    const k1 = buildRateLimitKey('auth:login', ['127.0.0.1']);
    const k2 = buildRateLimitKey('auth:login', ['127.0.0.1']);
    expect(k1).toBe(k2);
  });

  it('handles null/undefined parts gracefully', () => {
    const key = buildRateLimitKey('route', [null as unknown as string, undefined as unknown as string]);
    expect(typeof key).toBe('string');
  });
});

// ── checkRateLimit (fallback / fail-open) ─────────────────────────────────
// In test env Supabase is not configured and Redis creds are absent,
// so checkRateLimit should fail-open and return allowed = true (dev default).

describe('checkRateLimit (no-DB environment)', () => {
  it('does not throw when unconfigured', async () => {
    const decision = await checkRateLimit({
      key: buildRateLimitKey('test', ['localhost']),
      windowSeconds: 60,
      maxRequests: 10,
      blockSeconds: 120,
    });
    expect(decision).toBeDefined();
    expect(typeof decision.allowed).toBe('boolean');
    expect(typeof decision.remaining).toBe('number');
    expect(typeof decision.limit).toBe('number');
    expect(decision.limit).toBe(10);
  });
});
