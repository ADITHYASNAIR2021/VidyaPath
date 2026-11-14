/**
 * Sentry server-side config — Node.js runtime.
 * DSN injected via SENTRY_DSN env var.
 */
import * as Sentry from '@sentry/nextjs';
import { redactTelemetryEvent, redactSpanData } from '@/lib/observability/privacy';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '',
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 0,
  sendDefaultPii: false,
  beforeSendSpan: redactSpanData,
  beforeSend(event) {
    if (process.env.NODE_ENV !== 'production') return null;
    return redactTelemetryEvent(event);
  },
});
