import { randomUUID } from 'node:crypto';
import { ALL_CHAPTERS, getChapterById } from '@/lib/data';
import { isSupportedSubject } from '@/lib/academic-taxonomy';
import { getAnalyticsSummary } from '@/lib/analytics-store';
import { hashPin, verifyPin } from '@/lib/auth/pin';
import { createSupabaseAuthUser } from '@/lib/auth/supabase-auth';
import type {
  ExamIntegritySummary,
  ExamSession,
  ExamViolationEvent,
  PublicTeacherConfig,
  TeacherActionHistoryEntry,
  TeacherAnnouncement,
  TeacherAssignmentAnalytics,
  TeacherAssignmentPack,
  TeacherClassPreset,
  TeacherProfile,
  TeacherScope,
  TeacherSectionCode,
  TeacherSession,
  TeacherSubmission,
  TeacherSubmissionAnswer,
  TeacherSubmissionAttemptDetail,
  TeacherSubmissionAttemptRow,
  TeacherSubmissionTrendPoint,
  TeacherQuestionResult,
  TeacherQuestionStat,
  TeacherSubmissionResult,
  TeacherSubmissionSummary,
  TeacherScopeFeed,
  TeacherScopeAssignmentPack,
  TeacherScopeImportantTopics,
  TeacherScopeQuizLink,
  TeacherScopeAnnouncement,
  TeacherQuestionBankItem,
  TeacherSubmissionGrading,
  TeacherSubmissionStatus,
  TeacherPackStatus,
  TeacherWeeklyPlan,
  StudentProfile,
  StudentSession,
  SheetsIntegrationSettings,
  SheetsSyncStatus,
} from '@/lib/teacher-types';
import {
  isSupabaseServiceConfigured,
  supabaseInsert,
  supabaseSelect,
  supabaseUpdate,
} from '@/lib/supabase-rest';
import { getTeacherStorageStatus } from '@/lib/persistence/teacher-storage';

type RowId = string;

interface TeacherProfileRow {
  id: RowId;
  school_id?: RowId | null;
  auth_user_id?: RowId | null;
  auth_email?: string | null;
  staff_code?: string | null;
  phone: string;
  name: string;
  pin_hash: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface TeacherScopeRow {
  id: RowId;
  school_id?: RowId | null;
  teacher_id: RowId;
  class_level: number;
  subject: string;
  section: string | null;
  is_active: boolean;
  created_at: string;
}

interface TeacherAnnouncementRow {
  id: RowId;
  teacher_id: RowId;
  scope_id: RowId | null;
  class_level: number;
  subject: string;
  section: string | null;
  chapter_id: string | null;
  title: string;
  body: string;
  is_active: boolean;
  created_at: string;
}

interface TeacherTopicPriorityRow {
  id: RowId;
  teacher_id: RowId;
  scope_id: RowId | null;
  class_level: number;
  subject: string;
  section: string | null;
  chapter_id: string;
  topics: string[] | null;
  is_active: boolean;
  updated_at: string;
}

interface TeacherQuizLinkRow {
  id: RowId;
  teacher_id: RowId;
  scope_id: RowId | null;
  class_level: number;
  subject: string;
  section: string | null;
  chapter_id: string;
  url: string;
  is_active: boolean;
  updated_at: string;
}

interface TeacherActivityRow {
  id: number;
  teacher_id: RowId | null;
  actor_type: 'teacher' | 'admin' | 'system';
  action: string;
  chapter_id: string | null;
  pack_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface TeacherAssignmentPackRow {
  id: RowId;
  teacher_id: RowId;
  scope_id: RowId | null;
  class_level: number;
  subject: string;
  section: string | null;
  chapter_id: string;
  status: TeacherPackStatus;
  payload: TeacherAssignmentPack;
  created_at: string;
  updated_at: string;
}

interface TeacherSubmissionRow {
  id: RowId;
  pack_id: RowId;
  student_id: RowId | null;
  student_name: string;
  submission_code: string;
  attempt_no: number;
  status: TeacherSubmissionStatus;
  answers: TeacherSubmissionAnswer[];
  result: TeacherSubmissionResult & {
    scoreEstimate: number;
    attemptDetail?: TeacherSubmissionAttemptDetail;
    integritySummary?: ExamIntegritySummary;
  };
  grading: TeacherSubmissionGrading | Record<string, unknown> | null;
  released_at: string | null;
  created_at: string;
}

interface StudentProfileRow {
  id: RowId;
  school_id?: RowId | null;
  auth_user_id?: RowId | null;
  auth_email?: string | null;
  batch?: string | null;
  roll_no?: string | null;
  name: string;
  roll_code: string;
  class_level: number;
  section: string | null;
  pin_hash: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface PlatformUserRoleRow {
  id: RowId;
  auth_user_id: RowId;
  role: 'student' | 'teacher' | 'admin' | 'developer';
  school_id: RowId | null;
  profile_id: RowId | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SchoolRow {
  id: RowId;
  school_code: string;
}

interface TeacherQuestionBankRow {
  id: RowId;
  teacher_id: RowId;
  scope_id: RowId | null;
  class_level: number;
  subject: string;
  section: string | null;
  chapter_id: string;
  kind: 'mcq' | 'short' | 'long';
  prompt: string;
  options: string[] | null;
  answer_index: number | null;
  rubric: string | null;
  max_marks: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ExamSessionRow {
  id: RowId;
  pack_id: RowId;
  student_name: string;
  submission_code: string;
  status: 'active' | 'submitted' | 'abandoned';
  violation_counts: Record<string, number>;
  total_violations: number;
  started_at: string;
  last_heartbeat_at: string | null;
  submitted_at: string | null;
}

interface ExamViolationRow {
  id: number;
  session_id: RowId;
  event_type: string;
  detail: string | null;
  occurred_at: string;
}

interface TeacherWeeklyPlanRow {
  id: RowId;
  teacher_id: RowId;
  scope_id: RowId | null;
  class_level: number;
  subject: string | null;
  section: string | null;
  status: 'active' | 'archived';
  payload: TeacherWeeklyPlan;
  created_at: string;
  updated_at: string;
}

const TABLES = {
  schools: 'schools',
  platformRoles: 'platform_user_roles',
  profiles: 'teacher_profiles',
  scopes: 'teacher_scopes',
  activity: 'teacher_activity',
  announcements: 'teacher_announcements',
  topicPriority: 'teacher_topic_priority',
  quizLinks: 'teacher_quiz_links',
  assignmentPacks: 'teacher_assignment_packs',
  submissions: 'teacher_submissions',
  weeklyPlans: 'teacher_weekly_plans',
  examSessions: 'exam_sessions',
  examViolations: 'exam_violations',
  students: 'student_profiles',
  questionBank: 'teacher_question_bank',
  appState: 'app_state',
};

function sanitizeText(value: string, max = 240): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '').trim();
}

function normalizeSubmissionCode(value: string): string {
  return sanitizeText(value, 80).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function normalizeRollCode(value: string): string {
  return sanitizeText(value, 80).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function normalizeRosterToken(value: string, max = 64): string {
  return sanitizeText(value, max).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function normalizeAuthLocalPart(value: string, max = 40): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
  return cleaned || randomUUID().slice(0, 12);
}

async function getSchoolCodeById(schoolId: string): Promise<string | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const cleanSchoolId = sanitizeText(schoolId, 80);
  if (!cleanSchoolId) return null;
  const rows = await supabaseSelect<SchoolRow>(TABLES.schools, {
    select: 'id,school_code',
    filters: [{ column: 'id', value: cleanSchoolId }],
    limit: 1,
  }).catch(() => []);
  const schoolCode = rows[0]?.school_code;
  if (typeof schoolCode !== 'string' || schoolCode.trim().length === 0) return null;
  return normalizeAuthLocalPart(schoolCode, 30);
}

function buildProvisionedAuthEmail(input: {
  role: 'teacher' | 'student' | 'admin';
  schoolToken: string;
  userToken: string;
  profileId: string;
}): string {
  const role = normalizeAuthLocalPart(input.role, 20);
  const school = normalizeAuthLocalPart(input.schoolToken, 30);
  const user = normalizeAuthLocalPart(input.userToken, 30);
  const profile = normalizeAuthLocalPart(input.profileId, 36);
  return `${role}.${school}.${user}.${profile}@vidyapath.local`;
}

async function ensurePlatformRole(input: {
  authUserId: string;
  role: PlatformUserRoleRow['role'];
  schoolId: string;
  profileId: string;
}): Promise<void> {
  const authUserId = sanitizeText(input.authUserId, 80);
  const schoolId = sanitizeText(input.schoolId, 80);
  const profileId = sanitizeText(input.profileId, 80);
  if (!authUserId || !schoolId || !profileId) return;
  const existing = await supabaseSelect<PlatformUserRoleRow>(TABLES.platformRoles, {
    select: '*',
    filters: [
      { column: 'auth_user_id', value: authUserId },
      { column: 'role', value: input.role },
      { column: 'school_id', value: schoolId },
      { column: 'profile_id', value: profileId },
    ],
    limit: 1,
  }).catch(() => []);
  if (existing[0]) return;
  await supabaseInsert<PlatformUserRoleRow>(TABLES.platformRoles, {
    id: randomUUID(),
    auth_user_id: authUserId,
    role: input.role,
    school_id: schoolId,
    profile_id: profileId,
    is_active: true,
  });
}

function normalizeTopicList(topics: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const topic of topics) {
    const text = sanitizeText(topic, 140);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
    if (cleaned.length >= 12) break;
  }
  return cleaned;
}

function toStudentProfile(row: StudentProfileRow): StudentProfile | null {
  if (row.class_level !== 10 && row.class_level !== 12) return null;
  return {
    id: row.id,
    schoolId: row.school_id ?? undefined,
    name: row.name,
    rollNo: row.roll_no ?? undefined,
    batch: row.batch ?? undefined,
    rollCode: row.roll_code,
    classLevel: row.class_level,
    section: row.section ?? undefined,
    status: row.status,
    hasPin: !!row.pin_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toQuestionBankItem(row: TeacherQuestionBankRow): TeacherQuestionBankItem | null {
  if (row.class_level !== 10 && row.class_level !== 12) return null;
  if (!isSupportedSubject(row.subject)) return null;
  return {
    id: row.id,
    teacherId: row.teacher_id,
    chapterId: row.chapter_id,
    classLevel: row.class_level,
    subject: row.subject,
    section: row.section ?? undefined,
    kind: row.kind,
    prompt: row.prompt,
    options: Array.isArray(row.options) ? row.options.map((item) => String(item).trim()).filter((item) => item.length > 0) : undefined,
    answerIndex: Number.isFinite(Number(row.answer_index)) ? Number(row.answer_index) : undefined,
    rubric: row.rubric ?? undefined,
    maxMarks: Number.isFinite(Number(row.max_marks)) ? Number(row.max_marks) : 1,
    imageUrl: row.image_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isSubjectAllowedForClass(classLevel: 10 | 12, subject: string): boolean {
  if (classLevel === 10) {
    return ['Physics', 'Chemistry', 'Biology', 'Math', 'English Core'].includes(subject);
  }
  return ['Physics', 'Chemistry', 'Biology', 'Math', 'Accountancy', 'Business Studies', 'Economics', 'English Core'].includes(subject);
}

function toScope(row: TeacherScopeRow): TeacherScope | null {
  if (row.class_level !== 10 && row.class_level !== 12) return null;
  if (!isSupportedSubject(row.subject)) return null;
  return {
    id: row.id,
    teacherId: row.teacher_id,
    classLevel: row.class_level,
    subject: row.subject,
    section: row.section ?? undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function toTeacherProfile(row: TeacherProfileRow, scopes: TeacherScope[]): TeacherProfile {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    staffCode: row.staff_code ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scopes,
  };
}

function scopeMatchesChapter(scope: TeacherScope, chapterId: string, section?: TeacherSectionCode): boolean {
  if (!scope.isActive) return false;
  const chapter = getChapterById(chapterId);
  if (!chapter) return false;
  if (chapter.classLevel !== scope.classLevel || chapter.subject !== scope.subject) return false;
  if (scope.section && section && scope.section !== section) return false;
  return true;
}

async function getTeacherScopes(teacherId: string): Promise<TeacherScope[]> {
  const rows = await supabaseSelect<TeacherScopeRow>(TABLES.scopes, {
    select: '*',
    filters: [{ column: 'teacher_id', value: teacherId }],
    limit: 300,
  }).catch(() => []);
  return rows.map(toScope).filter((scope): scope is TeacherScope => !!scope);
}

async function getTeacherProfileRow(teacherId: string): Promise<TeacherProfileRow | null> {
  const cleanId = sanitizeText(teacherId, 80);
  if (!cleanId) return null;
  const rows = await supabaseSelect<TeacherProfileRow>(TABLES.profiles, {
    select: '*',
    filters: [{ column: 'id', value: cleanId }],
    limit: 1,
  }).catch(() => []);
  return rows[0] ?? null;
}

export async function logTeacherActivity(input: {
  actorType: 'teacher' | 'admin' | 'system';
  action: string;
  teacherId?: string;
  chapterId?: string;
  packId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!isSupabaseServiceConfigured()) return;
  await supabaseInsert<TeacherActivityRow>(TABLES.activity, {
    teacher_id: input.teacherId ?? null,
    actor_type: input.actorType,
    action: sanitizeText(input.action, 90),
    chapter_id: input.chapterId ? sanitizeText(input.chapterId, 80) : null,
    pack_id: input.packId ? sanitizeText(input.packId, 80) : null,
    metadata: input.metadata ?? {},
  }).catch(() => undefined);
}

export async function listTeachers(schoolId?: string): Promise<TeacherProfile[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeText(schoolId, 80) });
  const rows = await supabaseSelect<TeacherProfileRow>(TABLES.profiles, {
    select: '*',
    filters,
    orderBy: 'updated_at',
    ascending: false,
    limit: 500,
  });
  const scopes = await supabaseSelect<TeacherScopeRow>(TABLES.scopes, {
    select: '*',
    filters: schoolId ? [{ column: 'school_id', value: sanitizeText(schoolId, 80) }] : undefined,
    limit: 2000,
  }).catch(() => []);
  const scopeMap = new Map<string, TeacherScope[]>();
  for (const row of scopes) {
    const scope = toScope(row);
    if (!scope) continue;
    const bucket = scopeMap.get(scope.teacherId) ?? [];
    bucket.push(scope);
    scopeMap.set(scope.teacherId, bucket);
  }
  return rows.map((row) => toTeacherProfile(row, scopeMap.get(row.id) ?? []));
}

export async function getTeacherById(teacherId: string, schoolId?: string): Promise<TeacherProfile | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const row = await getTeacherProfileRow(teacherId);
  if (!row) return null;
  if (schoolId && row.school_id && row.school_id !== sanitizeText(schoolId, 80)) return null;
  const scopes = await getTeacherScopes(row.id);
  return toTeacherProfile(row, scopes);
}

export async function getTeacherSessionById(teacherId: string, schoolId?: string): Promise<TeacherSession | null> {
  const teacher = await getTeacherById(teacherId, schoolId);
  if (!teacher || teacher.status !== 'active') return null;
  return {
    teacher,
    effectiveScopes: teacher.scopes.filter((scope) => scope.isActive),
  };
}

export async function authenticateTeacher(phone: string, pin: string, schoolId?: string): Promise<TeacherSession | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const cleanPhone = normalizePhone(phone);
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'phone', value: cleanPhone },
  ];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeText(schoolId, 80) });
  const rows = await supabaseSelect<TeacherProfileRow>(TABLES.profiles, {
    select: '*',
    filters,
    limit: 1,
  }).catch((err: unknown) => {
    console.error('[auth:teacher] Supabase query failed in authenticateTeacher:', err instanceof Error ? err.message : String(err));
    return [] as TeacherProfileRow[];
  });
  const row = rows[0];
  if (!row) {
    console.warn('[auth:teacher] No teacher found for phone:', cleanPhone);
    return null;
  }
  if (row.status !== 'active') {
    console.warn('[auth:teacher] Teacher is not active. Status:', row.status, 'id:', row.id);
    return null;
  }
  if (!verifyPin(pin, row.pin_hash)) {
    console.warn('[auth:teacher] PIN mismatch for teacher id:', row.id, '— stored hash prefix:', row.pin_hash?.slice(0, 12));
    return null;
  }
  return getTeacherSessionById(row.id, schoolId);
}

