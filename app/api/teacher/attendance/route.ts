import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { markAttendanceSchema } from '@/lib/schemas/teacher-attendance';
import { listClassSectionsForTeacher } from '@/lib/school-management-db';
import { listAttendanceBySection, listStudentsBySection, markAttendanceBulk } from '@/lib/school-ops-db';
import { recordAuditEvent } from '@/lib/security/audit';
import { teacherHasScopeForTarget } from '@/lib/teacher/scope-guards';
import type { TeacherSession } from '@/lib/teacher-types';

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

interface AttendanceAccessSection {
  id: string;
  schoolId: string;
  classLevel: 10 | 12;
  section: string;
  batch?: string;
}

async function resolveAttendanceReadAccess(input: {
  teacherSession: TeacherSession;
  classLevel?: 10 | 12 | null;
  section?: string;
}): Promise<{ section: AttendanceAccessSection; readonly: boolean } | null> {
  const managed = await listClassSectionsForTeacher(input.teacherSession.teacher.id);
  const activeSections = managed.managedSections.filter((item) => item.status === 'active');
  const owned = activeSections.filter((item) => item.classTeacherId === input.teacherSession.teacher.id);

  if (owned.length > 0) {
    if (input.classLevel && input.section) {
      const matched = owned.find((item) => item.classLevel === input.classLevel && item.section === input.section);
      return matched
        ? {
          section: {
            id: matched.id,
            schoolId: matched.schoolId,
            classLevel: matched.classLevel,
            section: matched.section,
            batch: matched.batch,
          },
          readonly: false,
        }
        : null;
    }
    return owned[0]
      ? {
        section: {
          id: owned[0].id,
          schoolId: owned[0].schoolId,
          classLevel: owned[0].classLevel,
          section: owned[0].section,
          batch: owned[0].batch,
        },
        readonly: false,
      }
      : null;
  }

  const scopedCandidates = activeSections
    .filter((item) => !input.classLevel || item.classLevel === input.classLevel)
    .filter((item) => !input.section || item.section === input.section)
    .filter((item) =>
      teacherHasScopeForTarget(input.teacherSession, {
        classLevel: item.classLevel,
        section: item.section,
      })
    );

  if (scopedCandidates[0]) {
    return {
      section: {
        id: scopedCandidates[0].id,
        schoolId: scopedCandidates[0].schoolId,
        classLevel: scopedCandidates[0].classLevel,
        section: scopedCandidates[0].section,
        batch: scopedCandidates[0].batch,
      },
      readonly: true,
    };
  }

  if (input.classLevel && input.section && input.teacherSession.teacher.schoolId) {
    const hasScope = teacherHasScopeForTarget(input.teacherSession, {
      classLevel: input.classLevel,
      section: input.section,
    });
    if (hasScope) {
      return {
        section: {
          id: `readonly-${input.classLevel}-${input.section}`,
          schoolId: input.teacherSession.teacher.schoolId,
          classLevel: input.classLevel,
          section: input.section,
        },
        readonly: true,
      };
    }
  }

  return null;
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
    const access = await resolveAttendanceReadAccess({
      teacherSession,
      classLevel,
      section,
    });
    if (!access) {
      return errorJson({
        requestId,
        errorCode: 'class-section-not-accessible',
        message: 'No accessible class section found for attendance.',
        status: 403,
      });
    }
    const [roster, attendance] = await Promise.all([
      listStudentsBySection({
        schoolId: access.section.schoolId,
        classLevel: access.section.classLevel,
        section: access.section.section,
        batch: access.section.batch,
      }),
      listAttendanceBySection({
        schoolId: access.section.schoolId,
        classLevel: access.section.classLevel,
        section: access.section.section,
        date,
      }),
    ]);
    const attendanceMap = new Map(attendance.map((row) => [row.studentId, row]));
    return dataJson({
      requestId,
      data: {
        classSection: access.section,
        readonly: access.readonly,
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

  const bodyResult = await parseAndValidateJsonBody(req, 256 * 1024, markAttendanceSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }

  const { classLevel, section, date: dateRaw, records: recordsRaw } = bodyResult.value;
  const date = toIsoDate(dateRaw);
  const validStatus = new Set<AttendanceStatus>(['present', 'absent', 'late', 'excused']);
  const records = recordsRaw
    .map((item) => {
      const studentId = String(item.studentId).trim().slice(0, 90);
      const status = item.status as AttendanceStatus;
      if (!studentId || !validStatus.has(status)) return null;
      return { studentId, status };
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
