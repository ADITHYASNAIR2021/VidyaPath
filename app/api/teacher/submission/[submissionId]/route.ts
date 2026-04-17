import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { canTeacherAccessAssignmentPack } from '@/lib/teacher-admin-db';
import { resolveRequestSupabaseClient } from '@/lib/supabase/request-client';

export const dynamic = 'force-dynamic';

const SUBMISSIONS_TABLE = 'teacher_submissions';

type SubmissionRow = {
  id: string;
  pack_id: string;
  student_id: string | null;
  student_name: string;
  submission_code: string;
  attempt_no: number;
  status: string;
  answers: Array<{ questionNo: string; answerText: string }>;
  result: Record<string, unknown> | null;
  grading: Record<string, unknown> | null;
  released_at: string | null;
  created_at: string;
};

export async function GET(req: Request, { params }: { params: { submissionId: string } }) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Unauthorized.', requestId);

  const submissionId = params.submissionId?.trim();
  if (!submissionId) {
    return errorJson({ requestId, errorCode: 'missing-id', message: 'submissionId is required.', status: 400 });
  }

  const resolvedClient = resolveRequestSupabaseClient(req, 'user-first');
  if (!resolvedClient) {
    return errorJson({
      requestId,
      errorCode: 'supabase-unavailable',
      message: 'Submission storage is unavailable.',
      status: 503,
    });
  }

  // Fetch the raw row
  const rows: SubmissionRow[] = await resolvedClient.client
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .eq('id', submissionId)
    .limit(1)
    .then(({ data, error }) => {
      if (error) throw new Error(error.message || 'Failed to load submission.');
      return (data || []) as SubmissionRow[];
    })
    .then(undefined, (): SubmissionRow[] => []);

  if (rows.length === 0) {
    return errorJson({ requestId, errorCode: 'not-found', message: 'Submission not found.', status: 404 });
  }

  const row = rows[0];

  // Verify teacher owns the pack
  const canAccess = await canTeacherAccessAssignmentPack(session.teacher.id, row.pack_id);
  if (!canAccess) {
    return errorJson({ requestId, errorCode: 'forbidden', message: 'Access denied.', status: 403 });
  }

  return dataJson({
    requestId,
    data: {
      submissionId: row.id,
      packId: row.pack_id,
      studentName: row.student_name,
      studentId: row.student_id ?? undefined,
      submissionCode: row.submission_code,
      attemptNo: row.attempt_no,
      status: row.status,
      answers: Array.isArray(row.answers) ? row.answers : [],
      grading: row.grading ?? null,
      createdAt: row.created_at,
    },
  });
}
