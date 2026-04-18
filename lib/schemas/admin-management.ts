/**
 * Typed Zod schemas for admin management routes.
 * Covers: teachers, students, schools, class-sections, announcements,
 *         timetable, events, import/roster routes.
 */
import { z } from 'zod';

const classLevel = z.union([z.literal(10), z.literal(12)]);
const importClassLevel = z.union([z.literal(10), z.literal(12), z.literal('10'), z.literal('12')]);
const academicStream = z.enum(['pcm', 'pcb', 'commerce']);
const sectionField = z.string().trim().max(40).optional();
const phoneField = z.string().trim().min(1).max(20);
const uuidField = z.string().trim().min(1).max(120);
const emailField = z.string().trim().toLowerCase().email().max(180);

// ── Create teacher ────────────────────────────────────────────────────────

export const createTeacherSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailField,
  phone: phoneField.optional(),
  staffCode: z.string().trim().max(40).optional(),
  password: z.string().trim().min(8).max(128).optional(),
  schoolId: uuidField.optional(),
  sendCredentialEmail: z.boolean().optional(),
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
  })).max(30).optional(),
  classLevel: classLevel.optional(),
  subject: z.string().trim().min(1).max(80).optional(),
  section: sectionField,
  replaceAll: z.boolean().optional(),
}).superRefine((value, ctx) => {
  const hasSingleScope = !!value.classLevel && !!value.subject;
  const hasScopeList = Array.isArray(value.scopes) && value.scopes.length > 0;
  if (!hasSingleScope && !hasScopeList) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scopes'],
      message: 'Provide either scopes[] or classLevel+subject.',
    });
  }
});
export type UpdateTeacherScopesInput = z.infer<typeof updateTeacherScopesSchema>;

// ── Reset PIN ─────────────────────────────────────────────────────────────

export const resetPinSchema = z.object({
  newPassword: z.string().trim().min(8).max(128).optional(),
  password: z.string().trim().min(8).max(128).optional(),
  generateRandom: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (!value.generateRandom && !value.newPassword && !value.password) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['newPassword'],
      message: 'Provide newPassword or set generateRandom=true.',
    });
  }
});
export type ResetPinInput = z.infer<typeof resetPinSchema>;

// ── Create / update student ───────────────────────────────────────────────

const studentSchemaFields = {
  name: z.string().trim().min(1).max(120),
  classLevel,
  stream: academicStream.optional(),
  section: sectionField,
  batch: z.string().trim().max(40).optional(),
  rollNo: z.string().trim().max(50).optional(),
  rollCode: z.string().trim().max(40).optional(),
  password: z.string().trim().min(8).max(128).optional(),
  yearOfEnrollment: z.coerce.number().int().min(2000).max(2100).optional(),
  subjects: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  schoolName: z.string().trim().max(160).optional(),
  schoolId: uuidField.optional(),
};

export const createStudentSchema = z.object(studentSchemaFields).superRefine((value, ctx) => {
  if (value.classLevel === 10) {
    if (value.stream) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stream'],
        message: 'Class 10 does not use stream.',
      });
    }
    return;
  }
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z.object(studentSchemaFields).partial().extend({
  rollCode: z.string().trim().max(40).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  mustChangePassword: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.classLevel === 10 && value.stream) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stream'],
      message: 'Class 10 does not use stream.',
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
  email: z.string().trim().toLowerCase().email().optional(),
  rollCode: z.string().trim().max(40).optional(),
  rollNo: z.string().trim().max(50).optional(),
  rollNumber: z.string().trim().max(50).optional(),
  section: z.string().trim().max(40).optional(),
  batch: z.string().trim().max(40).optional(),
  classLevel: importClassLevel.optional(),
  class: importClassLevel.optional(),
  stream: academicStream.optional(),
  schoolName: z.string().trim().max(160).optional(),
  schoolCode: z.string().trim().max(32).optional(),
  subjects: z.union([z.string().trim().max(600), z.array(z.string().trim().min(1).max(80)).max(20)]).optional(),
  yearOfEnrollment: z.coerce.number().int().min(2000).max(2100).optional(),
  sectionName: z.string().trim().max(40).optional(),
  staffCode: z.string().trim().max(50).optional(),
  scopeClassLevel: importClassLevel.optional(),
  scopeSubject: z.string().trim().max(80).optional(),
  scopeSection: z.string().trim().max(40).optional(),
  password: z.string().trim().min(8).max(128).optional(),
}).passthrough();

