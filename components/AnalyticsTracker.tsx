'use client';

import { useEffect } from 'react';

interface AnalyticsTrackerProps {
  eventName: 'chapter_view' | 'search_no_result' | 'ai_question';
  chapterId?: string;
  query?: string;
}

export default function AnalyticsTracker({ eventName, chapterId, query }: AnalyticsTrackerProps) {
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName, chapterId, query }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => {
      // Silent fail for privacy-friendly best-effort analytics.
    });

    return () => controller.abort();
  }, [eventName, chapterId, query]);

  return null;
}
