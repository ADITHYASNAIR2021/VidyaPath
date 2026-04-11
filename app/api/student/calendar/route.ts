import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listSchoolEvents } from '@/lib/school-ops-db';

export const dynamic = 'force-dynamic';

function toText(value: unknown, max = 220): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
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
  const fromDate = toText(url.searchParams.get('fromDate'), 20);
  const toDate = toText(url.searchParams.get('toDate'), 20);
  const limit = Number(url.searchParams.get('limit') || 250);

  try {
    const events = await listSchoolEvents({
      schoolId: studentSession.schoolId,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit,
    });
    const filtered = events.filter((event) => {
      if (!event.classLevel) return true;
      if (!studentSession.classLevel || event.classLevel !== studentSession.classLevel) return false;
      if (!event.section) return true;
      return event.section === studentSession.section;
    });
    return dataJson({
      requestId,
      data: { events: filtered },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load calendar.';
    return errorJson({
      requestId,
      errorCode: 'student-calendar-read-failed',
      message,
      status: 500,
    });
  }
}

