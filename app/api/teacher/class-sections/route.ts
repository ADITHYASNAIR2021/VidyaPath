import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listClassSectionsForTeacher } from '@/lib/school-management-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Teacher session required.', requestId);
  try {
    const data = await listClassSectionsForTeacher(session.teacher.id);
    return dataJson({
      requestId,
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load class sections.';
    return errorJson({
      requestId,
      errorCode: 'teacher-class-sections-read-failed',
      message,
      status: 500,
    });
  }
}
