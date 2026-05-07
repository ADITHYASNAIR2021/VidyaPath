import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listTeacherQuestions } from '@/lib/school-ops-db';
import { resolveRequestSupabaseClient } from '@/lib/supabase/request-client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  if (!adminSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-scope',
      message: 'Admin school context is required.',
      status: 403,
    });
  }

  const schoolId = adminSession.schoolId;

  try {
    const resolvedClient = resolveRequestSupabaseClient(req, 'service-first');

    // Count pending student questions across the school
    const pendingQuestions = await listTeacherQuestions({
      schoolId,
      status: 'pending',
      limit: 1000,
    }).then((rows) => rows.length).catch(() => 0);

    // Count ungraded (pending_review) submissions across the school via packs
    let ungradedSubmissions = 0;
    if (resolvedClient) {
      const { data: packRows, error: packError } = await resolvedClient.client
        .from('teacher_assignment_packs')
        .select('id')
        .eq('school_id', schoolId)
        .eq('status', 'published')
        .limit(2000);

      if (!packError && packRows && packRows.length > 0) {
        const packIds = (packRows as Array<{ id: string }>).map((row) => row.id);
        // chunk to avoid URL length limits
        const CHUNK = 250;
        let count = 0;
        for (let i = 0; i < packIds.length; i += CHUNK) {
          const chunk = packIds.slice(i, i + CHUNK);
          const { count: chunkCount, error: subError } = await resolvedClient.client
            .from('teacher_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending_review')
            .in('pack_id', chunk);
          if (!subError && typeof chunkCount === 'number') {
            count += chunkCount;
          }
        }
        ungradedSubmissions = count;
      }
    }

    return dataJson({
      requestId,
      data: { pendingQuestions, ungradedSubmissions },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load admin notification summary.';
    return errorJson({
      requestId,
      errorCode: 'admin-notification-summary-failed',
      message,
      status: 500,
    });
  }
}
