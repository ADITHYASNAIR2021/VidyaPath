/**
 * Typed Zod schemas for teacher assignment-pack API routes.
 * Replaces `permissiveObjectSchema` with strict input validation.
 */
import { z } from 'zod';

// ── Shared primitives ──────────────────────────────────────────────────────

const packId = z.string().trim().min(1).max(120);
const chapterId = z.string().trim().min(1).max(120);
const classLevelField = z.union([z.literal(10), z.literal(12)]);
const sectionField = z.string().trim().min(0).max(40).optional();

// ── Create assignment pack (POST /api/teacher/assignment-pack) ─────────────

export const createAssignmentPackSchema = z.object({
  chapterId,
  classLevel: z.coerce.number().refine((v) => v === 10 || v === 12).transform((v) => v as 10 | 12),
  subject: z.string().trim().min(1).max(80),
  questionCount: z.coerce.number().int().min(1).max(60).default(10),
  difficultyMix: z.string().trim().max(100).optional(),
  includeShortAnswers: z.boolean().optional(),
  includeLongAnswers: z.boolean().optional(),
  includeFormulaDrill: z.boolean().optional(),
  dueDate: z.string().trim().max(40).optional(),
  packId: z.string().trim().max(120).optional(),
  section: sectionField,
});
export type CreateAssignmentPackInput = z.infer<typeof createAssignmentPackSchema>;

// ── Pack ID only (approve, archive, regenerate, lifecycle) ────────────────

export const packIdOnlySchema = z.object({
  packId,
  feedback: z.string().trim().max(1000).optional(),
});
export type PackIdOnlyInput = z.infer<typeof packIdOnlySchema>;

// ── Publish pack ──────────────────────────────────────────────────────────

export const publishPackSchema = z.object({
  packId,
  visibilityStatus: z.enum(['open', 'closed']).optional(),
  validFrom: z.string().trim().max(40).optional(),
  validUntil: z.string().trim().max(40).optional(),
});
export type PublishPackInput = z.infer<typeof publishPackSchema>;

// ── Lifecycle (open/close/reopen/extend) ──────────────────────────────────

export const packLifecycleSchema = z.object({
  packId,
  action: z.enum(['close', 'reopen', 'extend']),
  validUntil: z.string().trim().max(40).optional(),
});
export type PackLifecycleInput = z.infer<typeof packLifecycleSchema>;

// ── Edit questions ────────────────────────────────────────────────────────

const questionItem = z.object({
  questionNo: z.string().trim().min(1).max(20),
  prompt: z.string().trim().min(1).max(2000),
  options: z.array(z.string().trim().max(500)).max(6).optional(),
  answerIndex: z.number().int().min(0).max(5).optional(),
  rubric: z.string().trim().max(1000).optional(),
  maxMarks: z.number().min(0).max(100).optional(),
  kind: z.enum(['mcq', 'short', 'long']).optional(),
});

export const editQuestionsSchema = z.object({
  packId,
  questions: z.array(questionItem).min(1).max(60),
});
export type EditQuestionsInput = z.infer<typeof editQuestionsSchema>;

// ── Regenerate ────────────────────────────────────────────────────────────

export const regeneratePackSchema = z.object({
  packId,
  chapterId: chapterId.optional(),
  difficultyMix: z.string().trim().max(100).optional(),
  feedback: z.string().trim().max(1000).optional(),
  reason: z.string().trim().max(300).optional(),
  questionCount: z.coerce.number().int().min(1).max(60).optional(),
});
export type RegeneratePackInput = z.infer<typeof regeneratePackSchema>;