export async function authenticateTeacherByIdentifier(
  identifier: string,
  pin: string,
  schoolId?: string
): Promise<{ session: TeacherSession | null; ambiguous?: boolean }> {
  if (!isSupabaseServiceConfigured()) return { session: null };
  const cleanIdentifier = sanitizeText(identifier, 80);
  if (!cleanIdentifier || !pin) return { session: null };
  const normalizedPhone = normalizePhone(cleanIdentifier);
  // Also try matching after stripping a leading country code (e.g. +91 or 0091 prefix)
  const strippedPhone = normalizedPhone.replace(/^\+91|^0091/, '');
  const normalizedStaff = normalizeRosterToken(cleanIdentifier, 50);
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'status', value: 'active' },
  ];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeText(schoolId, 80) });
  const rows = await supabaseSelect<TeacherProfileRow>(TABLES.profiles, {
    select: '*',
    filters,
    limit: 5000,
  }).catch((err: unknown) => {
    console.error('[auth:teacher] Supabase query failed in authenticateTeacherByIdentifier:', err instanceof Error ? err.message : String(err));
    return [] as TeacherProfileRow[];
  });
  if (rows.length === 0) {
    console.warn('[auth:teacher] authenticateTeacherByIdentifier: Supabase returned 0 active teachers — possible connectivity or permissions issue.');
  }
  const candidates = rows.filter((row) => {
    const storedPhone = normalizePhone(row.phone || '');
    // Accept match with or without country code on either side
    const phoneMatch =
      storedPhone === normalizedPhone ||
      storedPhone === strippedPhone ||
      storedPhone.replace(/^\+91|^0091/, '') === normalizedPhone ||
      storedPhone.replace(/^\+91|^0091/, '') === strippedPhone;
    const staffMatch = normalizeRosterToken(row.staff_code || '', 50) === normalizedStaff;
    return phoneMatch || (!!normalizedStaff && staffMatch);
  });
  if (candidates.length === 0) {
    console.warn('[auth:teacher] No candidate found for identifier:', cleanIdentifier, '— checked', rows.length, 'active teachers');
    return { session: null };
  }
  const pinMatched = candidates.filter((row) => {
    try {
      return verifyPin(pin, row.pin_hash);
    } catch (err: unknown) {
      console.error('[auth:teacher] verifyPin threw for teacher id:', row.id, '— stored hash prefix:', row.pin_hash?.slice(0, 16), 'error:', err instanceof Error ? err.message : String(err));
      return false;
    }
  });
  if (pinMatched.length === 0) {
    console.warn('[auth:teacher] PIN mismatch for', candidates.length, 'candidate(s). Stored hash prefix(es):', candidates.map((r) => r.pin_hash?.slice(0, 12)).join(', '));
    return { session: null };
  }
  if (pinMatched.length > 1) return { session: null, ambiguous: true };
  const matched = pinMatched[0];
  return {
    session: await getTeacherSessionById(matched.id, matched.school_id ?? schoolId),
  };
}

export async function listStudents(filters?: {
  schoolId?: string;
  classLevel?: 10 | 12;
  section?: string;
  status?: 'active' | 'inactive';
}): Promise<StudentProfile[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const where: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [];
  if (filters?.schoolId) where.push({ column: 'school_id', value: sanitizeText(filters.schoolId, 80) });
  if (filters?.classLevel) where.push({ column: 'class_level', value: filters.classLevel });
  if (typeof filters?.section === 'string' && filters.section.trim().length > 0) where.push({ column: 'section', value: sanitizeText(filters.section, 40) });
  if (filters?.status) where.push({ column: 'status', value: filters.status });
  const rows = await supabaseSelect<StudentProfileRow>(TABLES.students, {
    select: '*',
    filters: where,
    orderBy: 'updated_at',
    ascending: false,
    limit: 5000,
  }).catch(() => []);
  const students: StudentProfile[] = [];
  for (const row of rows) {
    const parsed = toStudentProfile(row);
    if (!parsed) continue;
    students.push(parsed);
  }
  return students;
}

export async function getStudentById(studentId: string, schoolId?: string): Promise<StudentProfile | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'id', value: sanitizeText(studentId, 80) },
  ];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeText(schoolId, 80) });
  const rows = await supabaseSelect<StudentProfileRow>(TABLES.students, {
    select: '*',
    filters,
    limit: 1,
  }).catch(() => []);
  return rows.map(toStudentProfile).find((item): item is StudentProfile => !!item) ?? null;
}

export async function getStudentByRollCode(rollCode: string, schoolId?: string): Promise<StudentProfileRow | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const normalized = normalizeRollCode(rollCode);
  if (!normalized) return null;
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'roll_code', value: normalized },
  ];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeText(schoolId, 80) });
  const rows = await supabaseSelect<StudentProfileRow>(TABLES.students, {
    select: '*',
    filters,
    limit: 1,
  }).catch((err: unknown) => {
    console.error('[auth:student] Supabase query failed in getStudentByRollCode:', err instanceof Error ? err.message : String(err));
    return [] as StudentProfileRow[];
  });
  if (rows.length === 0) {
    console.warn('[auth:student] No student found for roll_code:', normalized, schoolId ? `(schoolId: ${schoolId})` : '(no school filter)');
  }
  return rows[0] ?? null;
}

export async function findStudentsByRollNo(input: {
  rollNo: string;
  schoolId?: string;
  classLevel?: 10 | 12;
  section?: string;
  batch?: string;
}): Promise<StudentProfileRow[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const rollNo = normalizeRosterToken(input.rollNo, 50);
  if (!rollNo) return [];
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'roll_no', value: rollNo },
    { column: 'status', value: 'active' },
  ];
  if (input.schoolId) filters.push({ column: 'school_id', value: sanitizeText(input.schoolId, 80) });
  if (input.classLevel === 10 || input.classLevel === 12) filters.push({ column: 'class_level', value: input.classLevel });
  if (typeof input.section === 'string' && input.section.trim().length > 0) filters.push({ column: 'section', value: sanitizeText(input.section, 40) });
  if (typeof input.batch === 'string' && input.batch.trim().length > 0) filters.push({ column: 'batch', value: sanitizeText(input.batch, 40) });
  const rows = await supabaseSelect<StudentProfileRow>(TABLES.students, {
    select: '*',
    filters,
    limit: 2000,
  }).catch((err: unknown) => {
    console.error('[auth:student] Supabase query failed in findStudentsByRollNo:', err instanceof Error ? err.message : String(err));
    return [] as StudentProfileRow[];
  });
  return rows.filter((row) => row.status === 'active');
}

export async function createStudent(input: {
  schoolId?: string;
  name: string;
  rollCode?: string;
  rollNo?: string;
  batch?: string;
  classLevel: 10 | 12;
  section?: string;
  pin?: string;
  password?: string;
}): Promise<StudentProfile> {
  if (!isSupabaseServiceConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const schoolId = input.schoolId ? sanitizeText(input.schoolId, 80) : '';
  const name = sanitizeText(input.name, 120);
  const rollNo = normalizeRosterToken(input.rollNo || input.rollCode || '', 50);
  const rollCode = normalizeRollCode(
    input.rollCode ||
      `${input.classLevel}${input.section ? `-${sanitizeText(input.section, 20)}` : ''}-${rollNo || randomUUID().slice(0, 8)}`
  );
  const batch = input.batch ? sanitizeText(input.batch, 40) : null;
  const section = input.section ? sanitizeText(input.section, 40) : null;
  if (!schoolId) throw new Error('schoolId is required to create student.');
  if (!name || !rollCode || !rollNo) throw new Error('Valid student name, rollCode, and rollNo are required.');
  const studentId = randomUUID();
  const schoolCodeToken = (await getSchoolCodeById(schoolId)) || normalizeAuthLocalPart(schoolId, 30);
  const authEmail = buildProvisionedAuthEmail({
    role: 'student',
    schoolToken: schoolCodeToken,
    userToken: rollNo,
    profileId: studentId,
  });
  const authUser = await createSupabaseAuthUser({
    email: authEmail,
    password: input.password?.trim() || input.pin?.trim() || rollNo,
    emailConfirm: true,
    userMetadata: {
      role: 'student',
      school_id: schoolId,
      profile_id: studentId,
      class_level: input.classLevel,
      section: section ?? undefined,
      roll_no: rollNo,
      roll_code: rollCode,
      batch: batch ?? undefined,
      name,
    },
  });
  const pinHash = input.pin ? hashPin(input.pin) : null;
  const [row] = await supabaseInsert<StudentProfileRow>(TABLES.students, {
    id: studentId,
    school_id: schoolId,
    auth_user_id: authUser.id,
    auth_email: authUser.email ?? authEmail,
    batch,
    roll_no: rollNo,
    name,
    roll_code: rollCode,
    class_level: input.classLevel,
    section,
    pin_hash: pinHash,
    status: 'active',
  });
  if (!row) throw new Error('Failed to create student.');
  await ensurePlatformRole({
    authUserId: authUser.id,
    role: 'student',
    schoolId,
    profileId: row.id,
  });
  await logTeacherActivity({
    actorType: 'admin',
    action: 'create-student',
    metadata: { rollCode, rollNo, classLevel: input.classLevel, section: section ?? undefined, batch: batch ?? undefined },
  });
  const student = toStudentProfile(row);
  if (!student) throw new Error('Student created but unavailable.');
  return student;
}

export async function updateStudent(
  studentId: string,
  updates: Partial<{
    name: string;
    rollCode: string;
    rollNo: string;
    batch: string;
    classLevel: 10 | 12;
    section?: string;
    status: 'active' | 'inactive';
    pin?: string;
  }>,
  schoolId?: string
): Promise<StudentProfile | null> {
  if (!isSupabaseServiceConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const patch: Record<string, unknown> = {};
  if (typeof updates.name === 'string') {
    const name = sanitizeText(updates.name, 120);
    if (!name) throw new Error('Valid student name is required.');
    patch.name = name;
  }
  if (typeof updates.rollCode === 'string') {
    const rollCode = normalizeRollCode(updates.rollCode);
    if (!rollCode) throw new Error('Valid rollCode is required.');
    patch.roll_code = rollCode;
  }
  if (typeof updates.rollNo === 'string') {
    const rollNo = normalizeRosterToken(updates.rollNo, 50);
    if (!rollNo) throw new Error('Valid rollNo is required.');
    patch.roll_no = rollNo;
  }
  if (typeof updates.batch === 'string') {
    patch.batch = updates.batch.trim().length > 0 ? sanitizeText(updates.batch, 40) : null;
  }
  if (updates.classLevel === 10 || updates.classLevel === 12) {
    patch.class_level = updates.classLevel;
  }
  if (updates.section !== undefined) {
    patch.section = updates.section ? sanitizeText(updates.section, 40) : null;
  }
  if (updates.status === 'active' || updates.status === 'inactive') {
    patch.status = updates.status;
  }
  if (typeof updates.pin === 'string') {
    patch.pin_hash = updates.pin.trim().length > 0 ? hashPin(updates.pin) : null;
  }
  if (Object.keys(patch).length === 0) return getStudentById(studentId, schoolId);

  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'id', value: sanitizeText(studentId, 80) },
  ];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeText(schoolId, 80) });
  const rows = await supabaseUpdate<StudentProfileRow>(
    TABLES.students,
    patch,
    filters
  ).catch(() => []);
  const row = rows[0];
  if (!row) return null;
  await logTeacherActivity({
    actorType: 'admin',
    action: 'update-student',
    metadata: { studentId: row.id },
  });
  return toStudentProfile(row);
}

