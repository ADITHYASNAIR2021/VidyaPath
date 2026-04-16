import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { publishWeeklyPlan } from '@/lib/teacher-admin-db';
import { isSupabaseServiceConfigured, supabaseSelect } from '@/lib/supabase-rest';
import type { TeacherWeeklyPlan, TeacherClassPreset } from '@/lib/teacher-types';

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

  try {
    if (!isSupabaseServiceConfigured()) {
      return dataJson({ requestId, data: { plans: [] } });
    }
    const rows = await supabaseSelect<WeeklyPlanRow>('teacher_weekly_plans', {
      select: 'id,class_level,subject,section,status,payload,created_at,updated_at',
      filters: [
        { column: 'teacher_id', value: session.teacher.id },
        { column: 'status', value: 'active' },
      ],
      orderBy: 'created_at',
      ascending: false,
      limit: 50,
    }).catch(() => [] as WeeklyPlanRow[]);

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

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 32 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }

  const { title, classPreset, classLevel, subject, focusChapterIds, planWeeks, dueDate, section } = bodyResult.value;

  if (typeof title !== 'string' || !title.trim()) {
    return errorJson({ requestId, errorCode: 'missing-title', message: 'title is required.', status: 400 });
  }
  if (!Array.isArray(focusChapterIds) || focusChapterIds.length === 0) {
    return errorJson({ requestId, errorCode: 'missing-chapters', message: 'focusChapterIds is required.', status: 400 });
  }
  if (!Array.isArray(planWeeks) || planWeeks.length === 0) {
    return errorJson({ requestId, errorCode: 'missing-weeks', message: 'planWeeks is required.', status: 400 });
  }

  const resolvedClassLevel: 10 | 12 = Number(classLevel) === 10 ? 10 : 12;
  const resolvedPreset: TeacherClassPreset = (classPreset as TeacherClassPreset) ?? 'standard';

  try {
    const plan = await publishWeeklyPlan(session.teacher.id, {
      title: String(title).trim(),
      classPreset: resolvedPreset,
      classLevel: resolvedClassLevel,
      subject: typeof subject === 'string' ? subject.trim() : undefined,
      focusChapterIds: (focusChapterIds as unknown[]).filter((id): id is string => typeof id === 'string'),
      planWeeks: planWeeks as TeacherWeeklyPlan['planWeeks'],
      dueDate: typeof dueDate === 'string' ? dueDate.trim() : undefined,
      section: typeof section === 'string' ? section.trim() : undefined,
    });
    return dataJson({ requestId, data: { plan } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create weekly plan.';
    return errorJson({ requestId, errorCode: 'weekly-plan-create-failed', message, status: 500 });
  }
}
