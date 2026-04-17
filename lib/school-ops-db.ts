import { randomUUID } from 'node:crypto';
import { supabaseDelete, supabaseInsert, supabaseSelect, supabaseUpdate, isSupabaseServiceConfigured } from '@/lib/supabase-rest';

type RowId = string;

const TABLES = {
  students: 'student_profiles',
  teachers: 'teacher_profiles',
  attendance: 'attendance_records',
  resources: 'class_resources',
  events: 'school_events',
  timetable: 'timetable_slots',
  announcements: 'school_announcements',
  assignmentPacks: 'teacher_assignment_packs',
  submissions: 'teacher_submissions',
};

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
type ResourceType = 'pdf' | 'link' | 'video' | 'image';
type EventType = 'exam' | 'assignment_due' | 'holiday' | 'meeting' | 'other';
type AnnouncementAudience = 'all' | 'teachers' | 'students' | 'class10' | 'class12';

interface StudentProfileRow {
  id: RowId;
  school_id: RowId | null;
  name: string;
  roll_no: string | null;
  roll_code: string;
  class_level: number;
  section: string | null;
  batch: string | null;
  status: 'active' | 'inactive';
}

interface AttendanceRecordRow {
  id: RowId;
  school_id: RowId;
  teacher_id: RowId;
  student_id: RowId;
  class_level: number;
  section: string;
  date: string;
  status: AttendanceStatus;
  marked_at: string;
}

interface ClassResourceRow {
  id: RowId;
  school_id: RowId;
  teacher_id: RowId;
  title: string;
  description: string | null;
  type: ResourceType;
  url: string;
  subject: string | null;
  class_level: number | null;
  section: string | null;
  chapter_id: string | null;
  created_at: string;
  updated_at?: string | null;
}

interface SchoolEventRow {
  id: RowId;
  school_id: RowId;
  title: string;
  description: string | null;
  type: EventType;
  event_date: string;
  class_level: number | null;
  section: string | null;
  created_by: string;
  created_at: string;
  updated_at?: string | null;
}

interface TimetableSlotRow {
  id: RowId;
  school_id: RowId;
  class_level: number;
  section: string;
  day_of_week: number;
  period_no: number;
  subject: string;
  teacher_id: RowId | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  updated_at?: string | null;
}

interface SchoolAnnouncementRow {
  id: RowId;
  school_id: RowId;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  created_by_role: 'admin' | 'developer';
  created_by_auth_user_id: string | null;
  created_at: string;
  updated_at?: string | null;
}

interface AssignmentPackRow {
  id: RowId;
  teacher_id: RowId;
  school_id?: RowId | null;
  chapter_id: string;
  class_level: number;
  subject: string;
  section: string | null;
  status: 'draft' | 'review' | 'published' | 'archived';
  payload: Record<string, unknown> | null;
}

interface TeacherSchoolLookupRow {
  id: RowId;
  school_id: RowId | null;
}

interface SubmissionRow {
  id: RowId;
  pack_id: RowId;
  student_id: RowId | null;
  student_name: string;
  submission_code: string;
  attempt_no: number;
  status: 'pending_review' | 'graded' | 'released';
  grading: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  released_at: string | null;
  created_at: string;
}

export interface StudentRosterItem {
  id: string;
  name: string;
  rollNo?: string;
  rollCode: string;
  classLevel: 10 | 12;
  section?: string;
  batch?: string;
}

export interface AttendanceItem {
  id: string;
  studentId: string;
  date: string;
  status: AttendanceStatus;
  markedAt: string;
}

export interface ResourceItem {
  id: string;
  title: string;
  description?: string;
  type: ResourceType;
  url: string;
  subject?: string;
  classLevel?: 10 | 12;
  section?: string;
  chapterId?: string;
  createdAt: string;
  teacherId: string;
}

export interface EventItem {
  id: string;
  title: string;
  description?: string;
  type: EventType;
  eventDate: string;
  classLevel?: 10 | 12;
  section?: string;
  createdBy: string;
  createdAt: string;
}

export interface TimetableSlotItem {
  id: string;
  classLevel: 10 | 12;
  section: string;
  dayOfWeek: number;
  periodNo: number;
  subject: string;
  teacherId?: string;
  startTime?: string;
  endTime?: string;
}

