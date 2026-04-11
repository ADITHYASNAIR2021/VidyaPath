import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listSchoolAnnouncements } from '@/lib/school-ops-db';

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
    const all = await listSchoolAnnouncements({
      schoolId: studentSession.schoolId,
      limit: 120,
    });
    const filtered = all.filter((item) => {
      if (item.audience === 'all' || item.audience === 'students') return true;
      if (item.audience === 'class10') return studentSession.classLevel === 10;
      if (item.audience === 'class12') return studentSession.classLevel === 12;
      return false;
    });
    return dataJson({
      requestId,
      data: { announcements: filtered },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load student announcements.';
    return errorJson({
      requestId,
      errorCode: 'student-announcements-read-failed',
      message,
      status: 500,
    });
  }
}