export async function authenticateStudent(rollCode: string, pin?: string, schoolId?: string): Promise<StudentSession | null> {
  const row = await getStudentByRollCode(rollCode, schoolId);
  if (!row) return null;
  if (row.status !== 'active') {
    console.warn('[auth:student] Student is not active. Status:', row.status, 'id:', row.id);
    return null;
  }
  if (row.pin_hash) {
    if (!pin) {
      console.warn('[auth:student] pin_hash is set but no PIN provided for student id:', row.id);
      return null;
    }
    try {
      if (!verifyPin(pin, row.pin_hash)) {
        console.warn('[auth:student] PIN mismatch for student id:', row.id, '— stored hash prefix:', row.pin_hash.slice(0, 12));
        return null;
      }
    } catch (err: unknown) {
      console.error('[auth:student] verifyPin threw for student id:', row.id, '— stored hash prefix:', row.pin_hash?.slice(0, 16), '— error:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }
  if (row.class_level !== 10 && row.class_level !== 12) return null;
  return {
    studentId: row.id,
    studentName: row.name,
    rollCode: row.roll_code,
    classLevel: row.class_level,
    section: row.section ?? undefined,
  };
}

export async function authenticateStudentByRollNo(input: {
  rollNo: string;
  pin?: string;
  schoolId?: string;
  classLevel?: 10 | 12;
  section?: string;
  batch?: string;
}): Promise<{ session: StudentSession | null; ambiguous?: boolean }> {
  const rows = await findStudentsByRollNo({
    rollNo: input.rollNo,
    schoolId: input.schoolId,
    classLevel: input.classLevel,
    section: input.section,
    batch: input.batch,
  });
  if (rows.length === 0) return { session: null };
  const pin = typeof input.pin === 'string' ? input.pin.trim() : '';
  const matched = rows.filter((row) => {
    if (!row.pin_hash) return true;
    return !!pin && verifyPin(pin, row.pin_hash);
  });
  if (matched.length === 0) return { session: null };
  if (matched.length > 1) return { session: null, ambiguous: true };
  const row = matched[0];
  if (row.class_level !== 10 && row.class_level !== 12) return { session: null };
  return {
    session: {
      studentId: row.id,
      studentName: row.name,
      rollCode: row.roll_code,
      classLevel: row.class_level,
      section: row.section ?? undefined,
    },
  };
}

export async function createTeacher(input: {
  schoolId?: string;
  phone: string;
  name: string;
  pin: string;
  staffCode?: string;
  password?: string;
  scopes?: Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }>;
}): Promise<TeacherProfile> {
  if (!isSupabaseServiceConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const schoolId = input.schoolId ? sanitizeText(input.schoolId, 80) : '';
  const phone = normalizePhone(input.phone);
  const name = sanitizeText(input.name, 120);
  const staffCode = input.staffCode ? normalizeRosterToken(input.staffCode, 50) : null;
  if (!schoolId) throw new Error('schoolId is required to create teacher.');
  if (!phone || !name) throw new Error('Valid phone and name are required.');
  const teacherId = randomUUID();
  const schoolCodeToken = (await getSchoolCodeById(schoolId)) || normalizeAuthLocalPart(schoolId, 30);
  const authEmail = buildProvisionedAuthEmail({
    role: 'teacher',
    schoolToken: schoolCodeToken,
    userToken: staffCode || phone,
    profileId: teacherId,
  });
  const authUser = await createSupabaseAuthUser({
    email: authEmail,
    password: input.password?.trim() || input.pin,
    emailConfirm: true,
    userMetadata: {
      role: 'teacher',
      school_id: schoolId,
      profile_id: teacherId,
      phone,
      staff_code: staffCode ?? undefined,
      name,
    },
  });
  const [row] = await supabaseInsert<TeacherProfileRow>(TABLES.profiles, {
    id: teacherId,
    school_id: schoolId,
    auth_user_id: authUser.id,
    auth_email: authUser.email ?? authEmail,
    phone,
    staff_code: staffCode,
    name,
    pin_hash: hashPin(input.pin),
    status: 'active',
  });
  if (!row) throw new Error('Failed to create teacher.');
  await ensurePlatformRole({
    authUserId: authUser.id,
    role: 'teacher',
    schoolId,
    profileId: row.id,
  });
  for (const scope of input.scopes ?? []) {
    if (!isSubjectAllowedForClass(scope.classLevel, scope.subject)) {
      throw new Error(`Subject ${scope.subject} is not allowed for Class ${scope.classLevel}.`);
    }
    await addTeacherScope(row.id, scope);
  }
  await logTeacherActivity({
    actorType: 'admin',
    action: 'create-teacher',
    teacherId: row.id,
    metadata: { phone, name },
  });
  const teacher = await getTeacherById(row.id);
  if (!teacher) throw new Error('Teacher created but unavailable.');
  return teacher;
}

export async function updateTeacher(
  teacherId: string,
  updates: Partial<{ phone: string; name: string; status: 'active' | 'inactive' }>,
  schoolId?: string
): Promise<TeacherProfile | null> {
  if (!isSupabaseServiceConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const patch: Record<string, unknown> = {};
  if (typeof updates.phone === 'string') {
    const normalizedPhone = normalizePhone(updates.phone);
    if (!normalizedPhone) throw new Error('Valid phone is required.');
    patch.phone = normalizedPhone;
  }
  if (typeof updates.name === 'string') {
    const normalizedName = sanitizeText(updates.name, 120);
    if (!normalizedName) throw new Error('Valid name is required.');
    patch.name = normalizedName;
  }
  if (updates.status === 'active' || updates.status === 'inactive') patch.status = updates.status;
  if (Object.keys(patch).length === 0) return getTeacherById(teacherId, schoolId);
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'id', value: teacherId },
  ];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeText(schoolId, 80) });
  await supabaseUpdate<TeacherProfileRow>(TABLES.profiles, patch, filters);
  await logTeacherActivity({
    actorType: 'admin',
    action: 'update-teacher',
    teacherId,
    metadata: patch,
  });
  return getTeacherById(teacherId, schoolId);
}

export async function addTeacherScope(
  teacherId: string,
  scope: { classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }
): Promise<TeacherScope | null> {
  if (!isSupabaseServiceConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  if (!isSupportedSubject(scope.subject)) {
    throw new Error('Unsupported subject for scope.');
  }
  if (!isSubjectAllowedForClass(scope.classLevel, scope.subject)) {
    throw new Error(`Subject ${scope.subject} is not allowed for Class ${scope.classLevel}.`);
  }
  const teacherRow = await getTeacherProfileRow(teacherId);
  if (!teacherRow) {
    throw new Error('Teacher not found.');
  }
  const section = scope.section ? sanitizeText(scope.section, 40) : null;
  const schoolId = teacherRow.school_id ? sanitizeText(String(teacherRow.school_id), 80) : null;
  const existingFilters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'teacher_id', value: teacherId },
    { column: 'class_level', value: scope.classLevel },
    { column: 'subject', value: scope.subject },
    section ? { column: 'section', value: section } : { column: 'section', op: 'is', value: null },
    { column: 'is_active', value: true },
  ];
  if (schoolId) existingFilters.push({ column: 'school_id', value: schoolId });
  const existing = await supabaseSelect<TeacherScopeRow>(TABLES.scopes, {
    select: '*',
    filters: existingFilters,
    limit: 1,
  }).catch(() => []);
  if (existing[0]) return toScope(existing[0]);

  const [row] = await supabaseInsert<TeacherScopeRow>(TABLES.scopes, {
    id: randomUUID(),
    school_id: schoolId,
    teacher_id: teacherId,
    class_level: scope.classLevel,
    subject: scope.subject,
    section,
    is_active: true,
  });
  if (!row) return null;
  await logTeacherActivity({
    actorType: 'admin',
    action: 'add-scope',
    teacherId,
    metadata: { classLevel: scope.classLevel, subject: scope.subject, section: section ?? null },
  });
  return toScope(row);
}

export async function deleteTeacherScope(teacherId: string, scopeId: string): Promise<boolean> {
  if (!isSupabaseServiceConfigured()) return false;
  const rows = await supabaseUpdate<TeacherScopeRow>(
    TABLES.scopes,
    { is_active: false },
    [{ column: 'teacher_id', value: teacherId }, { column: 'id', value: scopeId }]
  );
  const ok = rows.length > 0;
  if (ok) {
    await logTeacherActivity({
      actorType: 'admin',
      action: 'remove-scope',
      teacherId,
      metadata: { scopeId },
    });
  }
  return ok;
}

export async function resetTeacherPin(teacherId: string, pin: string): Promise<boolean> {
  if (!isSupabaseServiceConfigured()) return false;
  const rows = await supabaseUpdate<TeacherProfileRow>(
    TABLES.profiles,
    { pin_hash: hashPin(pin) },
    [{ column: 'id', value: teacherId }]
  );
  const ok = rows.length > 0;
  if (ok) {
    await logTeacherActivity({
      actorType: 'admin',
      action: 'reset-pin',
      teacherId,
    });
  }
  return ok;
}

export async function resolveTeacherScopeForChapter(
  teacherId: string,
  chapterId: string,
  section?: TeacherSectionCode
): Promise<TeacherScope | null> {
  const session = await getTeacherSessionById(teacherId);
  if (!session) return null;
  const chapter = getChapterById(chapterId);
  if (!chapter) return null;
  const matches = session.effectiveScopes.filter(
    (scope) =>
      scope.isActive &&
      scope.classLevel === chapter.classLevel &&
      scope.subject === chapter.subject
  );
  if (matches.length === 0) return null;
  if (section) {
    return matches.find((scope) => !scope.section || scope.section === section) ?? null;
  }
  const allSectionScope = matches.find((scope) => !scope.section);
  if (allSectionScope) return allSectionScope;
  if (matches.length === 1) return matches[0];
  return null;
}

function toAnnouncement(row: TeacherAnnouncementRow): TeacherAnnouncement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  };
}

