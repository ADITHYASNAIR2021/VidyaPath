import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listTeacherGradebook } from '@/lib/school-ops-db';
import { listClassSectionsForTeacher } from '@/lib/school-management-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);
  if (!teacherSession.teacher.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'teacher-school-missing',
      message: 'Teacher school context is required.',
      status: 403,
    });
  }
  try {
    const sectionsResult = await listClassSectionsForTeacher(teacherSession.teacher.id);
    const homeroomSections = sectionsResult.managedSections
      .filter((section) => section.status === 'active' && section.classTeacherId === teacherSession.teacher.id)
      .map((section) => ({ classLevel: section.classLevel, section: section.section }));

    const gradebook = await listTeacherGradebook({
      teacherId: teacherSession.teacher.id,
      schoolId: teacherSession.teacher.schoolId,
      classSections: homeroomSections,
    });
    return dataJson({
      requestId,
      data: {
        ...gradebook,
        scope: {
          mode: homeroomSections.length > 0 ? 'homeroom' : 'teacher',
          homeroomSections,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load teacher gradebook.';
    return errorJson({
      requestId,
      errorCode: 'teacher-gradebook-read-failed',
      message,
      status: 500,
    });
  }
}
