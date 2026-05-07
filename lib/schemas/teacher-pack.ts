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
const isoDateField = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date');
const dateTimeLocalField = z.string().trim().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/,
  'Expected YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss'
);
const isoDateTimeField = z.string().trim().datetime({ offset: true });
const dateLikeField = z.union([isoDateField, dateTimeLocalField, isoDateTimeField]);

// ── Create assignment pack (POST /api/teacher/assignment-pack) ─────────────

export const createAssignmentPackSchema = z.object({
  chapterId,
  classLevel: z.coerce.number().refine((v) => v === 10 || v === 12).transform((v) => v as 10 | 12),
  subject: z.string().trim().min(1).max(80),
  questionCount: z.coerce.number().int().min(1).max(60).default(10),
  paperMode: z.enum(['mcq-only', 'mixed', 'theory-heavy']).optional(),
  shortAnswerCount: z.coerce.number().int().min(0).max(20).optional(),
  longAnswerCount: z.coerce.number().int().min(0).max(12).optional(),
  formulaDrillCount: z.coerce.number().int().min(0).max(20).optional(),
  difficultyMix: z.string().trim().max(100).optional(),
  includeShortAnswers: z.boolean().optional(),
  includeLongAnswers: z.boolean().optional(),
  includeFormulaDrill: z.boolean().optional(),
  dueDate: dateLikeField.optional(),
  packId: z.string().trim().max(120).optional(),
  section: sectionField,
}).strict();
export type CreateAssignmentPackInput = z.infer<typeof createAssignmentPackSchema>;

// ── Pack ID only (approve, archive, regenerate, lifecycle) ────────────────

export const packIdOnlySchema = z.object({
  packId,
  feedback: z.string().trim().max(1000).optional(),
}).strict();
export type PackIdOnlyInput = z.infer<typeof packIdOnlySchema>;

// ── Publish pack ──────────────────────────────────────────────────────────

export const publishPackSchema = z.object({
  packId,
  visibilityStatus: z.enum(['open', 'closed']).optional(),
  validFrom: dateLikeField.optional(),
  validUntil: dateLikeField.optional(),
}).strict();
export type PublishPackInput = z.infer<typeof publishPackSchema>;

// ── Lifecycle (open/close/reopen/extend) ──────────────────────────────────

export const packLifecycleSchema = z.object({
  packId: packId.optional(),
  action: z.enum(['close', 'reopen', 'extend']),
  extendDays: z.coerce.number().int().min(1).max(120).optional(),
  validUntil: dateLikeField.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === 'extend' && !value.validUntil && !Number.isFinite(value.extendDays)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide extendDays or validUntil for extend action.',
      path: ['extendDays'],
    });
  }
});
export type PackLifecycleInput = z.infer<typeof packLifecycleSchema>;

// ── Edit questions ────────────────────────────────────────────────────────

const questionItem = z.object({
  questionNo: z.string().trim().min(1).max(20),
  prompt: z.string().trim().min(1).max(2000),
  options: z.array(z.string().trim().max(500)).min(4).max(5).optional(),
  answerIndex: z.number().int().min(0).max(4).optional(),
  answerIndexes: z.array(z.number().int().min(0).max(4)).min(1).max(5).optional(),
  answerMode: z.enum(['single', 'multiple']).optional(),
  rubric: z.string().trim().max(1000).optional(),
  maxMarks: z.number().min(0).max(100).optional(),
  kind: z.enum(['mcq', 'short', 'long']).optional(),
}).superRefine((value, ctx) => {
  const kind = value.kind ?? 'mcq';
  const optionsCount = Array.isArray(value.options) ? value.options.length : 0;
  if (kind === 'long' || kind === 'short') {
    if (value.options && value.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${kind} questions should not include options.`,
        path: ['options'],
      });
    }
    if (value.answerIndex !== undefined || value.answerIndexes !== undefined || value.answerMode !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${kind} questions should not include answer indexes.`,
        path: ['answerIndex'],
      });
    }
    return;
  }
  if (!value.options || optionsCount < 4 || optionsCount > 5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'MCQ questions must include 4 or 5 options.',
      path: ['options'],
    });
    return;
  }
  const mode = value.answerMode === 'multiple' ? 'multiple' : 'single';
  if (mode === 'multiple') {
    const indexes = Array.isArray(value.answerIndexes)
      ? Array.from(new Set(value.answerIndexes))
      : [];
    if (indexes.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Multiple-choice questions require at least 2 correct answers.',
        path: ['answerIndexes'],
      });
      return;
    }
    if (indexes.some((index) => index < 0 || index >= optionsCount)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'One or more answer indexes are outside the options range.',
        path: ['answerIndexes'],
      });
    }
    return;
  }
  if (!Number.isInteger(value.answerIndex ?? NaN)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Single-choice questions require one correct answer index.',
      path: ['answerIndex'],
    });
    return;
  }
  if ((value.answerIndex as number) < 0 || (value.answerIndex as number) >= optionsCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Correct answer index is outside the options range.',
      path: ['answerIndex'],
    });
  }
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
  onlyWeak: z.boolean().optional(),
  weakQuestionNos: z.array(z.string().trim().min(2).max(20)).max(60).optional(),
  preserveLocked: z.boolean().optional(),
}).strict();
export type RegeneratePackInput = z.infer<typeof regeneratePackSchema>;

// ── Question review controls (lock good / mark weak) ───────────────────────

export const reviewControlsSchema = z.object({
  packId: packId.optional(),
  lockQuestionNos: z.array(z.string().trim().min(2).max(20)).max(60).optional(),
  unlockQuestionNos: z.array(z.string().trim().min(2).max(20)).max(60).optional(),
  weakQuestionNos: z.array(z.string().trim().min(2).max(20)).max(60).optional(),
  clearWeakQuestionNos: z.array(z.string().trim().min(2).max(20)).max(60).optional(),
}).strict();
export type ReviewControlsInput = z.infer<typeof reviewControlsSchema>;