function toAssignmentPack(row: TeacherAssignmentPackRow): TeacherAssignmentPack | null {
  if (!row.payload || typeof row.payload !== 'object') return null;
  const status: TeacherPackStatus =
    row.status === 'draft' || row.status === 'review' || row.status === 'published' || row.status === 'archived'
      ? row.status
      : 'draft';
  return {
    ...row.payload,
    packId: row.id,
    section: row.section ?? (row.payload.section ?? undefined),
    longAnswers: Array.isArray(row.payload.longAnswers) ? row.payload.longAnswers : [],
    questionMeta: row.payload.questionMeta ?? {},
    feedbackHistory: Array.isArray(row.payload.feedbackHistory) ? row.payload.feedbackHistory : [],
    status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toWeeklyPlan(row: TeacherWeeklyPlanRow): TeacherWeeklyPlan | null {
  if (!row.payload || typeof row.payload !== 'object') return null;
  return {
    ...row.payload,
    planId: row.id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizePublicAnnouncements(rows: TeacherAnnouncementRow[]): TeacherAnnouncement[] {
  const deduped: TeacherAnnouncement[] = [];
  const seen = new Set<string>();
  for (const row of rows.sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!row.is_active) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    deduped.push(toAnnouncement(row));
    if (deduped.length >= 12) break;
  }
  return deduped;
}

function sectionVisible(rowSection: string | null | undefined, requestedSection?: string): boolean {
  if (!requestedSection) {
    // Public/anonymous reads should only see all-section rows.
    return !rowSection;
  }
  return !rowSection || rowSection === requestedSection;
}

function sectionPriority(rowSection: string | null | undefined, requestedSection?: string): number {
  if (requestedSection) {
    if (rowSection === requestedSection) return 3;
    if (!rowSection) return 2;
    return 1;
  }
  if (rowSection) return 2;
  return 1;
}

function sortByLatestThenSpecificity<T extends { section?: string | null; updatedAt: string }>(
  items: T[],
  requestedSection?: string
): T[] {
  return [...items].sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
    return sectionPriority(b.section, requestedSection) - sectionPriority(a.section, requestedSection);
  });
}

export async function getPublicTeacherConfig(input?: {
  chapterId?: string;
  classLevel?: 10 | 12;
  subject?: string;
  section?: string;
}): Promise<PublicTeacherConfig> {
  const storageStatus = await getTeacherStorageStatus();
  if (!isSupabaseServiceConfigured()) {
    return {
      updatedAt: new Date().toISOString(),
      importantTopics: {},
      quizLinks: {},
      announcements: [],
      weeklyPlans: [],
      scopeFeed: { quizLinks: [], importantTopics: [], announcements: [], assignmentPacks: [] },
      storageStatus,
    };
  }
  const chapterId = input?.chapterId ? sanitizeText(input.chapterId, 80) : '';
  const topicFilters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'is_active', value: true },
  ];
  const quizFilters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'is_active', value: true },
  ];
  const announcementFilters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'is_active', value: true },
  ];
  const assignmentFilters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'status', value: 'published' },
  ];
  if (chapterId) {
    topicFilters.push({ column: 'chapter_id', value: chapterId });
    quizFilters.push({ column: 'chapter_id', value: chapterId });
    assignmentFilters.push({ column: 'chapter_id', value: chapterId });
  }
  if (input?.classLevel) {
    topicFilters.push({ column: 'class_level', value: input.classLevel });
    quizFilters.push({ column: 'class_level', value: input.classLevel });
    announcementFilters.push({ column: 'class_level', value: input.classLevel });
    assignmentFilters.push({ column: 'class_level', value: input.classLevel });
  }
  if (input?.subject) {
    topicFilters.push({ column: 'subject', value: input.subject });
    quizFilters.push({ column: 'subject', value: input.subject });
    announcementFilters.push({ column: 'subject', value: input.subject });
    assignmentFilters.push({ column: 'subject', value: input.subject });
  }
  const requestedSection = input?.section ? sanitizeText(input.section, 40) : undefined;

  const [topicRows, quizRows, announcementRows, assignmentRows] = await Promise.all([
    supabaseSelect<TeacherTopicPriorityRow>(TABLES.topicPriority, {
      select: '*',
      filters: topicFilters,
      orderBy: 'updated_at',
      ascending: false,
      limit: 200,
    }).catch(() => []),
    supabaseSelect<TeacherQuizLinkRow>(TABLES.quizLinks, {
      select: '*',
      filters: quizFilters,
      orderBy: 'updated_at',
      ascending: false,
      limit: 200,
    }).catch(() => []),
    supabaseSelect<TeacherAnnouncementRow>(TABLES.announcements, {
      select: '*',
      filters: announcementFilters,
      orderBy: 'created_at',
      ascending: false,
      limit: 80,
    }).catch(() => []),
    supabaseSelect<TeacherAssignmentPackRow>(TABLES.assignmentPacks, {
      select: '*',
      filters: assignmentFilters,
      orderBy: 'updated_at',
      ascending: false,
      limit: 120,
    }).catch(() => []),
  ]);

  const scopedTopicRows = topicRows.filter((row) => sectionVisible(row.section, requestedSection));
  const scopedQuizRows = quizRows.filter((row) => sectionVisible(row.section, requestedSection));
  const scopedAnnouncementRows = announcementRows.filter((row) => sectionVisible(row.section, requestedSection));
  const scopedPackRows = assignmentRows.filter((row) => sectionVisible(row.section, requestedSection));

  const sortedTopicRows = sortByLatestThenSpecificity(
    scopedTopicRows.map((row) => ({
      ...row,
      updatedAt: row.updated_at,
    })),
    requestedSection
  );
  const sortedQuizRows = sortByLatestThenSpecificity(
    scopedQuizRows.map((row) => ({
      ...row,
      updatedAt: row.updated_at,
    })),
    requestedSection
  );

  const importantTopics: Record<string, string[]> = {};
  const quizLinks: Record<string, string> = {};
  for (const row of sortedTopicRows) {
    if (importantTopics[row.chapter_id]) continue;
    importantTopics[row.chapter_id] = normalizeTopicList(row.topics ?? []);
  }
  for (const row of sortedQuizRows) {
    if (quizLinks[row.chapter_id]) continue;
    quizLinks[row.chapter_id] = row.url;
  }

  const scopeFeed: TeacherScopeFeed = {
    quizLinks: sortByLatestThenSpecificity(
      scopedQuizRows
      .map((row) => ({
        chapterId: row.chapter_id,
        url: row.url,
        classLevel: row.class_level === 10 ? 10 : 12,
        subject: row.subject as TeacherScopeQuizLink['subject'],
        section: row.section ?? undefined,
        updatedAt: row.updated_at,
      })),
      requestedSection
    ),
    importantTopics: sortByLatestThenSpecificity(
      scopedTopicRows
      .map((row) => ({
        chapterId: row.chapter_id,
        topics: normalizeTopicList(row.topics ?? []),
        classLevel: row.class_level === 10 ? 10 : 12,
        subject: row.subject as TeacherScopeImportantTopics['subject'],
        section: row.section ?? undefined,
        updatedAt: row.updated_at,
      })),
      requestedSection
    ),
    announcements: sortByLatestThenSpecificity(
      scopedAnnouncementRows
      .map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        createdAt: row.created_at,
        chapterId: row.chapter_id ?? undefined,
        classLevel: row.class_level === 10 ? 10 : 12,
        subject: row.subject as TeacherScopeAnnouncement['subject'],
        section: row.section ?? undefined,
        updatedAt: row.created_at,
      })),
      requestedSection
    ),
    assignmentPacks: [],
  };

  if (scopedPackRows.length > 0) {
    const teacherRows = await supabaseSelect<TeacherProfileRow>(TABLES.profiles, {
      select: '*',
      limit: 1000,
    }).catch(() => []);
    const teacherNameById = new Map<string, string>();
    for (const row of teacherRows) {
      const id = sanitizeText(row.id, 80);
      if (!id) continue;
      teacherNameById.set(id, sanitizeText(row.name, 120) || 'Teacher');
    }

    const assignmentFeedItems: TeacherScopeAssignmentPack[] = [];
    for (const row of scopedPackRows) {
      const pack = toAssignmentPack(row);
      if (!pack || pack.status !== 'published') continue;
      assignmentFeedItems.push({
        chapterId: row.chapter_id,
        packId: pack.packId,
        title: pack.title,
        portion: pack.portion,
        dueDate: pack.dueDate,
        questionCount: pack.questionCount,
        estimatedTimeMinutes: pack.estimatedTimeMinutes,
        classLevel: row.class_level === 10 ? 10 : 12,
        subject: row.subject as TeacherScopeAssignmentPack['subject'],
        section: row.section ?? undefined,
        updatedAt: row.updated_at,
        teacherName: teacherNameById.get(row.teacher_id),
        status: pack.status,
        shareUrl: pack.shareUrl,
      });
    }

    scopeFeed.assignmentPacks = sortByLatestThenSpecificity(assignmentFeedItems, requestedSection).slice(0, 20);
  }

  return {
    updatedAt: new Date().toISOString(),
    importantTopics,
    quizLinks,
    announcements: normalizePublicAnnouncements(scopedAnnouncementRows),
    weeklyPlans: [],
    scopeFeed,
    storageStatus,
  };
}

function parseSubmissionGrading(
  grading: TeacherSubmissionRow['grading']
): TeacherSubmissionGrading | undefined {
  if (!grading || typeof grading !== 'object') return undefined;
  const record = grading as Record<string, unknown>;
  const gradedByTeacherId = typeof record.gradedByTeacherId === 'string' ? record.gradedByTeacherId.trim() : '';
  const gradedAt = typeof record.gradedAt === 'string' ? record.gradedAt.trim() : '';
  const totalScore = Number(record.totalScore);
  const maxScore = Number(record.maxScore);
  const percentage = Number(record.percentage);
  const questionGrades: TeacherSubmissionGrading['questionGrades'] = [];
  if (Array.isArray(record.questionGrades)) {
    for (const item of record.questionGrades) {
      if (!item || typeof item !== 'object') continue;
      const q = item as Record<string, unknown>;
      const questionNo = typeof q.questionNo === 'string' ? q.questionNo.trim() : '';
      const scoreAwarded = Number(q.scoreAwarded);
      const maxScoreItem = Number(q.maxScore);
      const feedback = typeof q.feedback === 'string' ? q.feedback.trim() : undefined;
      if (!questionNo || !Number.isFinite(scoreAwarded) || !Number.isFinite(maxScoreItem)) continue;
      questionGrades.push({ questionNo, scoreAwarded, maxScore: maxScoreItem, feedback });
    }
  }

  if (!gradedByTeacherId || !gradedAt || !Number.isFinite(totalScore) || !Number.isFinite(maxScore) || !Number.isFinite(percentage)) {
    return undefined;
  }
  return {
    gradedByTeacherId,
    gradedAt,
    totalScore,
    maxScore,
    percentage,
    questionGrades,
  };
}

function getSubmissionDisplayedScore(row: TeacherSubmissionRow): number {
  const grading = parseSubmissionGrading(row.grading);
  if (grading) return Math.max(0, Math.min(100, Number(grading.percentage) || 0));
  return Math.max(0, Math.min(100, Number(row.result?.scoreEstimate || 0)));
}

function summarizeSubmissions(rows: TeacherSubmissionRow[]): TeacherSubmissionSummary {
  if (rows.length === 0) {
    return {
      attempts: 0,
      averageScore: 0,
      topMistakes: [],
      weakTopics: [],
      recommendedNextChapterIds: [],
      attemptsByStudent: [],
      questionStats: [],
      scoreTrend: [],
      pendingReviewCount: 0,
      gradedCount: 0,
      releasedCount: 0,
    };
  }
  const avg = Math.round(rows.reduce((sum, row) => sum + getSubmissionDisplayedScore(row), 0) / rows.length);
  const mistakes = new Map<string, number>();
  const weak = new Map<string, number>();
  const questionStatsMap = new Map<string, TeacherQuestionStat>();
  const attemptsByStudent: TeacherSubmissionAttemptRow[] = [];
  const scoreTrend: TeacherSubmissionTrendPoint[] = [];
  let pendingReviewCount = 0;
  let gradedCount = 0;
  let releasedCount = 0;
  for (const row of rows) {
    const status: TeacherSubmissionStatus =
      row.status === 'graded' || row.status === 'released' || row.status === 'pending_review'
        ? row.status
        : 'pending_review';
    if (status === 'pending_review') pendingReviewCount += 1;
    if (status === 'graded') gradedCount += 1;
    if (status === 'released') releasedCount += 1;
    const grading = parseSubmissionGrading(row.grading);
    const scoreEstimate = getSubmissionDisplayedScore(row);
    for (const item of row.result?.mistakes ?? []) {
      const key = sanitizeText(item, 200).toLowerCase();
      if (!key) continue;
      mistakes.set(key, (mistakes.get(key) ?? 0) + 1);
    }
    for (const item of row.result?.weakTopics ?? []) {
      const key = sanitizeText(item, 140).toLowerCase();
      if (!key) continue;
      weak.set(key, (weak.get(key) ?? 0) + 1);
    }
    const attemptDetail = row.result?.attemptDetail;
    const wrongQuestionNos = (attemptDetail?.questionResults ?? [])
      .filter((result) => result.verdict === 'wrong')
      .map((result) => sanitizeText(result.questionNo, 30).toUpperCase())
      .filter(Boolean)
      .slice(0, 12);
    const partialQuestionNos = (attemptDetail?.questionResults ?? [])
      .filter((result) => result.verdict === 'partial')
      .map((result) => sanitizeText(result.questionNo, 30).toUpperCase())
      .filter(Boolean)
      .slice(0, 12);
    const unansweredQuestionNos = (attemptDetail?.questionResults ?? [])
      .filter((result) => result.verdict === 'unanswered')
      .map((result) => sanitizeText(result.questionNo, 30).toUpperCase())
      .filter(Boolean)
      .slice(0, 12);
    attemptsByStudent.push({
      submissionId: row.id,
      studentName: sanitizeText(row.student_name || 'Student', 120) || 'Student',
      studentId: row.student_id ?? undefined,
      submissionCode: row.submission_code,
      scoreEstimate,
      attemptNo: Number.isFinite(Number(row.attempt_no)) ? Number(row.attempt_no) : 1,
      correctCount: attemptDetail?.correctCount ?? 0,
      wrongCount: attemptDetail?.wrongCount ?? 0,
      partialCount: attemptDetail?.partialCount ?? 0,
      unansweredCount: attemptDetail?.unansweredCount ?? 0,
      submittedAt: row.created_at,
      weakTopics: row.result?.weakTopics ?? [],
      mistakes: row.result?.mistakes ?? [],
      integritySummary: row.result?.integritySummary,
      wrongQuestionNos,
      partialQuestionNos,
      unansweredQuestionNos,
      status,
      grading,
      releasedAt: row.released_at ?? undefined,
    });
    scoreTrend.push({
      label: `${sanitizeText(row.student_name || 'Student', 40) || 'Student'} A${Number.isFinite(Number(row.attempt_no)) ? Number(row.attempt_no) : 1}`,
      score: scoreEstimate,
      submittedAt: row.created_at,
    });
    for (const result of attemptDetail?.questionResults ?? []) {
      const key = sanitizeText(result.questionNo, 40).toUpperCase();
      if (!key) continue;
      const current = questionStatsMap.get(key) ?? {
        questionNo: key,
        prompt: sanitizeText(result.prompt, 300),
        kind: result.kind,
        attempts: 0,
        correct: 0,
        partial: 0,
        wrong: 0,
        unanswered: 0,
        accuracyPercent: 0,
      };
      current.attempts += 1;
      if (result.verdict === 'correct') current.correct += 1;
      else if (result.verdict === 'partial') current.partial += 1;
      else if (result.verdict === 'wrong') current.wrong += 1;
      else current.unanswered += 1;
      const denom = Math.max(1, current.attempts);
      current.accuracyPercent = Math.round(((current.correct + current.partial * 0.5) / denom) * 100);
      questionStatsMap.set(key, current);
    }
  }
  const weakTopics = [...weak.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([topic, count]) => ({ topic, count }));
  const recommendedNextChapterIds = ALL_CHAPTERS.filter((chapter) =>
    weakTopics.some((topic) =>
      chapter.title.toLowerCase().includes(topic.topic) ||
      chapter.topics.some((entry) => entry.toLowerCase().includes(topic.topic))
    )
  ).slice(0, 8).map((chapter) => chapter.id);

  return {
    attempts: rows.length,
    averageScore: avg,
    topMistakes: [...mistakes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([item, count]) => ({ item, count })),
    weakTopics,
    recommendedNextChapterIds,
    attemptsByStudent: attemptsByStudent
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 80),
    questionStats: [...questionStatsMap.values()]
      .sort((a, b) => a.questionNo.localeCompare(b.questionNo))
      .slice(0, 120),
    scoreTrend: scoreTrend
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
      .slice(-40),
    pendingReviewCount,
    gradedCount,
    releasedCount,
  };
}