export interface SchoolAnnouncementItem {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  createdByRole: 'admin' | 'developer';
  createdAt: string;
}

export interface TeacherGradebookPack {
  packId: string;
  title: string;
  chapterId: string;
  subject: string;
  classLevel: 10 | 12;
  section?: string;
  status: AssignmentPackRow['status'];
}

export interface TeacherGradebookStudent {
  studentId?: string;
  studentName: string;
  submissionCode: string;
  scores: Record<string, number>;
  attempts: number;
  releasedCount: number;
  overallScore: number;
}

function sanitizeText(value: string, max = 220): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeId(value: string): string {
  return sanitizeText(value, 90);
}

function toClassLevel(value: unknown): 10 | 12 | null {
  const parsed = Number(value);
  if (parsed === 10 || parsed === 12) return parsed;
  return null;
}

function toSection(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = sanitizeText(value, 40).toUpperCase();
  return clean || undefined;
}

function parseGradePercent(row: SubmissionRow): number | null {
  const gradingPercentage = Number((row.grading as Record<string, unknown> | null)?.percentage);
  if (Number.isFinite(gradingPercentage)) return Math.max(0, Math.min(100, gradingPercentage));
  const scoreEstimate = Number((row.result as Record<string, unknown> | null)?.scoreEstimate);
  if (Number.isFinite(scoreEstimate)) return Math.max(0, Math.min(100, scoreEstimate));
  return null;
}

export async function listStudentsBySection(input: {
  schoolId: string;
  classLevel: 10 | 12;
  section: string;
  batch?: string;
}): Promise<StudentRosterItem[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const schoolId = sanitizeId(input.schoolId);
  const section = sanitizeText(input.section, 40).toUpperCase();
  if (!schoolId || !section) return [];
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'school_id', value: schoolId },
    { column: 'class_level', value: input.classLevel },
    { column: 'section', value: section },
    { column: 'status', value: 'active' },
  ];
  if (input.batch) filters.push({ column: 'batch', value: sanitizeText(input.batch, 40).toUpperCase() });
  const rows = await supabaseSelect<StudentProfileRow>(TABLES.students, {
    select: 'id,school_id,name,roll_no,roll_code,class_level,section,batch,status',
    filters,
    orderBy: 'name',
    ascending: true,
    limit: 20000,
  }).catch(() => []);
  return rows
    .map((row) => {
      const classLevel = toClassLevel(row.class_level);
      if (!classLevel) return null;
      return {
        id: row.id,
        name: sanitizeText(row.name, 120) || 'Student',
        rollNo: row.roll_no ?? undefined,
        rollCode: row.roll_code,
        classLevel,
        section: row.section ?? undefined,
        batch: row.batch ?? undefined,
      } as StudentRosterItem;
    })
    .filter((item): item is StudentRosterItem => !!item);
}

export async function listAttendanceBySection(input: {
  schoolId: string;
  classLevel: 10 | 12;
  section: string;
  date: string;
}): Promise<AttendanceItem[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const schoolId = sanitizeId(input.schoolId);
  const section = sanitizeText(input.section, 40).toUpperCase();
  const date = sanitizeText(input.date, 20);
  if (!schoolId || !section || !date) return [];
  const rows = await supabaseSelect<AttendanceRecordRow>(TABLES.attendance, {
    select: '*',
    filters: [
      { column: 'school_id', value: schoolId },
      { column: 'class_level', value: input.classLevel },
      { column: 'section', value: section },
      { column: 'date', value: date },
    ],
    limit: 50000,
  }).catch(() => []);
  return rows.map((row) => ({
    id: row.id,
    studentId: row.student_id,
    date: row.date,
    status: row.status,
    markedAt: row.marked_at,
  }));
}

