/**
 * Typed Zod schemas for teacher calendar route.
 * Route: /api/teacher/calendar
 */
import { z } from 'zod';

const calendarEventKind = z.enum(['exam', 'holiday', 'event', 'revision', 'assignment', 'other']);

const calendarEventInput = z.object({
  title: z.string().trim().min(1).max(200),
  kind: calendarEventKind.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  classLevel: z.union([z.literal(10), z.literal(12)]).optional(),
  section: z.string().trim().max(40).optional(),
  chapterId: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  isAllDay: z.boolean().optional(),
});

export const createCalendarEventSchema = z.object({
  event: calendarEventInput,
});
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;

export const bulkCalendarSchema = z.object({
  events: z.array(calendarEventInput).min(1).max(200),
  replaceExisting: z.boolean().optional(),
});
export type BulkCalendarInput = z.infer<typeof bulkCalendarSchema>;

export const deleteCalendarEventSchema = z.object({
  eventId: z.string().trim().min(1).max(120),
});
export type DeleteCalendarEventInput = z.infer<typeof deleteCalendarEventSchema>;
