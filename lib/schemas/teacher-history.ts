/**
 * Typed Zod schemas for the AI history route.
 * Route: /api/teacher/ai-history
 */
import { z } from 'zod';

export const saveAiHistorySchema = z.object({
  chapterId: z.string().trim().min(1).max(120),
  classLevel: z.union([z.literal(10), z.literal(12)]).optional(),
  subject: z.string().trim().max(80).optional(),
  task: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(5000),
  response: z.string().trim().min(1).max(50000),
  model: z.string().trim().max(100).optional(),
  provider: z.string().trim().max(50).optional(),
  tokensUsed: z.number().int().min(0).max(1_000_000).optional(),
  toolType: z.string().trim().max(80).optional(),
  chapterTitle: z.string().trim().max(200).optional(),
  difficulty: z.string().trim().max(40).optional(),
  result: z.string().trim().max(200).optional(),
});
export type SaveAiHistoryInput = z.infer<typeof saveAiHistorySchema>;