export async function markAttendanceBulk(input: {
  schoolId: string;
  teacherId: string;
  classLevel: 10 | 12;
  section: string;
  date: string;
  records: Array<{ studentId: string; status: AttendanceStatus }>;
}): Promise<{ marked: number; updated: number }> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const schoolId = sanitizeId(input.schoolId);
  const teacherId = sanitizeId(input.teacherId);
  const section = sanitizeText(input.section, 40).toUpperCase();
  const date = sanitizeText(input.date, 20);
  if (!schoolId || !teacherId || !section || !date) {
    throw new Error('schoolId, teacherId, section, and date are required.');
  }
  const validStatuses = new Set<AttendanceStatus>(['present', 'absent', 'late', 'excused']);
  const uniqueRecords = new Map<string, AttendanceStatus>();
  for (const item of input.records) {
    const studentId = sanitizeId(item.studentId);
    if (!studentId || !validStatuses.has(item.status)) continue;
    uniqueRecords.set(studentId, item.status);
  }
  let marked = 0;
  let updated = 0;
  for (const [studentId, status] of uniqueRecords.entries()) {
    const existing = await supabaseSelect<AttendanceRecordRow>(TABLES.attendance, {
      select: 'id',
      filters: [{ column: 'student_id', value: studentId }, { column: 'date', value: date }],
      limit: 1,
    }).catch(() => []);
    if (existing[0]?.id) {
      const rows = await supabaseUpdate<AttendanceRecordRow>(
        TABLES.attendance,
        {
          status,
          teacher_id: teacherId,
          school_id: schoolId,
          class_level: input.classLevel,
          section,
          marked_at: new Date().toISOString(),
        },
        [{ column: 'id', value: existing[0].id }]
      ).catch(() => []);
      if (rows[0]) updated += 1;
      continue;
    }
    const rows = await supabaseInsert<AttendanceRecordRow>(TABLES.attendance, {
      id: randomUUID(),
      school_id: schoolId,
      teacher_id: teacherId,
      student_id: studentId,
      class_level: input.classLevel,
      section,
      date,
      status,
      marked_at: new Date().toISOString(),
    }).catch(() => []);
    if (rows[0]) marked += 1;
  }
  return { marked, updated };
}

export async function getStudentAttendanceSummary(input: {
  studentId: string;
  schoolId?: string;
  days?: number;
}): Promise<{
  percentage: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  recent: AttendanceItem[];
}> {
  if (!isSupabaseServiceConfigured()) {
    return { percentage: 0, present: 0, absent: 0, late: 0, excused: 0, total: 0, recent: [] };
  }
  const studentId = sanitizeId(input.studentId);
  if (!studentId) return { percentage: 0, present: 0, absent: 0, late: 0, excused: 0, total: 0, recent: [] };
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'student_id', value: studentId },
  ];
  if (input.schoolId) filters.push({ column: 'school_id', value: sanitizeId(input.schoolId) });
  if (Number.isFinite(input.days) && (input.days ?? 0) > 0) {
    const since = new Date();
    since.setDate(since.getDate() - Math.max(1, Math.min(365, Number(input.days))));
    filters.push({ column: 'date', op: 'gte', value: since.toISOString().slice(0, 10) });
  }
  const rows = await supabaseSelect<AttendanceRecordRow>(TABLES.attendance, {
    select: '*',
    filters,
    orderBy: 'date',
    ascending: false,
    limit: 1000,
  }).catch(() => []);
  let present = 0;
  let absent = 0;
  let late = 0;
  let excused = 0;
  for (const row of rows) {
    if (row.status === 'present') present += 1;
    if (row.status === 'absent') absent += 1;
    if (row.status === 'late') late += 1;
    if (row.status === 'excused') excused += 1;
  }
  const total = rows.length;
  const percentage = total > 0 ? Math.round(((present + late * 0.5 + excused * 0.5) / total) * 10000) / 100 : 0;
  return {
    percentage,
    present,
    absent,
    late,
    excused,
    total,
    recent: rows.slice(0, 30).map((row) => ({
      id: row.id,
      studentId: row.student_id,
      date: row.date,
      status: row.status,
      markedAt: row.marked_at,
    })),
  };
}

