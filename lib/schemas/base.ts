/**
 * Shared zod primitives. Used by route-level schemas in `lib/schemas/**`
 * and directly by ad-hoc validators. Keep synchronized with DB constraints
 * in `supabase/migrations/`.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const uuid = z.string().uuid();
export const nonEmpty = z.string().trim().min(1);
export const shortId = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._-]+$/, 'id must be alphanumeric (._- allowed)');

export const teacherId = uuid;
export const studentId = uuid;
export const schoolId = uuid;

export const schoolCode = z
  .string()
  .trim()
  .toUpperCase()
  .min(3)
  .max(16)
  .regex(/^[A-Z0-9-]+$/, 'school code must be uppercase alphanumeric');

export const rollCode = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z0-9-]+$/, 'roll code must be alphanumeric');

// ---------------------------------------------------------------------------
// Academic taxonomy (CBSE Class 10 / 12)
// ---------------------------------------------------------------------------

export const classLevel = z.union([z.literal(10), z.literal(12)]);
export const sectionLetter = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(3)
  .regex(/^[A-Z0-9]+$/);

export const stream = z.enum(['Science', 'Commerce', 'Humanities']);

export const cbseSubject = z.enum([
  'Physics',
  'Chemistry',
  'Biology',
  'Mathematics',
  'Computer Science',
  'English',
  'Hindi',
  'Social Science',
  'Economics',
  'Accountancy',
  'Business Studies',
]);

// ---------------------------------------------------------------------------
// Auth / contact
// ---------------------------------------------------------------------------

export const email = z.string().trim().toLowerCase().email();
export const phoneIndia = z
  .string()
  .trim()
  .regex(/^(\+91)?[6-9]\d{9}$/, 'must be a valid Indian mobile number');

export const pin = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, 'PIN must be 4–8 digits');

export const password = z
  .string()
  .min(8, 'password must be at least 8 characters')
  .max(128, 'password too long');

// ---------------------------------------------------------------------------
// Pagination / query
// ---------------------------------------------------------------------------

export const paginationInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationInput>;

export const isoDate = z.string().datetime({ offset: true });
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

// ---------------------------------------------------------------------------
// Common sub-objects
// ---------------------------------------------------------------------------

export const sessionContext = z.object({
  schoolId: schoolId.optional(),
  schoolCode: schoolCode.optional(),
  classLevel: classLevel.optional(),
  section: sectionLetter.optional(),
});

export const rosterEntry = z.object({
  rollCode,
  studentName: nonEmpty.max(120),
  section: sectionLetter,
  classLevel,
  stream: stream.optional(),
});
export type RosterEntry = z.infer<typeof rosterEntry>;
