import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listVisibleWeeklyPlansForStudent } from '@/lib/student/weekly-plans.db';

export const dynamic = 'force-dynamic';

function toLimit(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 120;
  return Math.max(1, Math.min(250, Math.trunc(value)));
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);
  if (!studentSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'student-school-missing',
      message: 'Student school context is required.',
      status: 403,
    });
  }

  const url = new URL(req.url);
  const limit = toLimit(url.searchParams.get('limit'));

  try {
    const weeklyPlans = await listVisibleWeeklyPlansForStudent(
      {
        classLevel: studentSession.classLevel,
        schoolId: studentSession.schoolId,
        section: studentSession.section,
        stream: studentSession.stream,
        enrolledSubjects: studentSession.enrolledSubjects,
      },
      limit
    );

    return dataJson({
      requestId,
      data: { weeklyPlans },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load weekly plans.';
    return errorJson({
      requestId,
      errorCode: 'student-weekly-plans-read-failed',
      message,
      status: 500,
    });
  }
}