export async function listResources(input: {
  schoolId: string;
  teacherId?: string;
  classLevel?: 10 | 12;
  section?: string;
  chapterId?: string;
  subject?: string;
  limit?: number;
}): Promise<ResourceItem[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'school_id', value: sanitizeId(input.schoolId) },
  ];
  if (input.teacherId) filters.push({ column: 'teacher_id', value: sanitizeId(input.teacherId) });
  if (input.classLevel) filters.push({ column: 'class_level', value: input.classLevel });
  if (input.section) filters.push({ column: 'section', value: sanitizeText(input.section, 40).toUpperCase() });
  if (input.chapterId) filters.push({ column: 'chapter_id', value: sanitizeText(input.chapterId, 80) });
  if (input.subject) filters.push({ column: 'subject', value: sanitizeText(input.subject, 80) });
  const rows = await supabaseSelect<ClassResourceRow>(TABLES.resources, {
    select: '*',
    filters,
    orderBy: 'created_at',
    ascending: false,
    limit: Number.isFinite(input.limit) ? Math.max(1, Math.min(500, Number(input.limit))) : 200,
  }).catch(() => []);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    type: row.type,
    url: row.url,
    subject: row.subject ?? undefined,
    classLevel: toClassLevel(row.class_level ?? undefined) ?? undefined,
    section: row.section ?? undefined,
    chapterId: row.chapter_id ?? undefined,
    createdAt: row.created_at,
    teacherId: row.teacher_id,
  }));
}

export async function createResource(input: {
  schoolId: string;
  teacherId: string;
  title: string;
  description?: string;
  type: ResourceType;
  url: string;
  subject?: string;
  classLevel?: 10 | 12;
  section?: string;
  chapterId?: string;
}): Promise<ResourceItem> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const [row] = await supabaseInsert<ClassResourceRow>(TABLES.resources, {
    id: randomUUID(),
    school_id: sanitizeId(input.schoolId),
    teacher_id: sanitizeId(input.teacherId),
    title: sanitizeText(input.title, 180),
    description: input.description ? sanitizeText(input.description, 1000) : null,
    type: input.type,
    url: sanitizeText(input.url, 1500),
    subject: input.subject ? sanitizeText(input.subject, 80) : null,
    class_level: input.classLevel ?? null,
    section: input.section ? sanitizeText(input.section, 40).toUpperCase() : null,
    chapter_id: input.chapterId ? sanitizeText(input.chapterId, 80) : null,
  });
  if (!row) throw new Error('Failed to create resource.');
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    type: row.type,
    url: row.url,
    subject: row.subject ?? undefined,
    classLevel: toClassLevel(row.class_level ?? undefined) ?? undefined,
    section: row.section ?? undefined,
    chapterId: row.chapter_id ?? undefined,
    createdAt: row.created_at,
    teacherId: row.teacher_id,
  };
}

export async function deleteResource(input: {
  resourceId: string;
  schoolId: string;
  teacherId?: string;
}): Promise<boolean> {
  if (!isSupabaseServiceConfigured()) return false;
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'id', value: sanitizeId(input.resourceId) },
    { column: 'school_id', value: sanitizeId(input.schoolId) },
  ];
  if (input.teacherId) filters.push({ column: 'teacher_id', value: sanitizeId(input.teacherId) });
  const rows = await supabaseDelete<ClassResourceRow>(TABLES.resources, filters, true).catch(() => []);
  return rows.length > 0;
}

