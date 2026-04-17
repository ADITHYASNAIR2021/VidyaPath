/**
 * Typed Zod schemas for admin management routes.
 * Covers: teachers, students, schools, class-sections, announcements,
 *         timetable, events, import/roster routes.
 */
import { z } from 'zod';

const classLevel = z.union([z.literal(10), z.literal(12)]);
const academicStream = z.enum(['foundation', 'pcm', 'pcb', 'commerce', 'interdisciplinary']);
const sectionField = z.string().trim().max(40).optional();
const phoneField = z.string().trim().min(1).max(20);
const uuidField = z.string().trim().min(1).max(120);

// ── Create teacher ────────────────────────────────────────────────────────

export const createTeacherSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phoneField,
  staffCode: z.string().trim().max(40).optional(),
  pin: z.string().trim().max(12).optional(),
  schoolId: uuidField.optional(),
  scopes: z.array(z.object({
    classLevel,
    subject: z.string().trim().min(1).max(80),
    section: sectionField,
  })).max(20).optional(),
});
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;

// ── Update teacher ────────────────────────────────────────────────────────

export const updateTeacherSchema = createTeacherSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
});
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;

// ── Teacher scopes ────────────────────────────────────────────────────────

export const updateTeacherScopesSchema = z.object({
  scopes: z.array(z.object({
    classLevel,
    subject: z.string().trim().min(1).max(80),
    section: sectionField,
    isActive: z.boolean().optional(),
  })).max(30),
  replaceAll: z.boolean().optional(),
});
export type UpdateTeacherScopesInput = z.infer<typeof updateTeacherScopesSchema>;

// ── Reset PIN ─────────────────────────────────────────────────────────────

export const resetPinSchema = z.object({
  newPin: z.string().trim().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits').optional(),
  pin: z.string().trim().max(16).optional(),
  generateRandom: z.boolean().optional(),
});
export type ResetPinInput = z.infer<typeof resetPinSchema>;

// ── Create / update student ───────────────────────────────────────────────

export const createStudentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  classLevel,
  stream: academicStream.optional(),
  section: sectionField,
  batch: z.string().trim().max(40).optional(),
  rollNo: z.string().trim().max(50).optional(),
  rollCode: z.string().trim().max(40).optional(),
  pin: z.string().trim().max(12).optional(),
  schoolId: uuidField.optional(),
}).superRefine((value, ctx) => {
  if (value.classLevel === 10) {
    if (value.stream && value.stream !== 'foundation') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stream'],
        message: 'Class 10 stream must be foundation.',
      });
    }
    return;
  }
  if (!value.stream || value.stream === 'foundation') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stream'],
      message: 'Class 12 stream is required: pcm, pcb, commerce, or interdisciplinary.',
    });
  }
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial().extend({
  rollCode: z.string().trim().max(40).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  mustChangePassword: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.classLevel === 10 && value.stream && value.stream !== 'foundation') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stream'],
      message: 'Class 10 stream must be foundation.',
    });
  }
  if (value.classLevel === 12 && (!value.stream || value.stream === 'foundation')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stream'],
      message: 'Class 12 stream is required when classLevel is updated to 12.',
    });
  }
});
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

// ── Link parent ───────────────────────────────────────────────────────────

export const linkParentSchema = z.object({
  phone: phoneField,
  name: z.string().trim().max(120).optional(),
  pin: z.string().trim().max(12).optional(),
});
export type LinkParentInput = z.infer<typeof linkParentSchema>;

// ── Create class section ──────────────────────────────────────────────────

export const createClassSectionSchema = z.object({
  classLevel,
  section: z.string().trim().min(1).max(40),
  batch: z.string().trim().max(40).optional(),
  classTeacherId: uuidField.optional(),
  schoolId: uuidField.optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateClassSectionInput = z.infer<typeof createClassSectionSchema>;

// ── Update class section ──────────────────────────────────────────────────

export const updateClassSectionSchema = createClassSectionSchema.partial().extend({
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(['active', 'archived', 'inactive']).optional(),
});
export type UpdateClassSectionInput = z.infer<typeof updateClassSectionSchema>;

// ── Announcement ──────────────────────────────────────────────────────────

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  classLevel: classLevel.optional(),
  section: sectionField,
  chapterId: z.string().trim().max(120).optional(),
  deliveryScope: z.enum(['class', 'section', 'batch', 'chapter', 'all']).optional(),
  batch: z.string().trim().max(40).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  audience: z.string().trim().max(80).optional(),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

// ── Roster import ─────────────────────────────────────────────────────────

const rosterRow = z.object({
  name: z.string().trim().min(1).max(120),
  rollCode: z.string().trim().max(40).optional(),
  rollNo: z.string().trim().max(50).optional(),
  section: z.string().trim().max(40).optional(),
  batch: z.string().trim().max(40).optional(),
  classLevel: classLevel.optional(),
  stream: academicStream.optional(),
  pin: z.string().trim().max(12).optional(),
});

export const importRosterSchema = z.object({
  students: z.array(rosterRow).min(1).max(5000),
  classLevel: classLevel.optional(),
  section: sectionField,
  batch: z.string().trim().max(40).optional(),
  dryRun: z.boolean().optional(),
  updateExisting: z.boolean().optional(),
  schoolId: uuidField.optional(),
  emergencyOverride: z.boolean().optional(),
  entity: z.enum(['student', 'teacher', 'students', 'teachers']).optional(),
  rows: z.array(rosterRow.passthrough()).optional(),
});
export type ImportRosterInput = z.infer<typeof importRosterSchema>;

// ── Timetable ─────────────────────────────────────────────────────────────

const timetablePeriod = z.object({
  day: z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
  slot: z.number().int().min(1).max(12),
  subject: z.string().trim().min(1).max(80),
  teacherId: uuidField.optional(),
  room: z.string().trim().max(40).optional(),
});

export const upsertTimetableSchema = z.object({
  classLevel,
  section: z.string().trim().min(1).max(40),
  batch: z.string().trim().max(40).optional(),
  periods: z.array(timetablePeriod).max(100).optional(),
  slots: z.array(timetablePeriod.passthrough()).max(100).optional(),
  replaceAll: z.boolean().optional(),
});
export type UpsertTimetableInput = z.infer<typeof upsertTimetableSchema>;

// ── Events ────────────────────────────────────────────────────────────────

export const createSchoolEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  eventDate: z.string().trim().max(40).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type: z.string().trim().max(60).optional(),
  kind: z.enum(['exam', 'holiday', 'sports', 'cultural', 'academic', 'other']).optional(),
  classLevel: classLevel.optional(),
  section: sectionField,
});
export type CreateSchoolEventInput = z.infer<typeof createSchoolEventSchema>;
