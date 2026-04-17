/**
 * Zod schemas for AI route boundaries (`/api/ai-tutor`, `/api/generate-quiz`, ...).
 *
 * These are permissive by design — they accept what current routes accept, but
 * reject obviously malformed bodies (missing required fields, wrong types) so
 * we surface a clean 422 with issue details instead of falling through to
 * downstream normalization.
 */
import { z } from 'zod';
import { classLevel, nonEmpty } from './base';

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const trimmedString = z.string().trim();
const optionalTrimmed = trimmedString.optional();
const optionalNonEmpty = trimmedString.min(1).optional();

/** classLevel that may come through as either number or numeric string. */
const classLevelCoerce = z.coerce.number().refine((value) => value === 10 || value === 12, {
  message: 'classLevel must be 10 or 12',
});

// ---------------------------------------------------------------------------
// /api/generate-quiz
// ---------------------------------------------------------------------------

export const quizRequestSchema = z.object({
  subject: optionalTrimmed,
  chapterId: optionalTrimmed,
  chapterTitle: optionalTrimmed,
  classLevel: z.union([classLevel, z.coerce.number()]).optional(),
  questionCount: z.coerce.number().int().min(1).max(50).optional(),
  difficulty: optionalTrimmed,
  nccontext: optionalTrimmed,
});
export type QuizRequest = z.infer<typeof quizRequestSchema>;

// ---------------------------------------------------------------------------
// /api/generate-flashcards
// ---------------------------------------------------------------------------

export const flashcardsRequestSchema = z.object({
  subject: optionalTrimmed,
  chapterId: optionalTrimmed,
  chapterTitle: optionalTrimmed,
  classLevel: z.union([classLevel, z.coerce.number()]).optional(),
  nccontext: optionalTrimmed,
});
export type FlashcardsRequest = z.infer<typeof flashcardsRequestSchema>;

// ---------------------------------------------------------------------------
// /api/ai-tutor
// ---------------------------------------------------------------------------

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: trimmedString.min(1),
});

const chapterContextSchema = z
  .object({
    chapterId: optionalTrimmed,
    title: trimmedString,
    subject: trimmedString,
    classLevel: z.union([z.number(), z.string()]).transform((value) => Number(value)),
    topics: z.array(trimmedString).default([]),
  })
  .optional();

export const aiTutorRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
  chapterContext: chapterContextSchema,
});
export type AiTutorRequest = z.infer<typeof aiTutorRequestSchema>;

// ---------------------------------------------------------------------------
// /api/context-pack
// ---------------------------------------------------------------------------

export const contextPackRequestSchema = z.object({
  classLevel: z.coerce.number(),
  subject: nonEmpty,
  chapterId: optionalTrimmed,
  query: optionalTrimmed,
  task: optionalTrimmed,
  chapterTopics: z.array(trimmedString).optional(),
});
export type ContextPackRequest = z.infer<typeof contextPackRequestSchema>;

// ---------------------------------------------------------------------------
// /api/chapter-pack
// ---------------------------------------------------------------------------

export const chapterPackRequestSchema = z.object({
  chapterId: nonEmpty,
});
export type ChapterPackRequest = z.infer<typeof chapterPackRequestSchema>;

// ---------------------------------------------------------------------------
// /api/chapter-drill
// ---------------------------------------------------------------------------

export const chapterDrillRequestSchema = z.object({
  chapterId: nonEmpty,
  questionCount: z.coerce.number().int().min(1).max(40).optional(),
  difficulty: optionalTrimmed,
});
export type ChapterDrillRequest = z.infer<typeof chapterDrillRequestSchema>;

// ---------------------------------------------------------------------------
// /api/chapter-diagnose
// ---------------------------------------------------------------------------

export const chapterDiagnoseRequestSchema = z.object({
  chapterId: nonEmpty,
  quizScore: z.coerce.number().nullable().optional(),
  flashcardsDue: z.coerce.number().optional(),
  studied: z.boolean().optional(),
  bookmarked: z.boolean().optional(),
  recentMistakes: z.array(trimmedString).optional(),
});
export type ChapterDiagnoseRequest = z.infer<typeof chapterDiagnoseRequestSchema>;

// ---------------------------------------------------------------------------
// /api/chapter-remediate
// ---------------------------------------------------------------------------

export const chapterRemediateRequestSchema = z.object({
  chapterId: nonEmpty,
  weakTags: z.array(trimmedString).optional(),
  availableDays: z.coerce.number().int().optional(),
  dailyMinutes: z.coerce.number().int().optional(),
});
export type ChapterRemediateRequest = z.infer<typeof chapterRemediateRequestSchema>;

// ---------------------------------------------------------------------------
// /api/adaptive-test
// ---------------------------------------------------------------------------

export const adaptiveTestRequestSchema = z.object({
  classLevel: classLevelCoerce,
  subject: nonEmpty,
  chapterIds: z.array(nonEmpty).min(1),
  difficultyMix: optionalTrimmed,
  questionCount: z.coerce.number().int().min(3).max(30).optional(),
  mode: optionalTrimmed,
});
export type AdaptiveTestRequest = z.infer<typeof adaptiveTestRequestSchema>;

// ---------------------------------------------------------------------------
// /api/revision-plan
// ---------------------------------------------------------------------------

export const revisionPlanRequestSchema = z.object({
  classLevel: classLevelCoerce,
  subject: optionalTrimmed,
  examDate: optionalTrimmed,
  weeklyHours: z.coerce.number().positive(),
  weakChapterIds: z.array(trimmedString).optional(),
  targetScore: z.coerce.number().optional(),
});
export type RevisionPlanRequest = z.infer<typeof revisionPlanRequestSchema>;

// ---------------------------------------------------------------------------
// /api/image-solve
// ---------------------------------------------------------------------------

export const imageSolveRequestSchema = z.object({
  imageBase64: nonEmpty,
  mimeType: optionalTrimmed,
  prompt: optionalTrimmed,
  classLevel: z.coerce.number().optional(),
  subject: optionalTrimmed,
});
export type ImageSolveRequest = z.infer<typeof imageSolveRequestSchema>;

// ---------------------------------------------------------------------------
// /api/paper-evaluate
// ---------------------------------------------------------------------------

const paperAnswerSchema = z.object({
  questionNo: nonEmpty,
  answerText: nonEmpty,
});

export const paperEvaluateRequestSchema = z.object({
  paperId: nonEmpty,
  answers: z.array(paperAnswerSchema).min(1),
  classLevel: classLevelCoerce.optional(),
  subject: optionalTrimmed,
});
export type PaperEvaluateRequest = z.infer<typeof paperEvaluateRequestSchema>;

// ---------------------------------------------------------------------------
// /api/teacher/ai (classroom AI assistant)
// ---------------------------------------------------------------------------
// Kept permissive — shape is dynamic based on tool type.
export const teacherAiRequestSchema = z
  .object({
    type: z.enum(['worksheet', 'lesson-plan', 'question-paper']),
    chapterId: optionalTrimmed,
    chapterTitle: optionalTrimmed,
    subject: optionalTrimmed,
    classLevel: z.coerce.number().optional(),
    topics: z.array(z.string()).optional(),
    questionCount: z.coerce.number().int().min(1).max(50).optional(),
    difficulty: optionalTrimmed,
    customContext: optionalTrimmed,
  })
  .passthrough();
export type TeacherAiRequest = z.infer<typeof teacherAiRequestSchema>;
