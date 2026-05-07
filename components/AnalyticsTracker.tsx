'use client';

import { useEffect } from 'react';
import { trackAnalyticsEvent } from '@/lib/client-analytics';

interface AnalyticsTrackerProps {
  eventName: 'chapter_view' | 'search_no_result' | 'ai_question';
  chapterId?: string;
  query?: string;
}

export default function AnalyticsTracker({ eventName, chapterId, query }: AnalyticsTrackerProps) {
  useEffect(() => {
    trackAnalyticsEvent({ eventName, chapterId, query });
    return undefined;
  }, [eventName, chapterId, query]);

  return null;
}
