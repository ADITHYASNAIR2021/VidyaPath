import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listClassSectionsForSchool, listClassSectionsForTeacher } from '@/lib/school-management-db';
import { listTimetableSlotsForTeacher, listTimetableSlots } from '@/lib/school-ops-db';
import { teacherHasScopeForTarget } from '@/lib/teacher/scope-guards';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);

  const { teacher } = teacherSession;
  if (!teacher.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'teacher-school-missing',
      message: 'Teacher school context is required.',
      status: 403,
    });
  }

  try {
    const [personalSlots, sectionsResult] = await Promise.all([
      listTimetableSlotsForTeacher({ schoolId: teacher.schoolId, teacherId: teacher.id }),
      listClassSectionsForTeacher(teacher.id),
    ]);

    const managedSectionMap = new Map(
      sectionsResult.managedSections
        .filter((section) => section.status === 'active')
        .map((section) => [section.id, section])
    );

    if (managedSectionMap.size === 0) {
      const schoolSections = await listClassSectionsForSchool(teacher.schoolId);
      for (const section of schoolSections) {
        if (section.status !== 'active') continue;
        const inScope = teacherHasScopeForTarget(teacherSession, {
          classLevel: section.classLevel,
          section: section.section,
        });
        if (!inScope) continue;
        managedSectionMap.set(section.id, section);
      }
    }

    const managedSections = [...managedSectionMap.values()];

    const managedTimetables = await Promise.all(
      managedSections.slice(0, 5).map((s) =>
        listTimetableSlots({
          schoolId: teacher.schoolId!,
          classLevel: s.classLevel,
          section: s.section,
        }).then((slots) => ({
          section: { id: s.id, classLevel: s.classLevel, section: s.section, batch: s.batch },
          slots,
        }))
      )
    );

    return dataJson({
      requestId,
      data: { personalSlots, managedTimetables },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load timetable.';
    return errorJson({ requestId, errorCode: 'teacher-timetable-read-failed', message, status: 500 });
  }
}
