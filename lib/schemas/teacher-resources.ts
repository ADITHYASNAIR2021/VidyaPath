/**
 * Typed Zod schemas for teacher resources route.
 * Route: /api/teacher/resources
 * Covers topic-priority, quiz links, scope feed content, weekly plans.
 */
import { z } from 'zod';

const chapterId = z.string().trim().min(1).max(120);

// ── Topic priority ────────────────────────────────────────────────────────

export const setTopicPrioritySchema = z.object({
  chapterId,
  classLevel: z.union([z.literal(10), z.literal(12)]),
  subject: z.string().trim().min(1).max(80),
  section: z.string().trim().max(40).optional(),
  topics: z.array(z.string().trim().min(1).max(200)).max(20),
});
export type SetTopicPriorityInput = z.infer<typeof setTopicPrioritySchema>;

// ── Quiz link ─────────────────────────────────────────────────────────────

export const setQuizLinkSchema = z.object({
  chapterId,
  classLevel: z.union([z.literal(10), z.literal(12)]),
  subject: z.string().trim().min(1).max(80),
  section: z.string().trim().max(40).optional(),
  url: z.string().trim().url().max(500),
});
export type SetQuizLinkInput = z.infer<typeof setQuizLinkSchema>;

// ── Weekly plan ───────────────────────────────────────────────────────────

const planDay = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  chapterId: chapterId.optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  type: z.enum(['lecture', 'revision', 'test', 'assignment', 'other']).optional(),
  durationMinutes: z.number().int().min(0).max(600).optional(),
});

export const upsertWeeklyPlanSchema = z.object({
  classLevel: z.union([z.literal(10), z.literal(12)]),
  section: z.string().trim().max(40).optional(),
  subject: z.string().trim().min(1).max(80).optional(),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.array(planDay).min(1).max(7),
});
export type UpsertWeeklyPlanInput = z.infer<typeof upsertWeeklyPlanSchema>;

// ── Generic resource mutation (used for scope feed) ────────────────────────

export const resourceMutationSchema = z.union([
  setTopicPrioritySchema.extend({ kind: z.literal('topic-priority') }),
  setQuizLinkSchema.extend({ kind: z.literal('quiz-link') }),
  upsertWeeklyPlanSchema.extend({ kind: z.literal('weekly-plan') }),
]);
export type ResourceMutationInput = z.infer<typeof resourceMutationSchema>;
