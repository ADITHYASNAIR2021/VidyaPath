/**
 * Startup environment validation.
 *
 * Call `assertRequiredEnv()` at the top of any server-side initialization
 * that must not proceed with missing secrets.
 *
 * For Next.js: import in `instrumentation.ts` (runs once at server start).
 * For Edge middleware: the middleware already calls `requireSessionSecret()`
 * directly, which throws if the value is absent.
 *
 * Usage:
 *   import { assertRequiredEnv } from '@/lib/config/env-validation';
 *   assertRequiredEnv(); // Throws in production if any required var is missing
 */

interface EnvSpec {
  key: string;
  /** If true, a missing value causes a hard throw in production (no fallback). */
  required: boolean;
  /** If true, warn (not throw) even in production. */
  warnOnly?: boolean;
  description: string;
}

const REQUIRED_SPECS: EnvSpec[] = [
  {
    key: 'SESSION_SIGNING_SECRET',
    required: true,
    description: 'HMAC secret for signing all role session cookies. Must be ≥32 random chars.',
  },
  {
    key: 'TEACHER_PORTAL_KEY',
    required: true,
    description: 'Shared secret for teacher portal login.',
  },
  {
    key: 'ADMIN_PORTAL_KEY',
    required: true,
    description: 'Shared secret for admin portal login.',
  },
];

const RECOMMENDED_SPECS: EnvSpec[] = [
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    required: false,
    warnOnly: true,
    description: 'Supabase project URL. Required for all DB operations.',
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    required: false,
    warnOnly: true,
    description: 'Supabase service-role key. Required for server-side DB writes.',
  },
  {
    key: 'UPSTASH_REDIS_REST_URL',
    required: false,
    warnOnly: true,
    description: 'Upstash Redis REST URL. Required for fast-path rate limiting.',
  },
];

export interface EnvValidationResult {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validate environment variables.
 * @param mode - 'strict' throws on missing required vars (production default).
 *               'report' collects and returns errors without throwing.
 */
export function validateEnv(mode: 'strict' | 'report' = 'report'): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const spec of REQUIRED_SPECS) {
    const value = (process.env[spec.key] || '').trim();
    if (!value) {
      if (spec.required) {
        missing.push(spec.key);
      } else {
        warnings.push(`${spec.key}: ${spec.description}`);
      }
    }
  }

  // Warn about short secrets
  const sessionSecret = (process.env.SESSION_SIGNING_SECRET || '').trim();
  if (sessionSecret && sessionSecret.length < 32) {
    warnings.push('SESSION_SIGNING_SECRET is shorter than 32 characters — use a longer secret in production.');
  }

  for (const spec of RECOMMENDED_SPECS) {
    const value = (process.env[spec.key] || '').trim();
    if (!value) {
      warnings.push(`${spec.key} is not set — ${spec.description}`);
    }
  }

  const ok = missing.length === 0;

  if (mode === 'strict' && !ok) {
    throw new Error(
      `[VidyaPath] Missing required environment variables:\n` +
      missing.map((key) => `  • ${key}`).join('\n') +
      `\n\nSet these in your .env.local file or deployment secrets.\n` +
      `See .env.example for documentation.`,
    );
  }

  return { ok, missing, warnings };
}

/**
 * Hard-fail if SESSION_SIGNING_SECRET is missing in production.
 * Safe to call in all environments — no-ops in 'development' and 'test'.
 */
export function assertRequiredEnv(): void {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    // In dev/test, warn but don't throw
    const result = validateEnv('report');
    for (const warn of result.warnings) {
      console.warn(`[env-validation] WARN: ${warn}`);
    }
    if (!result.ok) {
      console.warn(
        `[env-validation] Missing required vars in dev (would throw in production): ${result.missing.join(', ')}`,
      );
    }
    return;
  }
  validateEnv('strict');
}
