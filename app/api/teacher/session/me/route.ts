import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listClassSectionsForTeacher } from '@/lib/school-management-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) return unauthorizedJson('Teacher session required.', requestId);
    const { managedSections, classAssignments } = await listClassSectionsForTeacher(session.teacher.id);
    return dataJson({
      requestId,
      data: {
        teacher: session.teacher,
        effectiveScopes: session.effectiveScopes,
        managedSections,
        classAssignments,
        sessionExpiry: Date.now() + 8 * 60 * 60 * 1000,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read teacher session.';
    return errorJson({
      requestId,
      errorCode: 'teacher-session-read-failed',
      message,
      status: 500,
    });
  }
}
