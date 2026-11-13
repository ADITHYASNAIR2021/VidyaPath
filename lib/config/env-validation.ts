/**
 * Startup environment validation for the public (no-login) platform.
 *
 * Nothing is strictly required: chapters, notes, papers and formulas are static
 * and work with zero configuration. AI features need at least one LLM key, and
 * production deployments should configure Upstash Redis for shared rate limits.
 *
 * Called once from `instrumentation.ts`.
 */

import { logger } from '@/lib/logger';

const AI_PROVIDER_KEYS = [
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'NVIDIA_API_KEY',
  'CEREBRAS_API_KEY',
  'MISTRAL_API_KEY',
] as const;

export interface EnvValidationResult {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

function hasValue(key: string): boolean {
  return (process.env[key] || '').trim().length > 0;
}

/**
 * Validate environment variables.
 * @param mode - 'strict' throws when AI is entirely unconfigured in production.
 *               'report' collects issues without throwing.
 */
export function validateEnv(mode: 'strict' | 'report' = 'report'): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  const hasAiProvider = AI_PROVIDER_KEYS.some(hasValue);
  if (!hasAiProvider) {
    warnings.push(
      `No AI provider key set (${AI_PROVIDER_KEYS.join(', ')}). AI tutor, flashcards and quizzes will be unavailable.`
    );
  }

  if (!hasValue('UPSTASH_REDIS_REST_URL') || !hasValue('UPSTASH_REDIS_REST_TOKEN')) {
    warnings.push(
      'UPSTASH_REDIS_REST_URL/TOKEN not set — AI rate limits and the daily AI budget are per server instance only.'
    );
  }

  const devKey = (process.env.DEVELOPER_DASHBOARD_KEY || '').trim();
  if (!devKey) {
    warnings.push('DEVELOPER_DASHBOARD_KEY not set — the /developer console is disabled.');
  } else if (devKey.length < 24) {
    warnings.push('DEVELOPER_DASHBOARD_KEY is shorter than 24 characters — the /developer console stays disabled.');
  }

  if (!hasValue('NEXT_PUBLIC_APP_URL')) {
    warnings.push('NEXT_PUBLIC_APP_URL not set — canonical URLs fall back to the default deployment URL.');
  }

  const ok = missing.length === 0;
  if (mode === 'strict' && !ok) {
    throw new Error(
      `[VidyaPath] Invalid environment:\n${missing.map((key) => `  • ${key}`).join('\n')}\n\nSee .env.example.`
    );
  }
  return { ok, missing, warnings };
}

/** Log configuration warnings at startup. Never blocks the site from serving static content. */
export function assertRequiredEnv(): void {
  const result = validateEnv('report');
  for (const warn of result.warnings) {
    logger.warn({ warn }, '[env-validation] configuration warning');
  }
}
