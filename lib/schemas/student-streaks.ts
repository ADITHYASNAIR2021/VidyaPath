/**
 * Typed Zod schemas for student streaks route.
 * Route: /api/student/streaks
 */
import { z } from 'zod';

export const recordStreakSchema = z.object({
  /** ISO-8601 datetime or date string for the activity (alias: at) */
  at: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  chapterId: z.string().trim().min(1).max(120).optional(),
  activityType: z.enum(['study', 'quiz', 'flashcard', 'exam', 'revision']).optional(),
  durationMinutes: z.number().int().min(0).max(600).optional(),
}).passthrough();
export type RecordStreakInput = z.infer<typeof recordStreakSchema>;
