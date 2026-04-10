export const dynamic = 'force-dynamic';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getStudentSubmissionResults } from '@/lib/teacher-admin-db';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const student = await getStudentSessionFromRequestCookies();
  if (!student) {
    return errorJson({
      requestId,
      errorCode: 'unauthorized',
      message: 'Student login required.',
      status: 401,
    });
  }
  const url = new URL(req.url);
  const packId = url.searchParams.get('packId')?.trim() || '';
  if (!packId) {
    return errorJson({
      requestId,
      errorCode: 'missing-pack-id',
      message: 'packId is required.',
      status: 400,
    });
  }

  const attempts = await getStudentSubmissionResults({
    packId,
    studentId: student.studentId,
    rollCode: student.rollCode,
  });
  return dataJson({ requestId, data: { attempts } });
}
