import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { canTeacherAccessAssignmentPack } from '@/lib/teacher-admin-db';
import { supabaseSelect } from '@/lib/supabase-rest';

export const dynamic = 'force-dynamic';

const SUBMISSIONS_TABLE = 'teacher_submissions';

export async function GET(req: Request, { params }: { params: { submissionId: string } }) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Unauthorized.', requestId);

  const submissionId = params.submissionId?.trim();
  if (!submissionId) {
    return errorJson({ requestId, errorCode: 'missing-id', message: 'submissionId is required.', status: 400 });
  }

  // Fetch the raw row
  const rows = await supabaseSelect<{
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
  }>(SUBMISSIONS_TABLE, {
    select: '*',
    filters: [{ column: 'id', value: submissionId }],
    limit: 1,
  }).catch(() => []);

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
