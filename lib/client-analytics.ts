'use client';

type TelemetryPayload = {
  eventName: string;
  chapterId?: string;
  query?: string;
  metadata?: Record<string, string | number | boolean>;
};

type PlausibleFn = (event: string, options?: { props?: Record<string, string | number | boolean> }) => void;
type UmamiTracker = { track: (event: string, data?: Record<string, string | number | boolean>) => void };

/**
 * Cookieless, account-free product analytics. Forwards custom events to Plausible
 * or Umami when their script is configured (see PrivacyAnalytics); otherwise a no-op.
 * Never sends personal data.
 */
export function trackAnalyticsEvent(payload: TelemetryPayload): void {
  if (typeof window === 'undefined' || !payload?.eventName) return;
  const props: Record<string, string | number | boolean> = { ...(payload.metadata ?? {}) };
  if (payload.chapterId) props.chapterId = payload.chapterId;
  if (payload.query) props.query = payload.query.slice(0, 80);

  try {
    const plausible = (window as unknown as { plausible?: PlausibleFn }).plausible;
    if (typeof plausible === 'function') plausible(payload.eventName, { props });
    const umami = (window as unknown as { umami?: UmamiTracker }).umami;
    if (umami && typeof umami.track === 'function') umami.track(payload.eventName, props);
  } catch {
    // best-effort analytics; never block UX
  }
}
