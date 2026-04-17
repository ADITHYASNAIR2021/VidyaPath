/**
 * Typed Zod schemas for exam session routes.
 * Routes: /api/exam/session/start
 *         /api/exam/session/submit
 *         /api/exam/session/heartbeat
 */
import { z } from 'zod';

// ── Start exam ────────────────────────────────────────────────────────────

export const startExamSessionSchema = z.object({
  packId: z.string().trim().min(1).max(120),
});
export type StartExamSessionInput = z.infer<typeof startExamSessionSchema>;

// ── Submit exam ───────────────────────────────────────────────────────────

const submissionAnswer = z.object({
  questionNo: z.string().trim().min(1).max(20),
  answerText: z.string().trim().min(1).max(10_000),
});

export const submitExamSchema = z.object({
  sessionId: z.string().trim().min(1).max(120),
  answers: z.array(submissionAnswer).min(1).max(60),
});
export type SubmitExamInput = z.infer<typeof submitExamSchema>;

// ── Heartbeat ─────────────────────────────────────────────────────────────

const violationEvent = z.object({
  eventType: z.string().trim().min(1).max(80),
  detail: z.string().trim().max(300).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
});

export const examHeartbeatSchema = z.object({
  sessionId: z.string().trim().min(1).max(120),
  violations: z.array(violationEvent).max(100).optional(),
});
export type ExamHeartbeatInput = z.infer<typeof examHeartbeatSchema>;
