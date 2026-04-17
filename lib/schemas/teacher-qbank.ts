/**
 * Typed Zod schemas for teacher question-bank routes.
 * Routes: /api/teacher/question-bank/item
 *         /api/teacher/question-bank/item/[id]
 */
import { z } from 'zod';

const questionKind = z.enum(['mcq', 'short', 'long']);

export const createQuestionBankItemSchema = z.object({
  chapterId: z.string().trim().min(1).max(120),
  classLevel: z.union([z.literal(10), z.literal(12)]),
  subject: z.string().trim().min(1).max(80),
  section: z.string().trim().max(40).optional(),
  kind: questionKind,
  prompt: z.string().trim().min(1).max(3000),
  options: z.array(z.string().trim().max(500)).max(6).optional(),
  answerIndex: z.number().int().min(0).max(5).optional(),
  rubric: z.string().trim().max(1000).optional(),
  maxMarks: z.number().min(0).max(100).default(1),
  imageUrl: z.string().trim().url().max(500).optional(),
});
export type CreateQuestionBankItemInput = z.infer<typeof createQuestionBankItemSchema>;

export const updateQuestionBankItemSchema = createQuestionBankItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateQuestionBankItemInput = z.infer<typeof updateQuestionBankItemSchema>;