function computeAssignmentAnalytics(packs: TeacherAssignmentPack[], submissionsByPack: Map<string, TeacherSubmissionRow[]>): TeacherAssignmentAnalytics {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const weekStartMs = weekStart.getTime();
  const allSubmissions = [...submissionsByPack.values()].flat();
  const thisWeek = allSubmissions.filter((row) => new Date(row.created_at).getTime() >= weekStartMs);
  const completedPackIds = new Set(thisWeek.map((row) => row.pack_id));
  const weakMap = new Map<string, number>();
  for (const row of allSubmissions) {
    for (const topic of row.result?.weakTopics ?? []) {
      const key = sanitizeText(topic, 120).toLowerCase();
      if (!key) continue;
      weakMap.set(key, (weakMap.get(key) ?? 0) + 1);
    }
  }
  const weakList = [...weakMap.entries()].sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count }));
  return {
    updatedAt: new Date().toISOString(),
    totalPacks: packs.length,
    activePacks: packs.filter((pack) => pack.status === 'published').length,
    submissionsThisWeek: thisWeek.length,
    assignmentsCompletedThisWeek: completedPackIds.size,
    topWeakTopics: weakList.slice(0, 8),
    weakTopicHeatmap: weakList.slice(0, 20),
    packPerformance: packs.map((pack) => {
      const rows = submissionsByPack.get(pack.packId) ?? [];
      const averageScore = rows.length
        ? Math.round(rows.reduce((sum, row) => sum + Number(row.result?.scoreEstimate || 0), 0) / rows.length)
        : 0;
      const lastSubmissionAt = rows.map((row) => row.created_at).sort((a, b) => b.localeCompare(a))[0];
      return {
        packId: pack.packId,
        title: pack.title,
        attempts: rows.length,
        averageScore,
        lastSubmissionAt,
      };
    }).sort((a, b) => b.attempts - a.attempts).slice(0, 12),
  };
}

export interface PrivateTeacherConfig extends PublicTeacherConfig {
  analytics: Awaited<ReturnType<typeof getAnalyticsSummary>>;
  assignmentAnalytics: TeacherAssignmentAnalytics;
  assignmentPacks: TeacherAssignmentPack[];
  actionHistory: TeacherActionHistoryEntry[];
}

export async function getPrivateTeacherConfig(teacherId: string): Promise<PrivateTeacherConfig> {
  const teacherSession = await getTeacherSessionById(teacherId);
  if (!teacherSession) throw new Error('Unauthorized teacher session.');
  const storageStatus = await getTeacherStorageStatus();
  const [topicRows, quizRows, announcementRows, packRows, activityRows, submissionRows, analytics] =
    await Promise.all([
      supabaseSelect<TeacherTopicPriorityRow>(TABLES.topicPriority, { select: '*', filters: [{ column: 'teacher_id', value: teacherId }, { column: 'is_active', value: true }], orderBy: 'updated_at', ascending: false, limit: 500 }).catch(() => []),
      supabaseSelect<TeacherQuizLinkRow>(TABLES.quizLinks, { select: '*', filters: [{ column: 'teacher_id', value: teacherId }, { column: 'is_active', value: true }], orderBy: 'updated_at', ascending: false, limit: 500 }).catch(() => []),
      supabaseSelect<TeacherAnnouncementRow>(TABLES.announcements, { select: '*', filters: [{ column: 'teacher_id', value: teacherId }, { column: 'is_active', value: true }], orderBy: 'created_at', ascending: false, limit: 120 }).catch(() => []),
      supabaseSelect<TeacherAssignmentPackRow>(TABLES.assignmentPacks, { select: '*', filters: [{ column: 'teacher_id', value: teacherId }], orderBy: 'updated_at', ascending: false, limit: 300 }).catch(() => []),
      supabaseSelect<TeacherActivityRow>(TABLES.activity, { select: '*', filters: [{ column: 'teacher_id', value: teacherId }], orderBy: 'created_at', ascending: false, limit: 200 }).catch(() => []),
      supabaseSelect<TeacherSubmissionRow>(TABLES.submissions, { select: '*', orderBy: 'created_at', ascending: false, limit: 2000 }).catch(() => []),
      getAnalyticsSummary(12),
    ]);

  const sortedPrivateTopicRows = sortByLatestThenSpecificity(
    topicRows.map((row) => ({ ...row, updatedAt: row.updated_at }))
  );
  const sortedPrivateQuizRows = sortByLatestThenSpecificity(
    quizRows.map((row) => ({ ...row, updatedAt: row.updated_at }))
  );
  const importantTopics: Record<string, string[]> = {};
  for (const row of sortedPrivateTopicRows) {
    if (importantTopics[row.chapter_id]) continue;
    importantTopics[row.chapter_id] = normalizeTopicList(row.topics ?? []);
  }
  const quizLinks: Record<string, string> = {};
  for (const row of sortedPrivateQuizRows) {
    if (quizLinks[row.chapter_id]) continue;
    quizLinks[row.chapter_id] = row.url;
  }
  const privateScopeAssignmentPacks: TeacherScopeAssignmentPack[] = [];
  for (const row of packRows) {
    const pack = toAssignmentPack(row);
    if (!pack) continue;
    privateScopeAssignmentPacks.push({
      chapterId: row.chapter_id,
      packId: pack.packId,
      title: pack.title,
      portion: pack.portion,
      dueDate: pack.dueDate,
      questionCount: pack.questionCount,
      estimatedTimeMinutes: pack.estimatedTimeMinutes,
      classLevel: row.class_level === 10 ? 10 : 12,
      subject: row.subject as TeacherScopeAssignmentPack['subject'],
      section: row.section ?? undefined,
      updatedAt: row.updated_at,
      teacherName: teacherSession.teacher.name,
      status: pack.status,
      shareUrl: pack.shareUrl,
    });
  }
  const scopeFeed: TeacherScopeFeed = {
    quizLinks: sortByLatestThenSpecificity(
      quizRows.map((row) => ({
        chapterId: row.chapter_id,
        url: row.url,
        classLevel: row.class_level === 10 ? 10 : 12,
        subject: row.subject as TeacherScopeQuizLink['subject'],
        section: row.section ?? undefined,
        updatedAt: row.updated_at,
      }))
    ),
    importantTopics: sortByLatestThenSpecificity(
      topicRows.map((row) => ({
        chapterId: row.chapter_id,
        topics: normalizeTopicList(row.topics ?? []),
        classLevel: row.class_level === 10 ? 10 : 12,
        subject: row.subject as TeacherScopeImportantTopics['subject'],
        section: row.section ?? undefined,
        updatedAt: row.updated_at,
      }))
    ),
    announcements: sortByLatestThenSpecificity(
      announcementRows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        createdAt: row.created_at,
        chapterId: row.chapter_id ?? undefined,
        classLevel: row.class_level === 10 ? 10 : 12,
        subject: row.subject as TeacherScopeAnnouncement['subject'],
        section: row.section ?? undefined,
        updatedAt: row.created_at,
      }))
    ),
    assignmentPacks: sortByLatestThenSpecificity(privateScopeAssignmentPacks),
  };
  const assignmentPacks = packRows.map(toAssignmentPack).filter((pack): pack is TeacherAssignmentPack => !!pack);
  const packIds = new Set(assignmentPacks.map((pack) => pack.packId));
  const submissionsByPack = new Map<string, TeacherSubmissionRow[]>();
  for (const row of submissionRows) {
    if (!packIds.has(row.pack_id)) continue;
    const list = submissionsByPack.get(row.pack_id) ?? [];
    list.push(row);
    submissionsByPack.set(row.pack_id, list);
  }
  return {
    updatedAt: new Date().toISOString(),
    importantTopics,
    quizLinks,
    announcements: normalizePublicAnnouncements(announcementRows),
    weeklyPlans: [],
    scopeFeed,
    storageStatus,
    analytics,
    assignmentAnalytics: computeAssignmentAnalytics(assignmentPacks, submissionsByPack),
    assignmentPacks,
    actionHistory: activityRows.map((row) => ({
      id: String(row.id),
      action: row.action as TeacherActionHistoryEntry['action'],
      chapterId: row.chapter_id ?? undefined,
      packId: row.pack_id ?? undefined,
      keyId: row.teacher_id ?? teacherId,
      createdAt: row.created_at,
      metadata: row.metadata ?? undefined,
    })),
  };
}

export async function setImportantTopics(input: { teacherId: string; chapterId: string; topics: string[]; section?: TeacherSectionCode }): Promise<PublicTeacherConfig> {
  const chapterId = sanitizeText(input.chapterId, 80);
  const chapter = getChapterById(chapterId);
  if (!chapter) throw new Error('Valid chapterId is required.');
  const scope = await resolveTeacherScopeForChapter(input.teacherId, chapter.id, input.section);
  if (!scope) throw new Error('Teacher does not have scope for this chapter.');
  const topics = normalizeTopicList(input.topics);
  const existing = await supabaseSelect<TeacherTopicPriorityRow>(TABLES.topicPriority, {
    select: '*',
    filters: [
      { column: 'teacher_id', value: input.teacherId },
      { column: 'chapter_id', value: chapter.id },
      { column: 'scope_id', value: scope.id },
    ],
    limit: 1,
  }).catch(() => []);
  if (existing[0]) {
    await supabaseUpdate<TeacherTopicPriorityRow>(TABLES.topicPriority, { topics, is_active: topics.length > 0, scope_id: scope.id, section: scope.section ?? null }, [{ column: 'id', value: existing[0].id }]);
  } else {
    await supabaseInsert<TeacherTopicPriorityRow>(TABLES.topicPriority, {
      id: randomUUID(),
      teacher_id: input.teacherId,
      scope_id: scope.id,
      class_level: chapter.classLevel,
      subject: chapter.subject,
      section: scope.section ?? null,
      chapter_id: chapter.id,
      topics,
      is_active: topics.length > 0,
    });
  }
  await logTeacherActivity({ actorType: 'teacher', teacherId: input.teacherId, action: 'set-important-topics', chapterId: chapter.id, metadata: { topicCount: topics.length } });
  return getPublicTeacherConfig({ chapterId: chapter.id, classLevel: chapter.classLevel as 10 | 12, subject: chapter.subject, section: scope.section ?? undefined });
}