export async function listSchoolEvents(input: {
  schoolId: string;
  classLevel?: 10 | 12;
  section?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<EventItem[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'school_id', value: sanitizeId(input.schoolId) },
  ];
  if (input.classLevel) filters.push({ column: 'class_level', value: input.classLevel });
  if (input.section) filters.push({ column: 'section', value: sanitizeText(input.section, 40).toUpperCase() });
  if (input.fromDate) filters.push({ column: 'event_date', op: 'gte', value: sanitizeText(input.fromDate, 20) });
  if (input.toDate) filters.push({ column: 'event_date', op: 'lte', value: sanitizeText(input.toDate, 20) });
  const rows = await supabaseSelect<SchoolEventRow>(TABLES.events, {
    select: '*',
    filters,
    orderBy: 'event_date',
    ascending: true,
    limit: Number.isFinite(input.limit) ? Math.max(1, Math.min(1000, Number(input.limit))) : 400,
  }).catch(() => []);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    type: row.type,
    eventDate: row.event_date,
    classLevel: toClassLevel(row.class_level ?? undefined) ?? undefined,
    section: row.section ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

export async function createSchoolEvent(input: {
  schoolId: string;
  title: string;
  description?: string;
  type: EventType;
  eventDate: string;
  classLevel?: 10 | 12;
  section?: string;
  createdBy: string;
}): Promise<EventItem> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const [row] = await supabaseInsert<SchoolEventRow>(TABLES.events, {
    id: randomUUID(),
    school_id: sanitizeId(input.schoolId),
    title: sanitizeText(input.title, 180),
    description: input.description ? sanitizeText(input.description, 1200) : null,
    type: input.type,
    event_date: sanitizeText(input.eventDate, 20),
    class_level: input.classLevel ?? null,
    section: input.section ? sanitizeText(input.section, 40).toUpperCase() : null,
    created_by: sanitizeText(input.createdBy, 140),
  });
  if (!row) throw new Error('Failed to create school event.');
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    type: row.type,
    eventDate: row.event_date,
    classLevel: toClassLevel(row.class_level ?? undefined) ?? undefined,
    section: row.section ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function deleteSchoolEvent(input: {
  eventId: string;
  schoolId: string;
}): Promise<boolean> {
  if (!isSupabaseServiceConfigured()) return false;
  const rows = await supabaseDelete<SchoolEventRow>(
    TABLES.events,
    [{ column: 'id', value: sanitizeId(input.eventId) }, { column: 'school_id', value: sanitizeId(input.schoolId) }],
    true
  ).catch(() => []);
  return rows.length > 0;
}

export async function listTimetableSlots(input: {
  schoolId: string;
  classLevel: 10 | 12;
  section: string;
}): Promise<TimetableSlotItem[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const rows = await supabaseSelect<TimetableSlotRow>(TABLES.timetable, {
    select: '*',
    filters: [
      { column: 'school_id', value: sanitizeId(input.schoolId) },
      { column: 'class_level', value: input.classLevel },
      { column: 'section', value: sanitizeText(input.section, 40).toUpperCase() },
    ],
    orderBy: 'day_of_week',
    ascending: true,
    limit: 500,
  }).catch(() => []);
  return rows
    .sort((a, b) => (a.day_of_week - b.day_of_week) || (a.period_no - b.period_no))
    .map((row) => ({
      id: row.id,
      classLevel: (toClassLevel(row.class_level) ?? input.classLevel),
      section: row.section,
      dayOfWeek: row.day_of_week,
      periodNo: row.period_no,
      subject: row.subject,
      teacherId: row.teacher_id ?? undefined,
      startTime: row.start_time ?? undefined,
      endTime: row.end_time ?? undefined,
    }));
}

export async function replaceTimetableSlots(input: {
  schoolId: string;
  classLevel: 10 | 12;
  section: string;
  slots: Array<{
    dayOfWeek: number;
    periodNo: number;
    subject: string;
    teacherId?: string;
    startTime?: string;
    endTime?: string;
  }>;
}): Promise<{ inserted: number }> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const schoolId = sanitizeId(input.schoolId);
  const section = sanitizeText(input.section, 40).toUpperCase();
  await supabaseDelete<TimetableSlotRow>(
    TABLES.timetable,
    [
      { column: 'school_id', value: schoolId },
      { column: 'class_level', value: input.classLevel },
      { column: 'section', value: section },
    ],
    false
  ).catch(() => []);

  const payload = input.slots
    .map((slot) => ({
      id: randomUUID(),
      school_id: schoolId,
      class_level: input.classLevel,
      section,
      day_of_week: Number(slot.dayOfWeek),
      period_no: Number(slot.periodNo),
      subject: sanitizeText(slot.subject, 120),
      teacher_id: slot.teacherId ? sanitizeId(slot.teacherId) : null,
      start_time: slot.startTime ? sanitizeText(slot.startTime, 20) : null,
      end_time: slot.endTime ? sanitizeText(slot.endTime, 20) : null,
    }))
    .filter((slot) =>
      slot.day_of_week >= 1 &&
      slot.day_of_week <= 7 &&
      slot.period_no >= 1 &&
      slot.period_no <= 20 &&
      !!slot.subject
    );
  if (payload.length === 0) return { inserted: 0 };
  const rows = await supabaseInsert<TimetableSlotRow>(TABLES.timetable, payload).catch(() => []);
  return { inserted: rows.length };
}

