import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getStudentCertificateSummary } from '@/lib/study-enhancements-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);
  if (!studentSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'student-school-missing',
      message: 'Student school scope is required.',
      status: 403,
    });
  }

  try {
    const summary = await getStudentCertificateSummary({
      studentId: studentSession.studentId,
      studentName: studentSession.studentName,
      classLevel: studentSession.classLevel,
      rollCode: studentSession.rollCode,
      schoolId: studentSession.schoolId,
    });
    return dataJson({ requestId, data: summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate certificate summary.';
    return errorJson({ requestId, errorCode: 'certificate-summary-failed', message, status: 500 });
  }
}