export async function setQuizLink(input: { teacherId: string; chapterId: string; url: string; section?: TeacherSectionCode }): Promise<PublicTeacherConfig> {
  const chapterId = sanitizeText(input.chapterId, 80);
  const chapter = getChapterById(chapterId);
  if (!chapter) throw new Error('Valid chapterId is required.');
  const scope = await resolveTeacherScopeForChapter(input.teacherId, chapter.id, input.section);
  if (!scope) throw new Error('Teacher does not have scope for this chapter.');
  const url = sanitizeText(input.url, 500);
  const existing = await supabaseSelect<TeacherQuizLinkRow>(TABLES.quizLinks, {
    select: '*',
    filters: [
      { column: 'teacher_id', value: input.teacherId },
      { column: 'chapter_id', value: chapter.id },
      { column: 'scope_id', value: scope.id },
    ],
    limit: 1,
  }).catch(() => []);
  if (existing[0]) {
    await supabaseUpdate<TeacherQuizLinkRow>(TABLES.quizLinks, { url, is_active: !!url, scope_id: scope.id, section: scope.section ?? null }, [{ column: 'id', value: existing[0].id }]);
  } else {
    await supabaseInsert<TeacherQuizLinkRow>(TABLES.quizLinks, {
      id: randomUUID(),
      teacher_id: input.teacherId,
      scope_id: scope.id,
      class_level: chapter.classLevel,
      subject: chapter.subject,
      section: scope.section ?? null,
      chapter_id: chapter.id,
      url,
      is_active: !!url,
    });
  }
  await logTeacherActivity({ actorType: 'teacher', teacherId: input.teacherId, action: 'set-quiz-link', chapterId: chapter.id, metadata: { hasLink: !!url } });
  return getPublicTeacherConfig({ chapterId: chapter.id, classLevel: chapter.classLevel as 10 | 12, subject: chapter.subject, section: scope.section ?? undefined });
}

export async function addAnnouncement(input: { teacherId: string; title: string; body: string; chapterId?: string; section?: string }): Promise<PublicTeacherConfig> {
  const title = sanitizeText(input.title, 140);
  const body = sanitizeText(input.body, 800);
  if (!title || !body) throw new Error('Announcement title and body are required.');

  const teacherSession = await getTeacherSessionById(input.teacherId);
  const fallbackScope = teacherSession?.effectiveScopes[0];
  if (!fallbackScope) throw new Error('Teacher has no active scope.');

  const chapter = input.chapterId ? getChapterById(input.chapterId) : undefined;
  const scope = chapter
    ? await resolveTeacherScopeForChapter(input.teacherId, chapter.id, input.section)
    : fallbackScope;
  if (!scope) throw new Error('Invalid scope for announcement.');

  await supabaseInsert<TeacherAnnouncementRow>(TABLES.announcements, {
    id: randomUUID(),
    teacher_id: input.teacherId,
    scope_id: scope.id,
    class_level: chapter?.classLevel ?? scope.classLevel,
    subject: chapter?.subject ?? scope.subject,
    section: scope.section ?? null,
    chapter_id: chapter?.id ?? null,
    title,
    body,
    is_active: true,
  });
  await logTeacherActivity({ actorType: 'teacher', teacherId: input.teacherId, action: 'add-announcement', chapterId: chapter?.id });
  return getPublicTeacherConfig({ chapterId: chapter?.id, classLevel: (chapter?.classLevel ?? scope.classLevel) as 10 | 12, subject: chapter?.subject ?? scope.subject, section: scope.section ?? undefined });
}

export async function removeAnnouncement(input: { teacherId: string; id: string }): Promise<PublicTeacherConfig> {
  const announcementId = sanitizeText(input.id, 80);
  const rows = await supabaseUpdate<TeacherAnnouncementRow>(
    TABLES.announcements,
    { is_active: false },
    [{ column: 'id', value: announcementId }, { column: 'teacher_id', value: input.teacherId }]
  );
  const row = rows[0];
  await logTeacherActivity({ actorType: 'teacher', teacherId: input.teacherId, action: 'remove-announcement', metadata: { announcementId } });
  return getPublicTeacherConfig({
    chapterId: row?.chapter_id ?? undefined,
    classLevel: (row?.class_level === 10 ? 10 : 12) as 10 | 12,
    subject: row?.subject ?? '',
    section: row?.section ?? undefined,
  });
}

export async function upsertAssignmentPack(
  teacherId: string,
  payload: Omit<TeacherAssignmentPack, 'createdAt' | 'updatedAt' | 'createdByKeyId' | 'status'> & { status?: TeacherPackStatus; section?: string }
): Promise<TeacherAssignmentPack> {
  const chapter = getChapterById(payload.chapterId);
  if (!chapter) throw new Error('Invalid chapterId for assignment pack.');
  const scope = await resolveTeacherScopeForChapter(teacherId, chapter.id, payload.section);
  if (!scope) throw new Error('Teacher does not have scope for this chapter.');
  const packId = sanitizeText(payload.packId, 80) || randomUUID();
  const now = new Date().toISOString();
  const nextStatus: TeacherPackStatus =
    payload.status === 'review' || payload.status === 'published' || payload.status === 'archived' || payload.status === 'draft'
      ? payload.status
      : 'draft';
  const packData: TeacherAssignmentPack = {
    ...payload,
    packId,
    classLevel: chapter.classLevel as 10 | 12,
    subject: chapter.subject,
    section: scope.section ?? undefined,
    longAnswers: Array.isArray(payload.longAnswers) ? payload.longAnswers : [],
    questionMeta: payload.questionMeta ?? {},
    feedbackHistory: Array.isArray(payload.feedbackHistory) ? payload.feedbackHistory : [],
    createdAt: now,
    updatedAt: now,
    createdByKeyId: teacherId,
    status: nextStatus,
  };
  const existing = await supabaseSelect<TeacherAssignmentPackRow>(TABLES.assignmentPacks, {
    select: '*',
    filters: [{ column: 'id', value: packId }],
    limit: 1,
  }).catch(() => []);
  if (existing[0]) {
    await supabaseUpdate<TeacherAssignmentPackRow>(
      TABLES.assignmentPacks,
      { payload: packData, status: packData.status, scope_id: scope.id, class_level: chapter.classLevel, subject: chapter.subject, section: scope.section ?? null, chapter_id: chapter.id },
      [{ column: 'id', value: packId }, { column: 'teacher_id', value: teacherId }]
    );
  } else {
    await supabaseInsert<TeacherAssignmentPackRow>(TABLES.assignmentPacks, {
      id: packId,
      teacher_id: teacherId,
      scope_id: scope.id,
      class_level: chapter.classLevel,
      subject: chapter.subject,
      section: scope.section ?? null,
      chapter_id: chapter.id,
      status: packData.status,
      payload: packData,
    });
  }
  await logTeacherActivity({ actorType: 'teacher', teacherId, action: 'create-assignment-pack', chapterId: chapter.id, packId, metadata: { status: nextStatus } });
  const saved = await getAssignmentPack(packId);
  if (!saved) throw new Error('Assignment pack save failed.');
  return saved;
}

async function getAssignmentPackRowById(packId: string): Promise<TeacherAssignmentPackRow | null> {
  const rows = await supabaseSelect<TeacherAssignmentPackRow>(TABLES.assignmentPacks, {
    select: '*',
    filters: [{ column: 'id', value: sanitizeText(packId, 80) }],
    limit: 1,
  }).catch(() => []);
  return rows[0] ?? null;
}

export async function getAssignmentPack(packId: string): Promise<TeacherAssignmentPack | null> {
  const row = await getAssignmentPackRowById(packId);
  return row ? toAssignmentPack(row) : null;
}

export async function getTeacherPackOwnerId(packId: string): Promise<string | null> {
  const row = await getAssignmentPackRowById(packId);
  return row?.teacher_id ?? null;
}

export async function canTeacherAccessAssignmentPack(teacherId: string, packId: string): Promise<boolean> {
  const row = await getAssignmentPackRowById(packId);
  if (!row) return false;
  if (row.teacher_id === teacherId) return true;
  return !!(await resolveTeacherScopeForChapter(teacherId, row.chapter_id, row.section ?? undefined));
}

export async function updateAssignmentPackStatus(input: {
  teacherId: string;
  packId: string;
  status: TeacherPackStatus;
  approved?: boolean;
  feedback?: string;
}): Promise<TeacherAssignmentPack | null> {
  const pack = await getAssignmentPack(input.packId);
  if (!pack) return null;
  const canAccess = await canTeacherAccessAssignmentPack(input.teacherId, input.packId);
  if (!canAccess) return null;
  const nextPayload: TeacherAssignmentPack = {
    ...pack,
    status: input.status,
    updatedAt: new Date().toISOString(),
    feedbackHistory: pack.feedbackHistory ?? [],
  };
  if (typeof input.feedback === 'string' && input.feedback.trim()) {
    nextPayload.feedbackHistory = [
      ...(nextPayload.feedbackHistory ?? []),
      {
        id: randomUUID(),
        feedback: sanitizeText(input.feedback, 800),
        createdAt: new Date().toISOString(),
        createdByTeacherId: input.teacherId,
      },
    ];
  }
  if (input.approved) {
    nextPayload.approvedByTeacherId = input.teacherId;
    nextPayload.approvedAt = new Date().toISOString();
  }
  if (input.status === 'published') {
    nextPayload.publishedAt = new Date().toISOString();
  }

  await supabaseUpdate<TeacherAssignmentPackRow>(
    TABLES.assignmentPacks,
    {
      status: input.status,
      payload: nextPayload,
      updated_at: new Date().toISOString(),
    },
    [{ column: 'id', value: sanitizeText(input.packId, 80) }, { column: 'teacher_id', value: input.teacherId }]
  );
  const actionMap: Record<TeacherPackStatus, TeacherActionHistoryEntry['action']> = {
    draft: 'create-assignment-pack',
    review: 'regenerate-assignment-pack',
    published: 'publish-assignment-pack',
    archived: 'archive-assignment-pack',
  };
  await logTeacherActivity({
    actorType: 'teacher',
    teacherId: input.teacherId,
    action: actionMap[input.status],
    packId: input.packId,
    metadata: { approved: !!input.approved },
  });
  return getAssignmentPack(input.packId);
}

export async function listTeacherQuestionBank(teacherId: string, filters?: { chapterId?: string }): Promise<TeacherQuestionBankItem[]> {
  const where: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'teacher_id', value: teacherId },
    { column: 'is_active', value: true },
  ];
  if (filters?.chapterId) where.push({ column: 'chapter_id', value: sanitizeText(filters.chapterId, 80) });
  const rows = await supabaseSelect<TeacherQuestionBankRow>(TABLES.questionBank, {
    select: '*',
    filters: where,
    orderBy: 'updated_at',
    ascending: false,
    limit: 1000,
  }).catch(() => []);
  const items: TeacherQuestionBankItem[] = [];
  for (const row of rows) {
    const parsed = toQuestionBankItem(row);
    if (!parsed) continue;
    items.push(parsed);
  }
  return items;
}

export async function createTeacherQuestionBankItem(input: {
  teacherId: string;
  chapterId: string;
  kind: 'mcq' | 'short' | 'long';
  prompt: string;
  options?: string[];
  answerIndex?: number;
  rubric?: string;
  maxMarks?: number;
  imageUrl?: string;
  section?: string;
}): Promise<TeacherQuestionBankItem | null> {
  const chapter = getChapterById(sanitizeText(input.chapterId, 80));
  if (!chapter) throw new Error('Invalid chapterId.');
  const scope = await resolveTeacherScopeForChapter(input.teacherId, chapter.id, input.section);
  if (!scope) throw new Error('Teacher does not have scope for this chapter.');
  const prompt = sanitizeText(input.prompt, 1000);
  if (!prompt) throw new Error('Question prompt is required.');
  const options = (input.options ?? []).map((item) => sanitizeText(item, 240)).filter((item) => item.length > 0);
  const maxMarks = Number.isFinite(Number(input.maxMarks)) ? Math.max(0.25, Math.min(100, Number(input.maxMarks))) : 1;
  const answerIndex = Number.isFinite(Number(input.answerIndex)) ? Number(input.answerIndex) : undefined;
  const [row] = await supabaseInsert<TeacherQuestionBankRow>(TABLES.questionBank, {
    id: randomUUID(),
    teacher_id: input.teacherId,
    scope_id: scope.id,
    class_level: chapter.classLevel,
    subject: chapter.subject,
    section: scope.section ?? null,
    chapter_id: chapter.id,
    kind: input.kind,
    prompt,
    options,
    answer_index: input.kind === 'mcq' && Number.isFinite(answerIndex) ? answerIndex : null,
    rubric: input.rubric ? sanitizeText(input.rubric, 800) : null,
    max_marks: maxMarks,
    image_url: input.imageUrl ? sanitizeText(input.imageUrl, 500) : null,
    is_active: true,
  });
  if (!row) return null;
  return toQuestionBankItem(row);
}