export async function listSchoolAnnouncements(input: {
  schoolId: string;
  audience?: AnnouncementAudience;
  limit?: number;
}): Promise<SchoolAnnouncementItem[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'school_id', value: sanitizeId(input.schoolId) },
  ];
  if (input.audience) filters.push({ column: 'audience', value: input.audience });
  const rows = await supabaseSelect<SchoolAnnouncementRow>(TABLES.announcements, {
    select: '*',
    filters,
    orderBy: 'created_at',
    ascending: false,
    limit: Number.isFinite(input.limit) ? Math.max(1, Math.min(500, Number(input.limit))) : 120,
  }).catch(() => []);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    createdByRole: row.created_by_role,
    createdAt: row.created_at,
  }));
}

export async function createSchoolAnnouncement(input: {
  schoolId: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  createdByRole: 'admin' | 'developer';
  createdByAuthUserId?: string;
}): Promise<SchoolAnnouncementItem> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const [row] = await supabaseInsert<SchoolAnnouncementRow>(TABLES.announcements, {
    id: randomUUID(),
    school_id: sanitizeId(input.schoolId),
    title: sanitizeText(input.title, 180),
    body: sanitizeText(input.body, 3000),
    audience: input.audience,
    created_by_role: input.createdByRole,
    created_by_auth_user_id: input.createdByAuthUserId ? sanitizeId(input.createdByAuthUserId) : null,
  });
  if (!row) throw new Error('Failed to create school announcement.');
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    createdByRole: row.created_by_role,
    createdAt: row.created_at,
  };
}

export async function listTeacherGradebook(teacherId: string): Promise<{
  packs: TeacherGradebookPack[];
  students: TeacherGradebookStudent[];
  summary: {
    students: number;
    packs: number;
    overallAverage: number;
  };
}> {
  if (!isSupabaseServiceConfigured()) {
    return { packs: [], students: [], summary: { students: 0, packs: 0, overallAverage: 0 } };
  }
  const packs = await supabaseSelect<AssignmentPackRow>(TABLES.assignmentPacks, {
    select: 'id,teacher_id,chapter_id,class_level,subject,section,status,payload',
    filters: [{ column: 'teacher_id', value: sanitizeId(teacherId) }],
    orderBy: 'class_level',
    ascending: true,
    limit: 5000,
  }).catch(() => []);
  const packSet = new Set(packs.map((item) => item.id));
  if (packSet.size === 0) {
    return { packs: [], students: [], summary: { students: 0, packs: 0, overallAverage: 0 } };
  }
  const submissions = await supabaseSelect<SubmissionRow>(TABLES.submissions, {
    select: '*',
    orderBy: 'created_at',
    ascending: false,
    limit: 25000,
  }).catch(() => []);
  const scopedSubmissions = submissions.filter((item) => packSet.has(item.pack_id));

  const packList: TeacherGradebookPack[] = packs.map((row) => ({
    packId: row.id,
    title:
      (row.payload && typeof row.payload.title === 'string' && sanitizeText(row.payload.title, 180)) ||
      `${row.subject} · ${row.chapter_id}`,
    chapterId: row.chapter_id,
    subject: row.subject,
    classLevel: (toClassLevel(row.class_level) ?? 12),
    section: row.section ?? undefined,
    status: row.status,
  }));

  const studentMap = new Map<string, TeacherGradebookStudent>();
  for (const row of scopedSubmissions) {
    const score = parseGradePercent(row);
    if (score === null) continue;
    const key = `${row.student_id ?? ''}::${row.submission_code}::${row.student_name}`;
    const current = studentMap.get(key) ?? {
      studentId: row.student_id ?? undefined,
      studentName: sanitizeText(row.student_name || 'Student', 120) || 'Student',
      submissionCode: row.submission_code,
      scores: {},
      attempts: 0,
      releasedCount: 0,
      overallScore: 0,
    };
    current.attempts += 1;
    if (row.status === 'released') current.releasedCount += 1;
    const prevScore = current.scores[row.pack_id];
    if (prevScore === undefined || score >= prevScore) current.scores[row.pack_id] = score;
    studentMap.set(key, current);
  }

  const students = [...studentMap.values()].map((item) => {
    const values = Object.values(item.scores);
    const overallScore = values.length > 0 ? Math.round((values.reduce((sum, score) => sum + score, 0) / values.length) * 100) / 100 : 0;
    return { ...item, overallScore };
  }).sort((a, b) => b.overallScore - a.overallScore);

  const overallAverage = students.length > 0
    ? Math.round((students.reduce((sum, item) => sum + item.overallScore, 0) / students.length) * 100) / 100
    : 0;

  return {
    packs: packList,
    students,
    summary: {
      students: students.length,
      packs: packList.length,
      overallAverage,
    },
  };
}

