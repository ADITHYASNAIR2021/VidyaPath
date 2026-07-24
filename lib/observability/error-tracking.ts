/**
 * Zero-dependency error tracking for VidyaPath.
 *
 * Backends supported: Sentry (via DSN), or plain webhook.
 *
 * Setup:
 *   1. Create project at https://sentry.io → get DSN
 *   2. Set SENTRY_DSN in .env.local
 *   3. Or set OBSERVABILITY_ALERT_WEBHOOK_URL for plain webhook
 *
 * Environment variables:
 *   SENTRY_DSN                     — Sentry DSN (e.g. https://xxx@yyy.ingest.sentry.io/zzz)
 *   SENTRY_ENVIRONMENT             — production | staging | development
 *   OBSERVABILITY_ALERT_WEBHOOK_URL — Fallback webhook URL
 */

const SENTRY_DSN = (process.env.SENTRY_DSN || '').trim();
const WEBHOOK_URL = (process.env.OBSERVABILITY_ALERT_WEBHOOK_URL || '').trim();
const ENV = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';

interface SentryEvent {
  event_id: string;
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  logger: string;
  platform: string;
  environment: string;
  exception?: {
    values: Array<{
      type: string;
      value: string;
      stacktrace?: { frames: Array<{ filename: string; function: string; lineno: number }> };
    }>;
  };
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseSentryDsn(dsn: string): { endpoint: string; publicKey: string } | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, '');
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey,
    };
  } catch {
    return null;
  }
}

async function sendToSentry(event: SentryEvent): Promise<void> {
  const parsed = parseSentryDsn(SENTRY_DSN);
  if (!parsed) return;

  const envelope = [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');

  try {
    await fetch(parsed.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
    });
  } catch {
    // Fire-and-forget — never block on telemetry failure
  }
}

async function sendToWebhook(event: SentryEvent): Promise<void> {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[VidyaPath ${event.environment}] ${event.level.toUpperCase()}: ${event.exception?.values[0]?.value || 'Unknown error'}`,
        event,
      }),
    });
  } catch {
    // Fire-and-forget
  }
}

export function initErrorTracking(): void {
  if (SENTRY_DSN) {
    console.info(`[VidyaPath] Error tracking: Sentry (env=${ENV})`);
  } else if (WEBHOOK_URL) {
    console.info(`[VidyaPath] Error tracking: webhook (env=${ENV})`);
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('[VidyaPath] No error tracking configured. Set SENTRY_DSN or OBSERVABILITY_ALERT_WEBHOOK_URL.');
  }
}

export async function captureError(
  error: Error,
  context?: { extra?: Record<string, unknown>; tags?: Record<string, string> }
): Promise<void> {
  const event: SentryEvent = {
    event_id: generateId(),
    timestamp: new Date().toISOString(),
    level: 'error',
    logger: 'vidyapath',
    platform: 'node',
    environment: ENV,
    exception: {
      values: [
        {
          type: error.name || 'Error',
          value: error.message,
          stacktrace: error.stack
            ? {
                frames: error.stack.split('\n').map((line) => {
                  const match = line.match(/at\s+(.*?)\s+\((.*?):(\d+):(\d+)\)/);
                  return {
                    filename: match?.[2] || '',
                    function: match?.[1] || line.trim(),
                    lineno: match ? parseInt(match[3]) : 0,
                  };
                }),
              }
            : undefined,
        },
      ],
    },
    extra: context?.extra,
    tags: context?.tags,
  };

  await Promise.allSettled([sendToSentry(event), sendToWebhook(event)]);
}
