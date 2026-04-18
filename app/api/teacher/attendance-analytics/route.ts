import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listClassSectionsForTeacher } from '@/lib/school-management-db';
import { listStudentsBySection, listAttendanceBySectionRange } from '@/lib/school-ops-db';

export const dynamic = 'force-dynamic';

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

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
    const sectionsResult = await listClassSectionsForTeacher(teacher.id);
    const managedSection = sectionsResult.managedSections.find(
      (s) => s.classTeacherId === teacher.id && s.status === 'active'
    );

    if (!managedSection) {
      return dataJson({ requestId, data: { section: null, students: [], summary: null, fromDate: null, toDate: null, totalDays: 0 } });
    }

    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const fromDate = toIsoDate(thirtyDaysAgo);
    const toDate = toIsoDate(today);

    const [roster, attendanceRecords] = await Promise.all([
      listStudentsBySection({
        schoolId: teacher.schoolId,
        classLevel: managedSection.classLevel,
        section: managedSection.section,
        batch: managedSection.batch,
      }),
      listAttendanceBySectionRange({
        schoolId: teacher.schoolId,
        classLevel: managedSection.classLevel,
        section: managedSection.section,
        fromDate,
        toDate,
      }),
    ]);

    const statsMap = new Map<string, { present: number; absent: number; late: number; excused: number }>();
    for (const student of roster) {
      statsMap.set(student.id, { present: 0, absent: 0, late: 0, excused: 0 });
    }
    for (const record of attendanceRecords) {
      const s = statsMap.get(record.studentId);
      if (!s) continue;
      if (record.status === 'present') s.present += 1;
      else if (record.status === 'absent') s.absent += 1;
      else if (record.status === 'late') s.late += 1;
      else if (record.status === 'excused') s.excused += 1;
    }

    const totalDays = new Set(attendanceRecords.map((r) => r.date)).size;

    const students = roster.map((student) => {
      const stats = statsMap.get(student.id) ?? { present: 0, absent: 0, late: 0, excused: 0 };
      const total = stats.present + stats.absent + stats.late + stats.excused;
      const percentage = total > 0
        ? Math.round(((stats.present + stats.late * 0.5 + stats.excused * 0.5) / total) * 10000) / 100
        : null;
      return {
        id: student.id,
        name: student.name,
        rollNo: student.rollNo ?? student.rollCode,
        present: stats.present,
        absent: stats.absent,
        late: stats.late,
        excused: stats.excused,
        totalMarked: total,
        percentage,
        isAtRisk: percentage !== null && percentage < 75,
      };
    }).sort((a, b) => {
      if (a.percentage === null && b.percentage === null) return 0;
      if (a.percentage === null) return 1;
      if (b.percentage === null) return -1;
      return a.percentage - b.percentage;
    });

    const scored = students.filter((s) => s.percentage !== null);
    const avgPercentage = scored.length > 0
      ? Math.round((scored.reduce((sum, s) => sum + (s.percentage ?? 0), 0) / scored.length) * 100) / 100
      : null;

    return dataJson({
      requestId,
      data: {
        section: {
          id: managedSection.id,
          classLevel: managedSection.classLevel,
          section: managedSection.section,
          batch: managedSection.batch,
        },
        fromDate,
        toDate,
        totalDays,
        students,
        summary: { total: roster.length, atRisk: students.filter((s) => s.isAtRisk).length, avgPercentage },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load attendance analytics.';
    return errorJson({ requestId, errorCode: 'teacher-attendance-analytics-failed', message, status: 500 });
  }
}
