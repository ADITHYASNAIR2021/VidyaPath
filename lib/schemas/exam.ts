/**
 * Exam / mock-exam route schemas.
 */
import { z } from 'zod';
import { nonEmpty } from './base';

export const mockExamSubmitSchema = z.object({
  sessionId: nonEmpty,
  answers: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).default({}),
});
export type MockExamSubmitInput = z.infer<typeof mockExamSubmitSchema>;

export const mockExamStartSchema = z
  .object({
    examType: nonEmpty.optional(),
    chapterIds: z.array(nonEmpty).optional(),
    subject: nonEmpty.optional(),
    classLevel: z.coerce.number().optional(),
    questionCount: z.coerce.number().int().min(1).max(100).optional(),
    durationMinutes: z.coerce.number().int().min(1).max(360).optional(),
  })
  .passthrough();
export type MockExamStartInput = z.infer<typeof mockExamStartSchema>;

export const mockExamHeartbeatSchema = z.object({
  sessionId: nonEmpty,
  elapsedSeconds: z.coerce.number().int().min(0).optional(),
  answers: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
});
export type MockExamHeartbeatInput = z.infer<typeof mockExamHeartbeatSchema>;
