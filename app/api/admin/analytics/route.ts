import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getAdminOverview } from '@/lib/teacher-admin-db';
import { resolveRequestSupabaseClient } from '@/lib/supabase/request-client';

export const dynamic = 'force-dynamic';

interface DailyStatRow {
  date: string;
  active_students: number;
  total_submissions: number;
  graded_count: number;
  released_count: number;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

async function loadDailyStats(req: Request, schoolId: string, sinceIso: string): Promise<DailyStatRow[]> {
  const resolvedClient = resolveRequestSupabaseClient(req, 'service-first');
  if (!resolvedClient) return [];

  const { data, error } = await resolvedClient.client
    .from('daily_school_submission_stats')
    .select('date,active_students,total_submissions,graded_count,released_count')
    .eq('school_id', schoolId)
    .gte('date', sinceIso.slice(0, 10))
    .order('date', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to load submission analytics.');
  return (data ?? []) as DailyStatRow[];
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  if (!adminSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'admin-school-missing',
      message: 'Admin school context is required.',
      status: 403,
    });
  }

  try {
    const today = startOfDay(new Date());
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);

    const [overview, rows] = await Promise.all([
      getAdminOverview(adminSession.schoolId),
      loadDailyStats(req, adminSession.schoolId, sevenDaysAgo.toISOString()),
    ]);

    // Build dense 7-day series — fill in missing days with zeros
    const statsByDate = new Map<string, DailyStatRow>();
    for (const row of rows) {
      statsByDate.set(row.date, row);
    }

    const dailyActiveStudents7d: { date: string; activeStudents: number }[] = [];
    let funnelSubmitted = 0;
    let funnelGraded = 0;
    let funnelReleased = 0;

    for (let i = 0; i < 7; i += 1) {
      const date = new Date(sevenDaysAgo);
      date.setDate(sevenDaysAgo.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      const row = statsByDate.get(key);
      dailyActiveStudents7d.push({ date: key, activeStudents: row?.active_students ?? 0 });
      funnelSubmitted += row?.total_submissions ?? 0;
      funnelGraded += row?.graded_count ?? 0;
      funnelReleased += row?.released_count ?? 0;
    }

    const assignmentCompletionFunnel = {
      assigned: overview.assignmentCompletionsThisWeek,
      submitted: funnelSubmitted,
      reviewed: funnelGraded,
      released: funnelReleased,
    };

    return dataJson({
      requestId,
      data: {
        generatedAt: new Date().toISOString(),
        schoolId: adminSession.schoolId,
        overview,
        dailyActiveStudents7d,
        assignmentCompletionFunnel,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load admin analytics.';
    return errorJson({
      requestId,
      errorCode: 'admin-analytics-read-failed',
      message,
      status: 500,
    });
  }
}
