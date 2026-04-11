import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listSchoolAnnouncements } from '@/lib/school-ops-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);
  if (!teacherSession.teacher.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'teacher-school-missing',
      message: 'Teacher school scope is required.',
      status: 403,
    });
  }
  try {
    const all = await listSchoolAnnouncements({
      schoolId: teacherSession.teacher.schoolId,
      limit: 120,
    });
    const filtered = all.filter((item) => item.audience === 'all' || item.audience === 'teachers');
    return dataJson({
      requestId,
      data: { announcements: filtered },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load school announcements.';
    return errorJson({
      requestId,
      errorCode: 'teacher-school-announcements-read-failed',
      message,
      status: 500,
    });
  }
}
