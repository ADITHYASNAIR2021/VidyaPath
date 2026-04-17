/**
 * Typed Zod schemas for teacher roster / class-section routes.
 * Routes: /api/teacher/class-sections/[id]/enroll-subjects
 *         /api/teacher/class-sections/students/import
 */
import { z } from 'zod';

// ── Enroll subjects ───────────────────────────────────────────────────────

export const enrollSubjectsSchema = z.object({
  subjects: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  classLevel: z.union([z.literal(10), z.literal(12)]).optional(),
  section: z.string().trim().max(40).optional(),
});
export type EnrollSubjectsInput = z.infer<typeof enrollSubjectsSchema>;

// ── Import students ───────────────────────────────────────────────────────

const studentImportRow = z.object({
  name: z.string().trim().min(1).max(120),
  rollCode: z.string().trim().max(40).optional(),
  rollNo: z.string().trim().max(50).optional(),
  roll: z.string().trim().max(50).optional(),
  roll_number: z.string().trim().max(50).optional(),
  section: z.string().trim().max(40).optional(),
  batch: z.string().trim().max(40).optional(),
  classLevel: z.union([z.literal(10), z.literal(12)]).optional(),
  pin: z.string().trim().max(16).optional(),
}).passthrough();

export const importStudentsSchema = z.object({
  classSectionId: z.string().trim().min(1).max(90),
  rows: z.array(studentImportRow).min(1).max(1500),
  emergencyOverride: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});
export type ImportStudentsInput = z.infer<typeof importStudentsSchema>;
