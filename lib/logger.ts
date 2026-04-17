/**
 * Structured logger for server-side use.
 *
 * Uses `pino` which emits newline-delimited JSON to stdout.
 * Vercel, Railway, and most cloud platforms ingest this natively
 * and allow filtering by level/field without extra configuration.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info({ event: 'user-login', userId }, 'Login successful');
 *   logger.error({ err, requestId }, 'Request failed');
 */
import pino from 'pino';

const REDACTED = '[REDACTED]';

/**
 * Fields containing secrets that must never appear in logs.
 * pino's `redact` option replaces them with `[REDACTED]` at serialization time.
 */
const REDACT_PATHS = [
  'pin',
  'pin_hash',
  'pinHash',
  'password',
  'token',
  'secret',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'authorization',
  'Authorization',
];

function resolveLevel(): string {
  const raw = (process.env.LOG_LEVEL || '').trim().toLowerCase();
  if (['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'].includes(raw)) return raw;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

export const logger = pino({
  level: resolveLevel(),
  redact: {
    paths: REDACT_PATHS,
    censor: REDACTED,
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'vidyapath',
    env: process.env.NODE_ENV ?? 'development',
  },
});