export async function updateTeacherQuestionBankItem(input: {
  teacherId: string;
  itemId: string;
  prompt?: string;
  options?: string[];
  answerIndex?: number;
  rubric?: string;
  maxMarks?: number;
  imageUrl?: string;
}): Promise<TeacherQuestionBankItem | null> {
  const itemId = sanitizeText(input.itemId, 80);
  const rows = await supabaseSelect<TeacherQuestionBankRow>(TABLES.questionBank, {
    select: '*',
    filters: [{ column: 'id', value: itemId }, { column: 'teacher_id', value: input.teacherId }, { column: 'is_active', value: true }],
    limit: 1,
  }).catch(() => []);
  if (!rows[0]) return null;
  const patch: Record<string, unknown> = {};
  if (typeof input.prompt === 'string') patch.prompt = sanitizeText(input.prompt, 1000);
  if (Array.isArray(input.options)) patch.options = input.options.map((item) => sanitizeText(item, 240)).filter((item) => item.length > 0);
  if (input.answerIndex !== undefined) patch.answer_index = Number.isFinite(Number(input.answerIndex)) ? Number(input.answerIndex) : null;
  if (input.rubric !== undefined) patch.rubric = input.rubric ? sanitizeText(input.rubric, 800) : null;
  if (input.maxMarks !== undefined) patch.max_marks = Number.isFinite(Number(input.maxMarks)) ? Math.max(0.25, Math.min(100, Number(input.maxMarks))) : 1;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl ? sanitizeText(input.imageUrl, 500) : null;
  const [updated] = await supabaseUpdate<TeacherQuestionBankRow>(TABLES.questionBank, patch, [{ column: 'id', value: itemId }, { column: 'teacher_id', value: input.teacherId }]);
  if (!updated) return null;
  return toQuestionBankItem(updated);
}

export async function deleteTeacherQuestionBankItem(teacherId: string, itemId: string): Promise<boolean> {
  const rows = await supabaseUpdate<TeacherQuestionBankRow>(
    TABLES.questionBank,
    { is_active: false },
    [{ column: 'id', value: sanitizeText(itemId, 80) }, { column: 'teacher_id', value: teacherId }]
  ).catch(() => []);
  return rows.length > 0;
}

export async function publishWeeklyPlan(teacherId: string, input: {
  title: string;
  classPreset: TeacherClassPreset;
  classLevel: 10 | 12;
  subject?: string;
  focusChapterIds: string[];
  planWeeks: TeacherWeeklyPlan['planWeeks'];
  dueDate?: string;
  section?: string;
}): Promise<TeacherWeeklyPlan> {
  const session = await getTeacherSessionById(teacherId);
  const baseChapter = input.focusChapterIds[0] ? getChapterById(input.focusChapterIds[0]) : undefined;
  const scope = baseChapter
    ? await resolveTeacherScopeForChapter(teacherId, baseChapter.id, input.section)
    : session?.effectiveScopes[0] ?? null;
  if (!scope) throw new Error('Teacher scope required for weekly plan.');
  const allowedFocus = input.focusChapterIds.filter((chapterId) =>
    session?.effectiveScopes.some((item) => scopeMatchesChapter(item, chapterId, input.section))
  );
  if (allowedFocus.length === 0) {
    throw new Error('Weekly plan chapters are outside your assigned scope.');
  }
  const planId = randomUUID();
  const plan: TeacherWeeklyPlan = {
    planId,
    title: sanitizeText(input.title, 180) || 'Weekly Classroom Plan',
    classPreset: input.classPreset,
    classLevel: input.classLevel,
    subject: input.subject ? sanitizeText(input.subject, 60) : undefined,
    focusChapterIds: allowedFocus.slice(0, 12),
    planWeeks: input.planWeeks.slice(0, 16),
    dueDate: input.dueDate ? sanitizeText(input.dueDate, 40) : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdByKeyId: teacherId,
    status: 'active',
  };
  await supabaseInsert<TeacherWeeklyPlanRow>(TABLES.weeklyPlans, {
    id: planId,
    teacher_id: teacherId,
    scope_id: scope.id,
    class_level: input.classLevel,
    subject: input.subject ?? scope.subject,
    section: scope.section ?? null,
    status: 'active',
    payload: plan,
  });
  await logTeacherActivity({ actorType: 'teacher', teacherId, action: 'publish-weekly-plan', metadata: { weeks: plan.planWeeks.length } });
  return plan;
}

export async function archiveWeeklyPlan(teacherId: string, planId: string): Promise<TeacherWeeklyPlan | null> {
  const rows = await supabaseUpdate<TeacherWeeklyPlanRow>(
    TABLES.weeklyPlans,
    { status: 'archived' },
    [{ column: 'id', value: sanitizeText(planId, 80) }, { column: 'teacher_id', value: teacherId }]
  );
  const row = rows[0];
  if (!row) return null;
  await logTeacherActivity({ actorType: 'teacher', teacherId, action: 'archive-weekly-plan', metadata: { planId } });
  return toWeeklyPlan(row);
}

export async function addSubmission(input: {
  packId: string;
  studentId?: string;
  studentName: string;
  submissionCode: string;
  answers: TeacherSubmissionAnswer[];
  result?: TeacherSubmissionResult;
}): Promise<{ submission: TeacherSubmission; duplicate: boolean }> {
  const pack = await getAssignmentPack(input.packId);
  if (!pack || pack.status !== 'published') throw new Error('Published assignment pack not found.');
  const packId = sanitizeText(input.packId, 80);
  const studentId = input.studentId ? sanitizeText(input.studentId, 80) : '';
  const studentName = sanitizeText(input.studentName || 'Student', 120) || 'Student';
  const submissionCode = normalizeSubmissionCode(input.submissionCode);
  const answers = input.answers
    .map((entry) => ({ questionNo: sanitizeText(entry.questionNo, 30).toUpperCase(), answerText: sanitizeText(entry.answerText, 1600) }))
    .filter((entry) => entry.questionNo && entry.answerText);
  if (!submissionCode || answers.length === 0) throw new Error('Valid submissionCode and answers are required.');

  const existing = await supabaseSelect<TeacherSubmissionRow>(TABLES.submissions, {
    select: '*',
    filters: [{ column: 'pack_id', value: packId }, { column: 'submission_code', value: submissionCode }],
    orderBy: 'created_at',
    ascending: false,
    limit: 200,
  }).catch(() => []);
  const duplicate = existing.length > 0;
  const attemptNo = existing.length + 1;

  const [inserted] = await supabaseInsert<TeacherSubmissionRow>(TABLES.submissions, {
    id: randomUUID(),
    pack_id: packId,
    student_id: studentId || null,
    student_name: studentName,
    submission_code: submissionCode,
    attempt_no: attemptNo,
    status: 'pending_review',
    answers,
    result: {
      scoreEstimate: Math.max(0, Math.min(100, Number(input.result?.scoreEstimate) || 0)),
      mistakes: (input.result?.mistakes ?? []).slice(0, 12),
      weakTopics: (input.result?.weakTopics ?? []).slice(0, 12),
      nextActions: (input.result?.nextActions ?? []).slice(0, 12),
      attemptDetail: input.result?.attemptDetail
        ? {
            ...input.result.attemptDetail,
            attemptNo,
            submittedAt: new Date().toISOString(),
          }
        : undefined,
      integritySummary: input.result?.integritySummary,
    },
    grading: {},
    released_at: null,
  });
  if (!inserted) throw new Error('Failed to store submission.');
  await logTeacherActivity({
    actorType: 'system',
    action: 'add-submission',
    chapterId: pack.chapterId,
    packId: pack.packId,
    metadata: {
      submissionCode,
      studentName,
      scoreEstimate: inserted.result.scoreEstimate,
      attemptNo,
    },
  });
  return {
    duplicate,
    submission: {
      submissionId: inserted.id,
      packId: inserted.pack_id,
      studentName: inserted.student_name,
      studentId: inserted.student_id ?? undefined,
      submissionCode: inserted.submission_code,
      attemptNo: inserted.attempt_no,
      answers: inserted.answers,
      scoreEstimate: inserted.result.scoreEstimate,
      mistakes: inserted.result.mistakes ?? [],
      weakTopics: inserted.result.weakTopics ?? [],
      nextActions: inserted.result.nextActions ?? [],
      attemptDetail: inserted.result.attemptDetail,
      integritySummary: inserted.result.integritySummary,
      createdAt: inserted.created_at,
      status: inserted.status,
      grading: parseSubmissionGrading(inserted.grading),
      releasedAt: inserted.released_at ?? undefined,
    },
  };
}

export async function getSubmissionSummary(packId: string): Promise<TeacherSubmissionSummary> {
  const rows = await supabaseSelect<TeacherSubmissionRow>(TABLES.submissions, {
    select: '*',
    filters: [{ column: 'pack_id', value: sanitizeText(packId, 80) }],
    orderBy: 'created_at',
    ascending: false,
    limit: 600,
  }).catch(() => []);
  return summarizeSubmissions(rows);
}

export async function getTeacherSubmissionSummary(teacherId: string, packId: string): Promise<TeacherSubmissionSummary | null> {
  const canAccess = await canTeacherAccessAssignmentPack(teacherId, packId);
  if (!canAccess) return null;
  return getSubmissionSummary(packId);
}

export async function getStudentSubmissionResults(input: {
  packId: string;
  studentId: string;
  rollCode: string;
}): Promise<TeacherSubmission[]> {
  const packId = sanitizeText(input.packId, 80);
  const studentId = sanitizeText(input.studentId, 80);
  const rollCode = normalizeSubmissionCode(input.rollCode);
  if (!packId || !studentId || !rollCode) return [];

  const byStudentId = await supabaseSelect<TeacherSubmissionRow>(TABLES.submissions, {
    select: '*',
    filters: [{ column: 'pack_id', value: packId }, { column: 'student_id', value: studentId }],
    orderBy: 'created_at',
    ascending: false,
    limit: 60,
  }).catch(() => []);
  const byRollCode = await supabaseSelect<TeacherSubmissionRow>(TABLES.submissions, {
    select: '*',
    filters: [{ column: 'pack_id', value: packId }, { column: 'submission_code', value: rollCode }],
    orderBy: 'created_at',
    ascending: false,
    limit: 60,
  }).catch(() => []);

  const rows = [...byStudentId, ...byRollCode];
  const seen = new Set<string>();
  const results: TeacherSubmission[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const status: TeacherSubmissionStatus =
      row.status === 'graded' || row.status === 'released' || row.status === 'pending_review'
        ? row.status
        : 'pending_review';
    const released = status === 'released';
    results.push({
      submissionId: row.id,
      packId: row.pack_id,
      studentName: row.student_name,
      studentId: row.student_id ?? undefined,
      submissionCode: row.submission_code,
      attemptNo: row.attempt_no,
      answers: row.answers,
      scoreEstimate: released ? row.result?.scoreEstimate ?? 0 : 0,
      mistakes: released ? row.result?.mistakes ?? [] : [],
      weakTopics: released ? row.result?.weakTopics ?? [] : [],
      nextActions: released ? row.result?.nextActions ?? [] : [],
      attemptDetail: released ? row.result?.attemptDetail : undefined,
      integritySummary: released ? row.result?.integritySummary : undefined,
      createdAt: row.created_at,
      status,
      grading: released ? parseSubmissionGrading(row.grading) : undefined,
      releasedAt: released ? row.released_at ?? undefined : undefined,
    });
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25);
}

export async function gradeSubmission(input: {
  teacherId: string;
  submissionId: string;
  questionGrades: Array<{ questionNo: string; scoreAwarded: number; maxScore: number; feedback?: string }>;
}): Promise<TeacherSubmission | null> {
  const submissionId = sanitizeText(input.submissionId, 80);
  const rows = await supabaseSelect<TeacherSubmissionRow>(TABLES.submissions, {
    select: '*',
    filters: [{ column: 'id', value: submissionId }],
    limit: 1,
  }).catch(() => []);
  const row = rows[0];
  if (!row) return null;
  const canAccess = await canTeacherAccessAssignmentPack(input.teacherId, row.pack_id);
  if (!canAccess) return null;

  const normalizedGrades = input.questionGrades
    .map((item) => ({
      questionNo: sanitizeText(item.questionNo, 30).toUpperCase(),
      scoreAwarded: Number(item.scoreAwarded),
      maxScore: Number(item.maxScore),
      feedback: item.feedback ? sanitizeText(item.feedback, 400) : undefined,
    }))
    .filter((item) => item.questionNo && Number.isFinite(item.scoreAwarded) && Number.isFinite(item.maxScore) && item.maxScore >= 0)
    .map((item) => ({
      ...item,
      scoreAwarded: Math.max(0, Math.min(item.maxScore, item.scoreAwarded)),
    }));
  if (normalizedGrades.length === 0) {
    throw new Error('At least one valid question grade is required.');
  }
  const totalScore = normalizedGrades.reduce((sum, item) => sum + item.scoreAwarded, 0);
  const maxScore = Math.max(1, normalizedGrades.reduce((sum, item) => sum + item.maxScore, 0));
  const percentage = Math.round((totalScore / maxScore) * 10000) / 100;
  const grading: TeacherSubmissionGrading = {
    gradedByTeacherId: input.teacherId,
    gradedAt: new Date().toISOString(),
    totalScore,
    maxScore,
    percentage,
    questionGrades: normalizedGrades,
  };

  const [updated] = await supabaseUpdate<TeacherSubmissionRow>(
    TABLES.submissions,
    {
      grading,
      status: 'graded',
      result: {
        ...(row.result ?? {}),
        scoreEstimate: Math.round(Math.max(0, Math.min(100, percentage))),
      },
    },
    [{ column: 'id', value: submissionId }]
  );
  if (!updated) return null;
  await logTeacherActivity({
    actorType: 'teacher',
    teacherId: input.teacherId,
    action: 'grade-submission',
    packId: updated.pack_id,
    metadata: { submissionId, percentage },
  });
  return {
    submissionId: updated.id,
    packId: updated.pack_id,
    studentName: updated.student_name,
    studentId: updated.student_id ?? undefined,
    submissionCode: updated.submission_code,
    attemptNo: updated.attempt_no,
    answers: updated.answers,
    scoreEstimate: Math.round(Math.max(0, Math.min(100, percentage))),
    mistakes: updated.result?.mistakes ?? [],
    weakTopics: updated.result?.weakTopics ?? [],
    nextActions: updated.result?.nextActions ?? [],
    attemptDetail: updated.result?.attemptDetail,
    integritySummary: updated.result?.integritySummary,
    createdAt: updated.created_at,
    status: updated.status,
    grading: parseSubmissionGrading(updated.grading),
    releasedAt: updated.released_at ?? undefined,
  };
}

