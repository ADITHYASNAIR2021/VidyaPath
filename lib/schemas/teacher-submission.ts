/**
 * Typed Zod schemas for teacher submission routes.
 * Routes: /api/teacher/submission/grade, /api/teacher/submission/release-results
 */
import { z } from 'zod';

const packId = z.string().trim().min(1).max(120);
const submissionId = z.string().trim().min(1).max(120);

// ── Grade submission ──────────────────────────────────────────────────────

const gradeItem = z.object({
  questionNo: z.string().trim().min(1).max(20),
  scoreAwarded: z.number().min(0).max(100),
  maxScore: z.number().min(0).max(100),
  feedback: z.string().trim().max(1000).optional(),
});

export const gradeSubmissionSchema = z.object({
  submissionId,
  grades: z.array(gradeItem).min(1).max(60),
  overallFeedback: z.string().trim().max(2000).optional(),
  released: z.boolean().optional(),
});
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;

// ── Release results ───────────────────────────────────────────────────────

export const releaseResultsSchema = z.object({
  packId,
  submissionIds: z.array(submissionId).min(1).max(2000).optional(),
  releaseAll: z.boolean().optional(),
});
export type ReleaseResultsInput = z.infer<typeof releaseResultsSchema>;
