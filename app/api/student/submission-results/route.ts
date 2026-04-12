export const dynamic = 'force-dynamic';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getAssignmentPack, getAssignmentPackSchoolId, getStudentSubmissionResults } from '@/lib/teacher-admin-db';

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
  const [pack, packSchoolId] = await Promise.all([
    getAssignmentPack(packId),
    getAssignmentPackSchoolId(packId),
  ]);
  if (!pack) {
    return errorJson({
      requestId,
      errorCode: 'assignment-pack-not-found',
      message: 'Assignment pack not found.',
      status: 404,
    });
  }
  if (!student.schoolId || !packSchoolId || packSchoolId !== student.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'school-mismatch',
      message: 'This assignment is not available for your school.',
      status: 403,
    });
  }
  if (pack.classLevel !== student.classLevel) {
    return errorJson({
      requestId,
      errorCode: 'class-mismatch',
      message: 'This assignment is not available for your class.',
      status: 403,
    });
  }
  if (pack.section && student.section && pack.section !== student.section) {
    return errorJson({
      requestId,
      errorCode: 'section-restricted',
      message: 'This assignment is section restricted.',
      status: 403,
    });
  }
  if (pack.section && !student.section) {
    return errorJson({
      requestId,
      errorCode: 'missing-student-section',
      message: 'Student section is missing for this restricted assignment.',
      status: 403,
    });
  }

  const attempts = await getStudentSubmissionResults({
    packId,
    studentId: student.studentId,
    rollCode: student.rollCode,
  });
  return dataJson({ requestId, data: { attempts } });
}
