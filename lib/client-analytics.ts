'use client';

type TelemetryPayload = {
  eventName: string;
  chapterId?: string;
  query?: string;
  metadata?: Record<string, unknown>;
};

const TRACK_ENDPOINT = '/api/analytics/track';

function postWithBeacon(payload: TelemetryPayload): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    return navigator.sendBeacon(TRACK_ENDPOINT, blob);
  } catch {
    return false;
  }
}

export function trackAnalyticsEvent(payload: TelemetryPayload): void {
  if (typeof window === 'undefined') return;
  if (!payload?.eventName) return;

  if (postWithBeacon(payload)) return;

  void fetch(TRACK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // best-effort analytics; never block UX
  });
}

