/**
 * Typed Zod schemas for student notes route.
 * Route: /api/student/notes
 */
import { z } from 'zod';

export const saveNoteSchema = z.object({
  chapterId: z.string().trim().min(1).max(120),
  content: z.string().max(500_000).default(''),
});
export type SaveNoteInput = z.infer<typeof saveNoteSchema>;
