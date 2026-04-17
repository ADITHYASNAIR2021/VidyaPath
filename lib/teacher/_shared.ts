import { randomUUID } from 'node:crypto';
import { ALL_CHAPTERS, getChapterById } from '@/lib/data';
import { isSupportedSubject, normalizeAcademicStream, type AcademicStream } from '@/lib/academic-taxonomy';
import { getAnalyticsSummary } from '@/lib/analytics-store';
import { hashPin, isValidPin, verifyPin } from '@/lib/auth/pin';
import { createSupabaseAuthUser } from '@/lib/auth/supabase-auth';
import { issueFriendlyIdentifier } from '@/lib/auth/friendly-ids';
import {
  assertPasswordPolicy,
  buildInitialStudentPasswordFromLoginId,
  generateLegacyPin,
  generateStrongPassword,
} from '@/lib/auth/password-policy';
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
import { ensureDefaultEnrollmentsForStudent } from '@/lib/school-management-db';
import { logServerEvent } from '@/lib/observability';

export type RowId = string;

export interface TeacherProfileRow {
  id: RowId;
  school_id?: RowId | null;
  auth_user_id?: RowId | null;
  auth_email?: string | null;
  staff_code?: string | null;
  phone: string;
  name: string;
  pin_hash: string;
  must_change_password?: boolean | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface TeacherScopeRow {
  id: RowId;
  school_id?: RowId | null;
  teacher_id: RowId;
  class_level: number;
  subject: string;
  section: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TeacherAnnouncementRow {
  id: RowId;
  teacher_id: RowId;
  scope_id: RowId | null;
  class_level: number;
  subject: string;
  section: string | null;
  chapter_id: string | null;
  title: string;
  body: string;
  batch: string | null;
  delivery_scope: 'class' | 'section' | 'batch' | 'chapter';
  is_active: boolean;
  created_at: string;
}

export interface TeacherTopicPriorityRow {
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

export interface TeacherQuizLinkRow {
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

export interface TeacherActivityRow {
  id: number;
  teacher_id: RowId | null;
  actor_type: 'teacher' | 'admin' | 'system';
  action: string;
  chapter_id: string | null;
  pack_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface TeacherAssignmentPackRow {
  id: RowId;
  teacher_id: RowId;
  scope_id: RowId | null;
  class_level: number;
  subject: string;
  section: string | null;
  chapter_id: string;
  status: TeacherPackStatus;
  visibility_status?: 'open' | 'closed' | null;
  valid_from?: string | null;
  valid_until?: string | null;
  closed_at?: string | null;
  reopened_count?: number | null;
  extended_count?: number | null;
  payload: TeacherAssignmentPack;
  created_at: string;
  updated_at: string;
}

export interface TeacherSubmissionRow {
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

export interface StudentProfileRow {
  id: RowId;
  school_id?: RowId | null;
  auth_user_id?: RowId | null;
  auth_email?: string | null;
  batch?: string | null;
  roll_no?: string | null;
  name: string;
  roll_code: string;
  class_level: number;
  academic_stream?: AcademicStream | null;
  section: string | null;
  pin_hash: string | null;
  must_change_password?: boolean | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface PlatformUserRoleRow {
  id: RowId;
  auth_user_id: RowId;
  role: 'student' | 'teacher' | 'admin' | 'developer';
  school_id: RowId | null;
  profile_id: RowId | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeacherQuestionBankRow {
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

export interface ExamSessionRow {
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

export interface ExamViolationRow {
  id: number;
  session_id: RowId;
  event_type: string;
  detail: string | null;
  occurred_at: string;
}

export interface TeacherWeeklyPlanRow {
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

export const TABLES = {
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

export function sanitizeText(value: string, max = 240): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeOptionalId(value: string | null | undefined, max = 80): string | null {
  if (typeof value !== 'string') return null;
  const clean = sanitizeText(value, max);
  return clean || null;
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '').trim();
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export function buildSyntheticPhoneFromSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const suffix = String(hash % 10_000_000).padStart(7, '0');
  return `900${suffix}`;
}

export function normalizeSubmissionCode(value: string): string {
  return sanitizeText(value, 80).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

export function normalizeRollCode(value: string): string {
  return sanitizeText(value, 120).toUpperCase().replace(/[^A-Z0-9._-]/g, '');
}

export function normalizeRosterToken(value: string, max = 64): string {
  return sanitizeText(value, max).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

export function normalizeAuthLocalPart(value: string, max = 40): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
  return cleaned || randomUUID().slice(0, 12);
}

export function buildProvisionedAuthEmail(input: {
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

export async function ensurePlatformRole(input: {
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

export function normalizeTopicList(topics: string[]): string[] {
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

export function toStudentProfile(row: StudentProfileRow): StudentProfile | null {
  if (row.class_level !== 10 && row.class_level !== 12) return null;
  const stream = normalizeAcademicStream(row.academic_stream);
  return {
    id: row.id,
    schoolId: row.school_id ?? undefined,
    name: row.name,
    rollNo: row.roll_no ?? undefined,
    batch: row.batch ?? undefined,
    rollCode: row.roll_code,
    classLevel: row.class_level,
    stream,
    section: row.section ?? undefined,
    status: row.status,
    hasPin: !!row.pin_hash,
    mustChangePassword: row.must_change_password === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toQuestionBankItem(row: TeacherQuestionBankRow): TeacherQuestionBankItem | null {
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

export function isSubjectAllowedForClass(classLevel: 10 | 12, subject: string): boolean {
  if (classLevel === 10) {
    return ['Physics', 'Chemistry', 'Biology', 'Math', 'English Core'].includes(subject);
  }
  return ['Physics', 'Chemistry', 'Biology', 'Math', 'Accountancy', 'Business Studies', 'Economics', 'English Core'].includes(subject);
}

export function toScope(row: TeacherScopeRow): TeacherScope | null {
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

export function toTeacherProfile(row: TeacherProfileRow, scopes: TeacherScope[]): TeacherProfile {
  return {
    id: row.id,
    schoolId: row.school_id ?? undefined,
    phone: row.phone,
    name: row.name,
    staffCode: row.staff_code ?? undefined,
    mustChangePassword: row.must_change_password === true,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scopes,
  };
}

export function scopeMatchesChapter(scope: TeacherScope, chapterId: string, section?: TeacherSectionCode): boolean {
  if (!scope.isActive) return false;
  const chapter = getChapterById(chapterId);
  if (!chapter) return false;
  if (chapter.classLevel !== scope.classLevel || chapter.subject !== scope.subject) return false;
  if (scope.section && section && scope.section !== section) return false;
  return true;
}

export async function getTeacherScopes(teacherId: string): Promise<TeacherScope[]> {
  const rows = await supabaseSelect<TeacherScopeRow>(TABLES.scopes, {
    select: '*',
    filters: [{ column: 'teacher_id', value: teacherId }],
    limit: 300,
  }).catch(() => []);
  return rows.map(toScope).filter((scope): scope is TeacherScope => !!scope);
}

export async function getTeacherProfileRow(teacherId: string): Promise<TeacherProfileRow | null> {
  const cleanId = sanitizeText(teacherId, 80);
  if (!cleanId) return null;
  const rows = await supabaseSelect<TeacherProfileRow>(TABLES.profiles, {
    select: '*',
    filters: [{ column: 'id', value: cleanId }],
    limit: 1,
  }).catch(() => []);
  return rows[0] ?? null;
}

export async function getTeacherSchoolId(teacherId: string): Promise<string | null> {
  const row = await getTeacherProfileRow(teacherId);
  return normalizeOptionalId(row?.school_id ?? null);
}

export function toAnnouncement(row: TeacherAnnouncementRow): TeacherAnnouncement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    deliveryScope: row.delivery_scope,
    batch: row.batch ?? undefined,
  };
}

export function toAssignmentPack(row: TeacherAssignmentPackRow): TeacherAssignmentPack | null {
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
    visibilityStatus:
      row.visibility_status === 'open' || row.visibility_status === 'closed'
        ? row.visibility_status
        : (row.payload.visibilityStatus === 'open' || row.payload.visibilityStatus === 'closed' ? row.payload.visibilityStatus : 'open'),
    validFrom: row.valid_from ?? row.payload.validFrom ?? row.created_at,
    validUntil: row.valid_until ?? row.payload.validUntil ?? row.payload.dueDate ?? undefined,
    closedAt: row.closed_at ?? row.payload.closedAt ?? undefined,
    reopenedCount: Number.isFinite(Number(row.reopened_count))
      ? Number(row.reopened_count)
      : Number.isFinite(Number(row.payload.reopenedCount))
        ? Number(row.payload.reopenedCount)
        : 0,
    extendedCount: Number.isFinite(Number(row.extended_count))
      ? Number(row.extended_count)
      : Number.isFinite(Number(row.payload.extendedCount))
        ? Number(row.payload.extendedCount)
        : 0,
    status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isPackOpenForStudents(pack: TeacherAssignmentPack, now = new Date()): boolean {
  if (pack.status !== 'published') return false;
  if ((pack.visibilityStatus || 'open') !== 'open') return false;
  if (pack.validFrom) {
    const validFromMs = Date.parse(pack.validFrom);
    if (Number.isFinite(validFromMs) && validFromMs > now.getTime()) return false;
  }
  if (pack.validUntil) {
    const validUntilMs = Date.parse(pack.validUntil);
    if (Number.isFinite(validUntilMs) && validUntilMs < now.getTime()) return false;
  }
  return true;
}

export function toWeeklyPlan(row: TeacherWeeklyPlanRow): TeacherWeeklyPlan | null {
  if (!row.payload || typeof row.payload !== 'object') return null;
  return {
    ...row.payload,
    planId: row.id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizePublicAnnouncements(rows: TeacherAnnouncementRow[]): TeacherAnnouncement[] {
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

export function sectionVisible(rowSection: string | null | undefined, requestedSection?: string): boolean {
  if (!requestedSection) {
    // Public/anonymous reads should only see all-section rows.
    return !rowSection;
  }
  return !rowSection || rowSection === requestedSection;
}

export function sectionPriority(rowSection: string | null | undefined, requestedSection?: string): number {
  if (requestedSection) {
    if (rowSection === requestedSection) return 3;
    if (!rowSection) return 2;
    return 1;
  }
  if (rowSection) return 2;
  return 1;
}

export function sortByLatestThenSpecificity<T extends { section?: string | null; updatedAt: string }>(
  items: T[],
  requestedSection?: string
): T[] {
  return [...items].sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
    return sectionPriority(b.section, requestedSection) - sectionPriority(a.section, requestedSection);
  });
}

export function parseSubmissionGrading(
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

export function getSubmissionDisplayedScore(row: TeacherSubmissionRow): number {
  const grading = parseSubmissionGrading(row.grading);
  if (grading) return Math.max(0, Math.min(100, Number(grading.percentage) || 0));
  return Math.max(0, Math.min(100, Number(row.result?.scoreEstimate || 0)));
}

export function summarizeSubmissions(rows: TeacherSubmissionRow[]): TeacherSubmissionSummary {
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

export function computeAssignmentAnalytics(packs: TeacherAssignmentPack[], submissionsByPack: Map<string, TeacherSubmissionRow[]>): TeacherAssignmentAnalytics {
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

export async function getAssignmentPackRowById(packId: string): Promise<TeacherAssignmentPackRow | null> {
  const rows = await supabaseSelect<TeacherAssignmentPackRow>(TABLES.assignmentPacks, {
    select: '*',
    filters: [{ column: 'id', value: sanitizeText(packId, 80) }],
    limit: 1,
  }).catch(() => []);
  return rows[0] ?? null;
}

export function calculateIntegritySummary(
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
