/**
 * Typed Zod schemas for analytics tracking route.
 * Route: /api/analytics/track
 */
import { z } from 'zod';

export const trackEventSchema = z.object({
  eventName: z.string().trim().min(1).max(80),
  chapterId: z.string().trim().max(120).optional(),
  query: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TrackEventInput = z.infer<typeof trackEventSchema>;
