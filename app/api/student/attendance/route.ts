import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getStudentAttendanceSummary } from '@/lib/school-ops-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);
  try {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get('days') || 120);
    const summary = await getStudentAttendanceSummary({
      studentId: studentSession.studentId,
      schoolId: studentSession.schoolId,
      days: Number.isFinite(days) ? days : 120,
    });
    return dataJson({
      requestId,
      data: summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load attendance summary.';
    return errorJson({
      requestId,
      errorCode: 'student-attendance-read-failed',
      message,
      status: 500,
    });
  }
}