const importSheetsSchema = z.object({
  Teachers: z.array(rosterRow).optional(),
  TeacherScopes: z.array(z.object({
    teacherEmail: z.string().trim().toLowerCase().email(),
    classLevel: importClassLevel,
    subject: z.string().trim().min(1).max(80),
    section: z.string().trim().max(40).optional(),
    schoolName: z.string().trim().max(160).optional(),
    schoolCode: z.string().trim().max(32).optional(),
  }).passthrough()).optional(),
  Students: z.array(rosterRow).optional(),
  StudentSubjects: z.array(z.object({
    studentRollNo: z.string().trim().max(50).optional(),
    studentRollCode: z.string().trim().max(50).optional(),
    studentName: z.string().trim().max(120).optional(),
    subject: z.string().trim().min(1).max(80),
    classLevel: importClassLevel.optional(),
    section: z.string().trim().max(40).optional(),
    schoolName: z.string().trim().max(160).optional(),
    schoolCode: z.string().trim().max(32).optional(),
  }).passthrough()).optional(),
  Schools: z.array(z.object({
    schoolName: z.string().trim().min(1).max(160),
    schoolCode: z.string().trim().max(32).optional(),
  }).passthrough()).optional(),
}).passthrough();

export const importRosterSchema = z.object({
  entity: z.enum(['student', 'teacher', 'students', 'teachers']),
  rows: z.array(rosterRow).max(5000).optional(),
  sheets: importSheetsSchema.optional(),
  mode: z.enum(['simple', 'relational']).optional(),
  dryRun: z.boolean().optional(),
  updateExisting: z.boolean().optional(),
  schoolId: uuidField.optional(),
  emergencyOverride: z.boolean().optional(),
  issueCredentials: z.boolean().optional(),
  forcePasswordChangeOnFirstLogin: z.boolean().optional(),
  sourceFormat: z.enum(['csv', 'tsv', 'xlsx']).optional(),
}).superRefine((value, ctx) => {
  const hasRows = Array.isArray(value.rows) && value.rows.length > 0;
  const hasSheets = !!value.sheets && Object.values(value.sheets).some((entry) => Array.isArray(entry) && entry.length > 0);
  if (!hasRows && !hasSheets) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rows'],
      message: 'Provide rows for simple import, or sheets for relational import.',
    });
  }
});
export type ImportRosterInput = z.infer<typeof importRosterSchema>;

// ── Timetable ─────────────────────────────────────────────────────────────

const timetableDay = z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

const timetableSlot = z.object({
  dayOfWeek: z.coerce.number().int().min(1).max(7).optional(),
  periodNo: z.coerce.number().int().min(1).max(20).optional(),
  day: timetableDay.optional(),
  slot: z.coerce.number().int().min(1).max(20).optional(),
  subject: z.string().trim().min(1).max(80),
  teacherId: uuidField.optional(),
  room: z.string().trim().max(40).optional(),
  startTime: z.string().trim().max(16).optional(),
  endTime: z.string().trim().max(16).optional(),
}).superRefine((value, ctx) => {
  if (!value.dayOfWeek && !value.day) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dayOfWeek'],
      message: 'Provide dayOfWeek (1-7) or day (Mon-Sun).',
    });
  }
  if (!value.periodNo && !value.slot) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['periodNo'],
      message: 'Provide periodNo or slot.',
    });
  }
});

export const upsertTimetableSchema = z.object({
  classLevel,
  section: z.string().trim().min(1).max(40),
  batch: z.string().trim().max(40).optional(),
  periods: z.array(timetableSlot).max(200).optional(),
  slots: z.array(timetableSlot.passthrough()).max(200).optional(),
  replaceAll: z.boolean().optional(),
}).superRefine((value, ctx) => {
  const hasPeriods = Array.isArray(value.periods) && value.periods.length > 0;
  const hasSlots = Array.isArray(value.slots) && value.slots.length > 0;
  if (!hasPeriods && !hasSlots) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['slots'],
      message: 'Provide at least one timetable slot.',
    });
  }
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
