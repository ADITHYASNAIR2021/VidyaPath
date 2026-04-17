/**
 * Structured server-event logger.
 *
 * Wraps pino so callers keep using the existing `logServerEvent()` API
 * while gaining JSON-structured output with automatic field redaction.
 *
 * All existing callers across app/api/** and lib/*-db.ts continue to work
 * with no changes needed at the callsites.
 */
import { logger } from '@/lib/logger';

type LogLevel = 'info' | 'warn' | 'error';

export function logServerEvent(input: {
  level?: LogLevel;
  event: string;
  requestId?: string;
  endpoint?: string;
  role?: string;
  schoolId?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}): void {
  const level = input.level ?? 'info';
  const payload = {
    event: input.event,
    requestId: input.requestId,
    endpoint: input.endpoint,
    role: input.role,
    schoolId: input.schoolId,
    statusCode: input.statusCode,
    ...input.details,
  };

  if (level === 'error') {
    logger.error(payload, input.event);
  } else if (level === 'warn') {
    logger.warn(payload, input.event);
  } else {
    logger.info(payload, input.event);
  }
}