export async function releaseSubmissionResults(input: {
  teacherId: string;
  packId: string;
  submissionIds?: string[];
}): Promise<{ releasedCount: number }> {
  const packId = sanitizeText(input.packId, 80);
  const canAccess = await canTeacherAccessAssignmentPack(input.teacherId, packId);
  if (!canAccess) return { releasedCount: 0 };

  const rows = await supabaseSelect<TeacherSubmissionRow>(TABLES.submissions, {
    select: '*',
    filters: [{ column: 'pack_id', value: packId }],
    orderBy: 'created_at',
    ascending: false,
    limit: 800,
  }).catch(() => []);
  const targetIds = new Set((input.submissionIds ?? []).map((item) => sanitizeText(item, 80)).filter((item) => item.length > 0));
  let releasedCount = 0;
  for (const row of rows) {
    if (targetIds.size > 0 && !targetIds.has(row.id)) continue;
    if (row.status !== 'graded') continue;
    const updated = await supabaseUpdate<TeacherSubmissionRow>(
      TABLES.submissions,
      {
        status: 'released',
        released_at: new Date().toISOString(),
      },
      [{ column: 'id', value: row.id }]
    ).catch(() => []);
    if (updated.length > 0) releasedCount += 1;
  }

  await logTeacherActivity({
    actorType: 'teacher',
    teacherId: input.teacherId,
    action: 'release-submission',
    packId,
    metadata: { releasedCount },
  });
  return { releasedCount };
}

function calculateIntegritySummary(
  violationCounts: Record<string, number> | null | undefined,
  totalViolations: number
): ExamIntegritySummary {
  const counts = violationCounts ?? {};
  const total = Math.max(0, Number(totalViolations) || 0);
  let riskLevel: ExamIntegritySummary['riskLevel'] = 'low';
  if (total >= 6) riskLevel = 'high';
  else if (total >= 3) riskLevel = 'medium';
  return {
    riskLevel,
    totalViolations: total,
    violationCounts: counts,
    lastViolationAt: undefined,
  };
}

export async function startExamSession(input: {
  packId: string;
  studentName: string;
  submissionCode: string;
}): Promise<ExamSession> {
  const pack = await getAssignmentPack(input.packId);
  if (!pack || pack.status !== 'published') {
    throw new Error('Assignment pack not found.');
  }
  const studentName = sanitizeText(input.studentName, 120) || 'Student';
  const submissionCode = normalizeSubmissionCode(input.submissionCode);
  if (!submissionCode) {
    throw new Error('Valid submission code is required.');
  }
  const [row] = await supabaseInsert<ExamSessionRow>(TABLES.examSessions, {
    id: randomUUID(),
    pack_id: pack.packId,
    student_name: studentName,
    submission_code: submissionCode,
    status: 'active',
    violation_counts: {},
    total_violations: 0,
    started_at: new Date().toISOString(),
  });
  if (!row) throw new Error('Failed to start exam session.');
  return {
    sessionId: row.id,
    packId: row.pack_id,
    studentName: row.student_name,
    submissionCode: row.submission_code,
    status: row.status,
    startedAt: row.started_at,
    lastHeartbeatAt: row.last_heartbeat_at ?? undefined,
  };
}

export async function getExamSession(sessionId: string): Promise<ExamSession | null> {
  const rows = await supabaseSelect<ExamSessionRow>(TABLES.examSessions, {
    select: '*',
    filters: [{ column: 'id', value: sanitizeText(sessionId, 80) }],
    limit: 1,
  }).catch(() => []);
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.id,
    packId: row.pack_id,
    studentName: row.student_name,
    submissionCode: row.submission_code,
    status: row.status,
    startedAt: row.started_at,
    lastHeartbeatAt: row.last_heartbeat_at ?? undefined,
  };
}

export async function recordExamHeartbeat(input: {
  sessionId: string;
  events?: ExamViolationEvent[];
}): Promise<{ session: ExamSession; integritySummary: ExamIntegritySummary }> {
  const sessionId = sanitizeText(input.sessionId, 80);
  const rows = await supabaseSelect<ExamSessionRow>(TABLES.examSessions, {
    select: '*',
    filters: [{ column: 'id', value: sessionId }],
    limit: 1,
  }).catch(() => []);
  const row = rows[0];
  if (!row) throw new Error('Exam session not found.');

  const events = (input.events ?? [])
    .map((item) => ({
      type: sanitizeText(item.type, 60),
      detail: item.detail ? sanitizeText(item.detail, 240) : null,
      occurredAt: item.occurredAt || new Date().toISOString(),
    }))
    .filter((item) => item.type.length > 0)
    .slice(0, 20);

  const nextCounts: Record<string, number> = { ...(row.violation_counts ?? {}) };
  for (const event of events) {
    nextCounts[event.type] = (nextCounts[event.type] ?? 0) + 1;
  }
  const totalViolations = Object.values(nextCounts).reduce((sum, value) => sum + (Number(value) || 0), 0);

  if (events.length > 0) {
    await supabaseInsert<ExamViolationRow>(
      TABLES.examViolations,
      events.map((event) => ({
        session_id: sessionId,
        event_type: event.type,
        detail: event.detail,
        occurred_at: event.occurredAt,
      }))
    ).catch(() => undefined);
  }

  const [updated] = await supabaseUpdate<ExamSessionRow>(
    TABLES.examSessions,
    {
      violation_counts: nextCounts,
      total_violations: totalViolations,
      last_heartbeat_at: new Date().toISOString(),
    },
    [{ column: 'id', value: sessionId }]
  );
  if (!updated) throw new Error('Exam heartbeat update failed.');

  return {
    session: {
      sessionId: updated.id,
      packId: updated.pack_id,
      studentName: updated.student_name,
      submissionCode: updated.submission_code,
      status: updated.status,
      startedAt: updated.started_at,
      lastHeartbeatAt: updated.last_heartbeat_at ?? undefined,
    },
    integritySummary: calculateIntegritySummary(updated.violation_counts, updated.total_violations),
  };
}

export async function completeExamSession(sessionId: string): Promise<ExamIntegritySummary> {
  const [updated] = await supabaseUpdate<ExamSessionRow>(
    TABLES.examSessions,
    {
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    },
    [{ column: 'id', value: sanitizeText(sessionId, 80) }]
  );
  if (!updated) return calculateIntegritySummary({}, 0);
  const violations = await supabaseSelect<ExamViolationRow>(TABLES.examViolations, {
    select: '*',
    filters: [{ column: 'session_id', value: updated.id }],
    orderBy: 'occurred_at',
    ascending: false,
    limit: 1000,
  }).catch(() => []);
  const summary = calculateIntegritySummary(updated.violation_counts, updated.total_violations);
  summary.lastViolationAt = violations[0]?.occurred_at;
  return summary;
}

export async function getAdminOverview(schoolId?: string): Promise<{
  totalTeachers: number;
  activeTeachers: number;
  scopesByClass: Array<{ classLevel: 10 | 12; count: number }>;
  scopesBySubject: Array<{ subject: string; count: number }>;
  scopesBySection: Array<{ section: string; count: number }>;
  topWeakTopics: Array<{ topic: string; count: number }>;
  topChapters: Array<{ chapterId: string; count: number }>;
  assignmentCompletionsThisWeek: number;
  analytics: Awaited<ReturnType<typeof getAnalyticsSummary>>;
  storageStatus: Awaited<ReturnType<typeof getTeacherStorageStatus>>;
  highRiskExamSessions: number;
}> {
  const storageStatus = await getTeacherStorageStatus();
  if (!isSupabaseServiceConfigured()) {
    return {
      totalTeachers: 0,
      activeTeachers: 0,
      scopesByClass: [],
      scopesBySubject: [],
      scopesBySection: [],
      topWeakTopics: [],
      topChapters: [],
      assignmentCompletionsThisWeek: 0,
      analytics: await getAnalyticsSummary(12),
      storageStatus,
      highRiskExamSessions: 0,
    };
  }
  const scopedSchoolId = schoolId ? sanitizeText(schoolId, 80) : undefined;
  const [teachers, scopes, submissions, packs, analytics, examSessions] = await Promise.all([
    supabaseSelect<TeacherProfileRow>(TABLES.profiles, {
      select: '*',
      filters: scopedSchoolId ? [{ column: 'school_id', value: scopedSchoolId }] : undefined,
      limit: 500,
    }).catch(() => []),
    supabaseSelect<TeacherScopeRow>(TABLES.scopes, {
      select: '*',
      filters: [
        { column: 'is_active', value: true },
        ...(scopedSchoolId ? [{ column: 'school_id', value: scopedSchoolId }] : []),
      ],
      limit: 2000,
    }).catch(() => []),
    supabaseSelect<TeacherSubmissionRow>(TABLES.submissions, { select: '*', orderBy: 'created_at', ascending: false, limit: 3000 }).catch(() => []),
    supabaseSelect<TeacherAssignmentPackRow>(TABLES.assignmentPacks, {
      select: '*',
      filters: scopedSchoolId ? [{ column: 'school_id', value: scopedSchoolId }] : undefined,
      limit: 2000,
    }).catch(() => []),
    getAnalyticsSummary(12),
    supabaseSelect<ExamSessionRow>(TABLES.examSessions, { select: '*', limit: 3000 }).catch(() => []),
  ]);
  const scopedPackIds = scopedSchoolId ? new Set(packs.map((pack) => pack.id)) : null;
  const scopedSubmissions = scopedPackIds
    ? submissions.filter((submission) => scopedPackIds.has(submission.pack_id))
    : submissions;
  const scopedExamSessions = scopedPackIds
    ? examSessions.filter((session) => scopedPackIds.has(session.pack_id))
    : examSessions;

  const classMap = new Map<10 | 12, number>();
  const subjectMap = new Map<string, number>();
  const sectionMap = new Map<string, number>();
  for (const scope of scopes) {
    if (scope.class_level === 10 || scope.class_level === 12) {
      const classLevel = scope.class_level as 10 | 12;
      classMap.set(classLevel, (classMap.get(classLevel) ?? 0) + 1);
    }
    subjectMap.set(scope.subject, (subjectMap.get(scope.subject) ?? 0) + 1);
    sectionMap.set(scope.section || 'All Sections', (sectionMap.get(scope.section || 'All Sections') ?? 0) + 1);
  }
  const weakMap = new Map<string, number>();
  for (const row of scopedSubmissions) {
    for (const topic of row.result?.weakTopics ?? []) {
      const key = sanitizeText(topic, 120).toLowerCase();
      if (!key) continue;
      weakMap.set(key, (weakMap.get(key) ?? 0) + 1);
    }
  }
  const chapterMap = new Map<string, number>();
  for (const row of packs) {
    const chapterId = sanitizeText(row.chapter_id, 80);
    if (!chapterId) continue;
    chapterMap.set(chapterId, (chapterMap.get(chapterId) ?? 0) + 1);
  }
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  return {
    totalTeachers: teachers.length,
    activeTeachers: teachers.filter((teacher) => teacher.status === 'active').length,
    scopesByClass: [10, 12].map((level) => ({ classLevel: level as 10 | 12, count: classMap.get(level as 10 | 12) ?? 0 })),
    scopesBySubject: [...subjectMap.entries()].sort((a, b) => b[1] - a[1]).map(([subject, count]) => ({ subject, count })),
    scopesBySection: [...sectionMap.entries()].sort((a, b) => b[1] - a[1]).map(([section, count]) => ({ section, count })),
    topWeakTopics: [...weakMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([topic, count]) => ({ topic, count })),
    topChapters: [...chapterMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([chapterId, count]) => ({ chapterId, count })),
    assignmentCompletionsThisWeek: scopedSubmissions.filter((row) => new Date(row.created_at).getTime() >= weekStart.getTime()).length,
    analytics,
    storageStatus,
    highRiskExamSessions: scopedExamSessions.filter((item) => Number(item.total_violations) >= 6).length,
  };
}
