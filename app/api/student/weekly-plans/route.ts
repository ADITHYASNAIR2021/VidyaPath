import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { getSubjectsForAcademicTrack, type AcademicStream } from '@/lib/academic-taxonomy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { supabaseSelect } from '@/lib/supabase-rest';
import type { TeacherWeeklyPlan } from '@/lib/teacher-types';

export const dynamic = 'force-dynamic';

interface TeacherProfileRow {
  id: string;
  school_id: string | null;
  status: 'active' | 'inactive';
}

interface TeacherWeeklyPlanRow {
  id: string;
  teacher_id: string;
  class_level: number;
  subject: string | null;
  section: string | null;
  status: 'active' | 'archived';
  payload: TeacherWeeklyPlan | null;
  created_at: string;
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

function toLimit(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 120;
  return Math.max(1, Math.min(250, Math.trunc(value)));
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

  const url = new URL(req.url);
  const limit = toLimit(url.searchParams.get('limit'));
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
    const weeklyPlanRows =
      schoolTeacherIds.size === 0
        ? []
        : await supabaseSelect<TeacherWeeklyPlanRow>('teacher_weekly_plans', {
          select: 'id,teacher_id,class_level,subject,section,status,payload,created_at,updated_at',
          filters: [
            { column: 'class_level', value: studentSession.classLevel },
            { column: 'status', value: 'active' },
            { column: 'teacher_id', op: 'in', value: [...schoolTeacherIds] },
          ],
          orderBy: 'updated_at',
          ascending: false,
          limit: Math.max(160, limit),
        }).catch(() => []);

    const weeklyPlans = weeklyPlanRows
      .filter((row) => schoolTeacherIds.has(normalizeText(row.teacher_id, 80)))
      .filter((row) => sectionVisible(row.section, studentSection))
      .filter((row) => {
        const rowSubject = normalizeText(String(row.subject ?? row.payload?.subject ?? ''), 80).toLowerCase();
        if (!rowSubject || allowedSubjects.size === 0) return true;
        return allowedSubjects.has(rowSubject);
      })
      .map((row) => toWeeklyPlan(row))
      .filter((row): row is TeacherWeeklyPlan => !!row)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);

    return dataJson({
      requestId,
      data: { weeklyPlans },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load weekly plans.';
    return errorJson({
      requestId,
      errorCode: 'student-weekly-plans-read-failed',
      message,
      status: 500,
    });
  }
}
