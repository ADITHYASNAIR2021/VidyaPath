import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listStudentGrades } from '@/lib/school-ops-db';

export const dynamic = 'force-dynamic';

function getSinceTimestamp(days: number): number {
  const now = Date.now();
  return now - Math.max(1, days) * 24 * 60 * 60 * 1000;
}

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
    const grades = await listStudentGrades({
      studentId: studentSession.studentId,
      rollCode: studentSession.rollCode,
      schoolId: studentSession.schoolId,
    });

    const sinceMs = getSinceTimestamp(7);
    const newGradesCount = grades.filter((grade) => {
      const releasedAtMs = Date.parse(grade.releasedAt ?? '');
      return Number.isFinite(releasedAtMs) && releasedAtMs >= sinceMs;
    }).length;

    return dataJson({
      requestId,
      data: { newGradesCount },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load student notification summary.';
    return errorJson({
      requestId,
      errorCode: 'student-notification-summary-failed',
      message,
      status: 500,
    });
  }
}
