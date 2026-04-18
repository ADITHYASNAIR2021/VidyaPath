import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { teacherWeeklyPlanCreateSchema } from '@/lib/schemas/teacher';
import { publishWeeklyPlan } from '@/lib/teacher-admin-db';
import { resolveRequestSupabaseClient } from '@/lib/supabase/request-client';
import type { TeacherWeeklyPlan, TeacherClassPreset } from '@/lib/teacher-types';
import { teacherHasScopeForTarget } from '@/lib/teacher/scope-guards';

export const dynamic = 'force-dynamic';

interface WeeklyPlanRow {
  id: string;
  teacher_id: string;
  class_level: number;
  subject: string | null;
  section: string | null;
  status: 'active' | 'archived';
  payload: TeacherWeeklyPlan;
  created_at: string;
  updated_at: string;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Teacher session required.', requestId);
  if (!session.teacher.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'teacher-school-missing',
      message: 'Teacher school context is required.',
      status: 403,
    });
  }

  try {
    const resolvedClient = resolveRequestSupabaseClient(req, 'user-first');
    if (!resolvedClient) {
      return dataJson({ requestId, data: { plans: [] } });
    }
    const { data, error } = await resolvedClient.client
      .from('teacher_weekly_plans')
      .select('id,class_level,subject,section,status,payload,created_at,updated_at')
      .eq('teacher_id', session.teacher.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message || 'Failed to query weekly plans.');
    const rows = (data || []) as WeeklyPlanRow[];

    const plans: TeacherWeeklyPlan[] = rows
      .map((row) => row.payload)
      .filter((p): p is TeacherWeeklyPlan => !!p);

    return dataJson({ requestId, data: { plans } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load weekly plans.';
    return errorJson({ requestId, errorCode: 'weekly-plans-load-failed', message, status: 500 });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Teacher session required.', requestId);
  if (!session.teacher.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'teacher-school-missing',
      message: 'Teacher school context is required.',
      status: 403,
    });
  }

  const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, teacherWeeklyPlanCreateSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }

  const { title, classPreset, classLevel, subject, focusChapterIds, planWeeks, dueDate, section } = bodyResult.value;

  const resolvedClassLevel: 10 | 12 = Number(classLevel) === 10 ? 10 : 12;
  const resolvedPreset: TeacherClassPreset = (classPreset as TeacherClassPreset) ?? 'custom';
  const resolvedSection = typeof section === 'string' && section.trim().length > 0
    ? section.trim().toUpperCase()
    : undefined;
  const resolvedSubject = typeof subject === 'string' && subject.trim().length > 0
    ? subject.trim()
    : undefined;

  const classSubjectScopeAllowed = teacherHasScopeForTarget(session, {
    classLevel: resolvedClassLevel,
    subject: resolvedSubject,
    section: resolvedSection,
  });
  if (!classSubjectScopeAllowed) {
    return errorJson({
      requestId,
      errorCode: 'teacher-scope-forbidden',
      message: 'Weekly plan scope is outside your assigned class/subject/section permissions.',
      status: 403,
    });
  }

  for (const chapterId of focusChapterIds) {
    const chapterScopeAllowed = teacherHasScopeForTarget(session, {
      chapterId,
      section: resolvedSection,
    });
    if (!chapterScopeAllowed) {
      return errorJson({
        requestId,
        errorCode: 'teacher-scope-forbidden',
        message: `Chapter ${chapterId} is outside your assigned scope.`,
        status: 403,
      });
    }
  }

  try {
    const plan = await publishWeeklyPlan(session.teacher.id, {
      title: String(title).trim(),
      classPreset: resolvedPreset,
      classLevel: resolvedClassLevel,
      subject: resolvedSubject,
      focusChapterIds: (focusChapterIds as unknown[]).filter((id): id is string => typeof id === 'string'),
      planWeeks: planWeeks as unknown as TeacherWeeklyPlan['planWeeks'],
      dueDate: typeof dueDate === 'string' ? dueDate.trim() : undefined,
      section: resolvedSection,
    });
    return dataJson({ requestId, data: { plan } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create weekly plan.';
    return errorJson({ requestId, errorCode: 'weekly-plan-create-failed', message, status: 500 });
  }
}
