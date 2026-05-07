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

function quoteCsv(value: unknown): string {
  const text = String(value ?? '');
  if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvRows(rows: Array<Array<unknown>>): string {
  return rows.map((row) => row.map((value) => quoteCsv(value)).join(',')).join('\n');
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getAdminSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Admin session required.', requestId);
  if (!session.schoolId) {
    return errorJson({ requestId, errorCode: 'admin-school-missing', message: 'Admin school context is required.', status: 403 });
  }

  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'csv').trim().toLowerCase();

  try {
    const today = startOfDay(new Date());
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);

    const [overview, rows] = await Promise.all([
      getAdminOverview(session.schoolId),
      loadDailyStats(req, session.schoolId, sevenDaysAgo.toISOString()),
    ]);

    const report = {
      generatedAt: new Date().toISOString(),
      schoolId: session.schoolId,
      overview,
      dailyStats: rows,
    };

    if (format === 'json') {
      return dataJson({ requestId, data: report });
    }

    if (format !== 'csv') {
      return errorJson({ requestId, errorCode: 'unsupported-format', message: 'Supported formats: csv, json.', status: 400 });
    }

    const lines: Array<Array<unknown>> = [
      ['Report', 'Admin Analytics Export'],
      ['Generated At', report.generatedAt],
      ['School ID', report.schoolId],
      [],
      ['Overview Metric', 'Value'],
      ['Total Teachers', overview.totalTeachers],
      ['Active Teachers', overview.activeTeachers],
      ['Active Students', overview.activeStudents],
      ['Assignment Completions This Week', overview.assignmentCompletionsThisWeek],
      ['High Risk Exam Sessions', overview.highRiskExamSessions],
      [],
      ['Daily Stats'],
      ['Date', 'Active Students', 'Submissions', 'Graded', 'Released'],
      ...rows.map((row) => [
        row.date,
        row.active_students,
        row.total_submissions,
        row.graded_count,
        row.released_count,
      ]),
      [],
      ['Top Weak Topics'],
      ['Topic', 'Count'],
      ...overview.topWeakTopics.map((topic) => [topic.topic, topic.count]),
    ];

    const csv = buildCsvRows(lines);
    const filenameDate = report.generatedAt.slice(0, 10);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="admin-analytics-${filenameDate}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'admin-analytics-export-failed',
      message: error instanceof Error ? error.message : 'Failed to export admin analytics.',
      status: 500,
    });
  }
}
