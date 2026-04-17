/**
 * Typed Zod schemas for student SRS (Spaced Repetition) route.
 * Route: /api/student/srs
 */
import { z } from 'zod';

const srsRating = z.enum(['Again', 'Hard', 'Good', 'Easy']);

export const srsReviewSchema = z.object({
  chapterId: z.string().trim().min(1).max(120),
  cardId: z.string().trim().min(1).max(120),
  rating: srsRating,
  reviewedAt: z.string().datetime({ offset: true }).optional(),
});
export type SrsReviewInput = z.infer<typeof srsReviewSchema>;

export const createSrsCardSchema = z.object({
  chapterId: z.string().trim().min(1).max(120),
  front: z.string().trim().min(1).max(2000),
  back: z.string().trim().min(1).max(2000),
  hint: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().max(50)).max(10).optional(),
});
export type CreateSrsCardInput = z.infer<typeof createSrsCardSchema>;