export async function listStudentGrades(input: {
  studentId: string;
  rollCode?: string;
  schoolId?: string;
}): Promise<Array<{
  submissionId: string;
  packId: string;
  chapterId: string;
  subject: string;
  classLevel: 10 | 12;
  section?: string;
  score: number;
  status: SubmissionRow['status'];
  releasedAt?: string;
  createdAt: string;
}>> {
  if (!isSupabaseServiceConfigured()) return [];
  const studentId = sanitizeId(input.studentId);
  const rollCode = input.rollCode ? sanitizeText(input.rollCode, 80).toUpperCase() : '';
  const schoolId = input.schoolId ? sanitizeId(input.schoolId) : '';
  const byStudent = await supabaseSelect<SubmissionRow>(TABLES.submissions, {
    select: '*',
    filters: [{ column: 'student_id', value: studentId }],
    orderBy: 'created_at',
    ascending: false,
    limit: 10000,
  }).catch(() => []);
  const byRollCode = rollCode
    ? await supabaseSelect<SubmissionRow>(TABLES.submissions, {
      select: '*',
      filters: [{ column: 'submission_code', value: rollCode }],
      orderBy: 'created_at',
      ascending: false,
      limit: 10000,
    }).catch(() => [])
    : [];
  const all = [...byStudent, ...byRollCode];
  const dedup = new Map<string, SubmissionRow>();
  for (const row of all) dedup.set(row.id, row);
  const scopedSubmissions = [...dedup.values()].filter(
    (row) => row.status === 'released' && typeof row.released_at === 'string' && row.released_at.length > 0
  );
  if (scopedSubmissions.length === 0) return [];
  const packIds = [...new Set(scopedSubmissions.map((row) => row.pack_id))];
  const packs = await supabaseSelect<AssignmentPackRow>(TABLES.assignmentPacks, {
    select: 'id,teacher_id,school_id,chapter_id,class_level,subject,section,status,payload',
    limit: 10000,
  }).catch(() => []);
  const packMap = new Map(packs.filter((row) => packIds.includes(row.id)).map((row) => [row.id, row]));
  const teacherSchoolMap = new Map<string, string>();
  if (schoolId) {
    const teacherIdsToResolve = [...new Set(
      [...packMap.values()]
        .filter((row) => !row.school_id && row.teacher_id)
        .map((row) => row.teacher_id)
    )];
    if (teacherIdsToResolve.length > 0) {
      const teacherIdSet = new Set(teacherIdsToResolve);
      const teacherRows = await supabaseSelect<TeacherSchoolLookupRow>(TABLES.teachers, {
        select: 'id,school_id',
        limit: 10000,
      }).catch(() => []);
      for (const teacherRow of teacherRows) {
        if (teacherIdSet.has(teacherRow.id) && teacherRow.school_id) {
          teacherSchoolMap.set(teacherRow.id, teacherRow.school_id);
        }
      }
    }
  }
  return scopedSubmissions
    .map((row) => {
      const pack = packMap.get(row.pack_id);
      if (!pack) return null;
      if (schoolId) {
        const packSchoolId = pack.school_id || teacherSchoolMap.get(pack.teacher_id) || '';
        if (!packSchoolId || packSchoolId !== schoolId) return null;
      }
      const score = parseGradePercent(row);
      if (score === null) return null;
      return {
        submissionId: row.id,
        packId: row.pack_id,
        chapterId: pack.chapter_id,
        subject: pack.subject,
        classLevel: toClassLevel(pack.class_level) ?? 12,
        section: pack.section ?? undefined,
        score,
        status: row.status,
        releasedAt: row.released_at ?? undefined,
        createdAt: row.created_at,
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
