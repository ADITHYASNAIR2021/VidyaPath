import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { listClassSectionsForTeacher } from '@/lib/school-management-db';
import { listAttendanceBySection, listStudentsBySection, markAttendanceBulk } from '@/lib/school-ops-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

function toIsoDate(value?: string): string {
  if (value) {
    const clean = value.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  }
  return new Date().toISOString().slice(0, 10);
}

function toClassLevel(value: unknown): 10 | 12 | null {
  const parsed = Number(value);
  if (parsed === 10 || parsed === 12) return parsed;
  return null;
}

function toSection(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 40);
}

async function resolveManagedSection(input: {
  teacherId: string;
  classLevel?: 10 | 12 | null;
  section?: string;
}) {
  const managed = await listClassSectionsForTeacher(input.teacherId);
  const owned = managed.managedSections.filter((item) => item.classTeacherId === input.teacherId && item.status === 'active');
  if (owned.length === 0) return null;
  if (input.classLevel && input.section) {
    const matched = owned.find((item) => item.classLevel === input.classLevel && item.section === input.section);
    return matched ?? null;
  }
  return owned[0] ?? null;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);

  const url = new URL(req.url);
  const classLevel = toClassLevel(url.searchParams.get('classLevel'));
  const section = toSection(url.searchParams.get('section'));
  const date = toIsoDate(url.searchParams.get('date') ?? undefined);

  try {
    const managedSection = await resolveManagedSection({
      teacherId: teacherSession.teacher.id,
      classLevel,
      section,
    });
    if (!managedSection) {
      return errorJson({
        requestId,
        errorCode: 'class-section-not-managed',
        message: 'No managed class section found for attendance.',
        status: 403,
      });
    }
    const [roster, attendance] = await Promise.all([
      listStudentsBySection({
        schoolId: managedSection.schoolId,
        classLevel: managedSection.classLevel,
        section: managedSection.section,
        batch: managedSection.batch,
      }),
      listAttendanceBySection({
        schoolId: managedSection.schoolId,
        classLevel: managedSection.classLevel,
        section: managedSection.section,
        date,
      }),
    ]);
    const attendanceMap = new Map(attendance.map((row) => [row.studentId, row]));
    return dataJson({
      requestId,
      data: {
        classSection: managedSection,
        date,
        roster: roster.map((student) => ({
          ...student,
          attendanceStatus: attendanceMap.get(student.id)?.status ?? 'unmarked',
          markedAt: attendanceMap.get(student.id)?.markedAt,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load attendance.';
    return errorJson({
      requestId,
      errorCode: 'teacher-attendance-read-failed',
      message,
      status: 500,
    });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 256 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }

  const body = bodyResult.value;
  const classLevel = toClassLevel(body.classLevel);
  const section = toSection(body.section);
  const date = toIsoDate(typeof body.date === 'string' ? body.date : undefined);
  const recordsRaw = Array.isArray(body.records) ? body.records : [];
  const validStatus = new Set<AttendanceStatus>(['present', 'absent', 'late', 'excused']);
  const records = recordsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const studentId = typeof row.studentId === 'string' ? row.studentId.trim().slice(0, 90) : '';
      const status = typeof row.status === 'string' ? row.status : '';
      if (!studentId || !validStatus.has(status as AttendanceStatus)) return null;
      return { studentId, status: status as AttendanceStatus };
    })
    .filter((item): item is { studentId: string; status: AttendanceStatus } => !!item);

  if (!classLevel || !section || records.length === 0) {
    return errorJson({
      requestId,
      errorCode: 'invalid-attendance-payload',
      message: 'classLevel, section, and at least one valid attendance record are required.',
      status: 400,
    });
  }

  try {
    const managedSection = await resolveManagedSection({
      teacherId: teacherSession.teacher.id,
      classLevel,
      section,
    });
    if (!managedSection) {
      return errorJson({
        requestId,
        errorCode: 'class-section-not-managed',
        message: 'Attendance can only be marked for class sections managed by the teacher.',
        status: 403,
      });
    }
    const result = await markAttendanceBulk({
      schoolId: managedSection.schoolId,
      teacherId: teacherSession.teacher.id,
      classLevel: managedSection.classLevel,
      section: managedSection.section,
      date,
      records,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/attendance',
      action: 'teacher-attendance-marked',
      statusCode: 200,
      actorRole: 'teacher',
      schoolId: managedSection.schoolId,
      metadata: {
        classLevel: managedSection.classLevel,
        section: managedSection.section,
        date,
        records: records.length,
        marked: result.marked,
        updated: result.updated,
        committedAt,
      },
    });
    return dataJson({
      requestId,
      data: { ...result, date, classLevel: managedSection.classLevel, section: managedSection.section },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save attendance.';
    return errorJson({
      requestId,
      errorCode: 'teacher-attendance-write-failed',
      message,
      status: 500,
    });
  }
}

