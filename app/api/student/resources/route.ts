import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listResources } from '@/lib/school-ops-db';

export const dynamic = 'force-dynamic';

function toClassLevel(value: unknown): 10 | 12 | undefined {
  const parsed = Number(value);
  if (parsed === 10 || parsed === 12) return parsed;
  return undefined;
}

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
  const classLevel = toClassLevel(url.searchParams.get('classLevel')) || studentSession.classLevel;
  const section = toText(url.searchParams.get('section'), 40).toUpperCase() || studentSession.section;
  const chapterId = toText(url.searchParams.get('chapterId'), 90);
  const subject = toText(url.searchParams.get('subject'), 80);
  const limit = Number(url.searchParams.get('limit') || 120);
  try {
    const resources = await listResources({
      schoolId: studentSession.schoolId,
      classLevel,
      section: section || undefined,
      chapterId: chapterId || undefined,
      limit,
    });
    const allowedSubjects = new Set((studentSession.enrolledSubjects ?? []).map((item) => String(item)));
    const filtered = resources.filter((item) => {
      if (!item.subject) return true;
      if (allowedSubjects.size === 0) return true;
      return allowedSubjects.has(item.subject);
    }).filter((item) => !subject || item.subject === subject);
    return dataJson({
      requestId,
      data: { resources: filtered },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load resources.';
    return errorJson({
      requestId,
      errorCode: 'student-resources-read-failed',
      message,
      status: 500,
    });
  }
}
