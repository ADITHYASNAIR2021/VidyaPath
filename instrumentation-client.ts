/**
 * Browser observability entrypoint for Next.js and Sentry.
 */
import * as Sentry from '@sentry/nextjs';
import { redactTelemetryEvent, redactSpanData } from '@/lib/observability/privacy';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.NODE_ENV ||
    'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
  beforeSendSpan: redactSpanData,
  beforeSend(event) {
    if (process.env.NODE_ENV !== 'production') return null;
    return redactTelemetryEvent(event);
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
