import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { getSubjectsForAcademicTrack, type AcademicStream } from '@/lib/academic-taxonomy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { supabaseSelect } from '@/lib/supabase-rest';
import type { TeacherAssignmentPack } from '@/lib/teacher-types';

export const dynamic = 'force-dynamic';

interface TeacherProfileRow {
  id: string;
  school_id: string | null;
  status: 'active' | 'inactive';
}

interface TeacherAssignmentPackRow {
  id: string;
  teacher_id: string;
  school_id: string | null;
  class_level: number;
  subject: string;
  section: string | null;
  chapter_id: string;
  status: 'draft' | 'review' | 'published' | 'archived';
  visibility_status?: 'open' | 'closed' | null;
  valid_from?: string | null;
  valid_until?: string | null;
  payload: TeacherAssignmentPack | null;
  updated_at: string;
}

function normalizeText(value: string, max = 220): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function toStudentSection(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = normalizeText(value, 40).toUpperCase();
  return clean || undefined;
}

function sectionVisible(rowSection: string | null | undefined, studentSection?: string): boolean {
  const cleanRowSection = rowSection ? normalizeText(rowSection, 40).toUpperCase() : '';
  if (!studentSection) return !cleanRowSection;
  return !cleanRowSection || cleanRowSection === studentSection;
}

function buildAllowedSubjectSet(session: {
  classLevel: 10 | 12;
  stream?: AcademicStream;
  enrolledSubjects?: string[];
}): Set<string> {
  const enrolled = (session.enrolledSubjects ?? [])
    .map((item) => normalizeText(String(item), 80).toLowerCase())
    .filter(Boolean);
  const fallback = getSubjectsForAcademicTrack(session.classLevel, session.stream)
    .map((item) => normalizeText(String(item), 80).toLowerCase())
    .filter(Boolean);
  const source = enrolled.length > 0 ? enrolled : fallback;
  return new Set(source);
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function isPackOpenForStudents(row: TeacherAssignmentPackRow, payload: TeacherAssignmentPack, now = new Date()): boolean {
  const visibilityStatus = payload.visibilityStatus ?? row.visibility_status ?? 'open';
  if (visibilityStatus !== 'open') return false;

  const validFrom = payload.validFrom ?? row.valid_from ?? undefined;
  if (validFrom) {
    const validFromMs = Date.parse(validFrom);
    if (Number.isFinite(validFromMs) && validFromMs > now.getTime()) return false;
  }

  const validUntil = payload.validUntil ?? row.valid_until ?? undefined;
  if (validUntil) {
    const validUntilMs = Date.parse(validUntil);
    if (Number.isFinite(validUntilMs) && validUntilMs < now.getTime()) return false;
  }

  return true;
}

function normalizeAssignmentRow(row: TeacherAssignmentPackRow): TeacherAssignmentPack | null {
  if (row.status !== 'published') return null;
  const payload = row.payload;
  if (!payload || typeof payload !== 'object') return null;
  if (!isPackOpenForStudents(row, payload)) return null;
  const title = normalizeText(payload.title || `${row.subject} Assignment`, 180);
  const dueDate =
    typeof payload.dueDate === 'string' && normalizeText(payload.dueDate, 60)
      ? normalizeText(payload.dueDate, 60)
      : undefined;
  const shareUrl =
    typeof payload.shareUrl === 'string' && normalizeText(payload.shareUrl, 500)
      ? normalizeText(payload.shareUrl, 500)
      : `/practice/assignment/${encodeURIComponent(row.id)}`;
  const printUrl =
    typeof payload.printUrl === 'string' && normalizeText(payload.printUrl, 500)
      ? normalizeText(payload.printUrl, 500)
      : '';
  return {
    ...payload,
    packId: row.id,
    title,
    chapterId: normalizeText(row.chapter_id, 80),
    classLevel: row.class_level === 10 ? 10 : 12,
    subject: normalizeText(row.subject, 80),
    section: row.section ?? undefined,
    questionCount: Math.max(0, Math.trunc(toNumber(payload.questionCount, 0))),
    dueDate,
    estimatedTimeMinutes: Math.max(0, Math.trunc(toNumber(payload.estimatedTimeMinutes, 0))),
    shareUrl,
    printUrl,
    difficultyMix: typeof payload.difficultyMix === 'string' ? payload.difficultyMix : '',
    includeShortAnswers: payload.includeShortAnswers === true,
    includeFormulaDrill: payload.includeFormulaDrill === true,
    mcqs: Array.isArray(payload.mcqs) ? payload.mcqs : [],
    shortAnswers: Array.isArray(payload.shortAnswers) ? payload.shortAnswers : [],
    longAnswers: Array.isArray(payload.longAnswers) ? payload.longAnswers : [],
    formulaDrill: Array.isArray(payload.formulaDrill) ? payload.formulaDrill : [],
    commonMistakes: Array.isArray(payload.commonMistakes) ? payload.commonMistakes : [],
    answerKey: Array.isArray(payload.answerKey) ? payload.answerKey : [],
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : row.updated_at,
    createdByKeyId:
      typeof payload.createdByKeyId === 'string'
        ? payload.createdByKeyId
        : normalizeText(row.teacher_id, 80),
    status: 'published',
    updatedAt: row.updated_at,
  };
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);
  if (!studentSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'student-school-missing',
      message: 'Student school context is required.',
      status: 403,
    });
  }

  const studentSection = toStudentSection(studentSession.section);
  const allowedSubjects = buildAllowedSubjectSet(studentSession);

  try {
    const teacherRows = await supabaseSelect<TeacherProfileRow>('teacher_profiles', {
      select: 'id,school_id,status',
      filters: [
        { column: 'school_id', value: studentSession.schoolId },
        { column: 'status', value: 'active' },
      ],
      limit: 2500,
    }).catch(() => []);

    const schoolTeacherIds = new Set(
      teacherRows
        .map((row) => normalizeText(row.id, 80))
        .filter((id) => id.length > 0)
    );
    const assignmentRows =
      schoolTeacherIds.size === 0
        ? []
        : await supabaseSelect<TeacherAssignmentPackRow>('teacher_assignment_packs', {
          select: 'id,teacher_id,school_id,class_level,subject,section,chapter_id,status,visibility_status,valid_from,valid_until,payload,updated_at',
          filters: [
            { column: 'class_level', value: studentSession.classLevel },
            { column: 'status', value: 'published' },
            { column: 'teacher_id', op: 'in', value: [...schoolTeacherIds] },
          ],
          orderBy: 'updated_at',
          ascending: false,
          limit: 300,
        }).catch(() => []);

    const assignments = assignmentRows
      .filter((row) => schoolTeacherIds.has(normalizeText(row.teacher_id, 80)))
      .filter((row) => {
        const rowSchoolId = row.school_id ? normalizeText(row.school_id, 80) : '';
        return rowSchoolId === studentSession.schoolId;
      })
      .filter((row) => sectionVisible(row.section, studentSection))
      .filter((row) => {
        if (allowedSubjects.size === 0) return true;
        return allowedSubjects.has(normalizeText(row.subject, 80).toLowerCase());
      })
      .map((row) => normalizeAssignmentRow(row))
      .filter((row): row is TeacherAssignmentPack => !!row)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return dataJson({
      requestId,
      data: { assignments },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load assignments.';
    return errorJson({
      requestId,
      errorCode: 'student-assignments-read-failed',
      message,
      status: 500,
    });
  }
}
