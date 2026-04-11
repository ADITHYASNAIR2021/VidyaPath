import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listTimetableSlots } from '@/lib/school-ops-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);
  if (!studentSession.schoolId || !studentSession.classLevel || !studentSession.section) {
    return errorJson({
      requestId,
      errorCode: 'student-scope-missing',
      message: 'Student class and school scope are required.',
      status: 400,
    });
  }
  try {
    const slots = await listTimetableSlots({
      schoolId: studentSession.schoolId,
      classLevel: studentSession.classLevel,
      section: studentSession.section,
    });
    return dataJson({
      requestId,
      data: {
        classLevel: studentSession.classLevel,
        section: studentSession.section,
        slots,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load student timetable.';
    return errorJson({
      requestId,
      errorCode: 'student-timetable-read-failed',
      message,
      status: 500,
    });
  }
}
