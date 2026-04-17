import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getAdminOverview } from '@/lib/teacher-admin-db';
import { resolveRequestSupabaseClient } from '@/lib/supabase/request-client';

export const dynamic = 'force-dynamic';

interface SubmissionRow {
  id: string;
  student_id: string | null;
  created_at: string;
  status: string | null;
}

type TeacherIdRow = { id: string };
type PackIdRow = { id: string };

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

async function loadRecentSchoolSubmissions(req: Request, schoolId: string, sinceIso: string): Promise<SubmissionRow[]> {
  const resolvedClient = resolveRequestSupabaseClient(req, 'service-first');
  if (!resolvedClient) return [];

  const { data: teacherRows, error: teachersError } = await resolvedClient.client
    .from('teacher_profiles')
    .select('id')
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .limit(5000);
  if (teachersError) throw new Error(teachersError.message || 'Failed to load teacher profiles.');
  const teacherIds = ((teacherRows || []) as TeacherIdRow[]).map((row) => row.id).filter(Boolean);
  if (teacherIds.length === 0) return [];

  const { data: packRows, error: packsError } = await resolvedClient.client
    .from('teacher_assignment_packs')
    .select('id')
    .in('teacher_id', teacherIds)
    .limit(25000);
  if (packsError) throw new Error(packsError.message || 'Failed to load assignment packs.');
  const packIds = ((packRows || []) as PackIdRow[]).map((row) => row.id).filter(Boolean);
  if (packIds.length === 0) return [];

  const { data: submissionRows, error: submissionsError } = await resolvedClient.client
    .from('teacher_submissions')
    .select('id,student_id,created_at,status')
    .in('pack_id', packIds)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(25000);
  if (submissionsError) throw new Error(submissionsError.message || 'Failed to load submission analytics.');
  return (submissionRows || []) as SubmissionRow[];
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
    const overview = await getAdminOverview(adminSession.schoolId);
    const today = startOfDay(new Date());
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    const submissions = await loadRecentSchoolSubmissions(req, adminSession.schoolId, sevenDaysAgo.toISOString());
    const activeByDate = new Map<string, Set<string>>();
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(sevenDaysAgo);
      date.setDate(sevenDaysAgo.getDate() + i);
      activeByDate.set(date.toISOString().slice(0, 10), new Set());
    }
    for (const row of submissions) {
      const dateKey = row.created_at.slice(0, 10);
      if (!activeByDate.has(dateKey)) continue;
      if (!row.student_id) continue;
      activeByDate.get(dateKey)?.add(row.student_id);
    }
    const dailyActiveStudents7d = [...activeByDate.entries()].map(([date, students]) => ({
      date,
      activeStudents: students.size,
    }));

    // Real funnel counts from actual submission statuses in the 7-day window
    const funnelSubmitted = submissions.length;
    const funnelGraded = submissions.filter(
      (s) => s.status === 'graded' || s.status === 'released'
    ).length;
    const funnelReleased = submissions.filter((s) => s.status === 'released').length;
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
