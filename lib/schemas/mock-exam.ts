/**
 * Typed Zod schemas for mock exam session route.
 * Route: /api/mock-exam/session
 */
import { z } from 'zod';

const mockAnswer = z.object({
  questionNo: z.string().trim().min(1).max(20),
  answerText: z.string().trim().min(1).max(10_000),
});

export const startMockExamSchema = z.object({
  chapterId: z.string().trim().min(1).max(120),
  classLevel: z.union([z.literal(10), z.literal(12)]).optional(),
  subject: z.string().trim().max(80).optional(),
  questionCount: z.number().int().min(1).max(60).optional(),
  timeLimit: z.number().int().min(1).max(300).optional(), // minutes
});
export type StartMockExamInput = z.infer<typeof startMockExamSchema>;

export const submitMockExamSchema = z.object({
  sessionId: z.string().trim().min(1).max(120),
  answers: z.array(mockAnswer).min(1).max(60),
  timeTakenSeconds: z.number().int().min(0).max(100_000).optional(),
});
export type SubmitMockExamInput = z.infer<typeof submitMockExamSchema>;
