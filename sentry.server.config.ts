/**
 * Sentry server-side config — Node.js runtime.
 * DSN injected via SENTRY_DSN env var.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '',
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 0,
  beforeSend(event) {
    if (process.env.NODE_ENV !== 'production') return null;
    // Strip sensitive data
    if (event.request?.cookies) delete event.request.cookies;
    if (event.request?.headers) {
      const h = event.request.headers as Record<string, string>;
      delete h['cookie'];
      delete h['authorization'];
    }
    return event;
  },
});
