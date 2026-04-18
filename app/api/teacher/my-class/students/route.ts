import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getClassSectionById, isTeacherClassTeacherForSection } from '@/lib/school-management-db';
import { listStudents } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Teacher session required.', requestId);

  const url = new URL(req.url);
  const classSectionId = url.searchParams.get('classSectionId')?.trim() || '';
  if (!classSectionId) {
    return errorJson({ requestId, errorCode: 'missing-class-section-id', message: 'classSectionId is required.', status: 400 });
  }

  const section = await getClassSectionById(classSectionId);
  if (!section) {
    return errorJson({ requestId, errorCode: 'section-not-found', message: 'Class section not found.', status: 404 });
  }

  const allowed = await isTeacherClassTeacherForSection(session.teacher.id, classSectionId, section.schoolId);
  if (!allowed) {
    return errorJson({ requestId, errorCode: 'class-teacher-required', message: 'Only the class teacher can view this section\'s roster.', status: 403 });
  }

  try {
    const students = await listStudents({
      schoolId: section.schoolId,
      classLevel: section.classLevel,
      section: section.section,
    });
    return dataJson({ requestId, data: { students, section } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load students.';
    return errorJson({ requestId, errorCode: 'students-list-failed', message, status: 500 });
  }
}
