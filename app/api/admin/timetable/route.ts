import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { upsertTimetableSchema } from '@/lib/schemas/admin-management';
import { listTimetableSlots, replaceTimetableSlots } from '@/lib/school-ops-db';
import { recordAuditEvent } from '@/lib/security/audit';
import { listTeachers } from '@/lib/teacher/auth.db';

export const dynamic = 'force-dynamic';

const DAY_LABEL_TO_NUM: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

function toClassLevel(value: unknown): 10 | 12 | null {
  const parsed = Number(value);
  if (parsed === 10 || parsed === 12) return parsed;
  return null;
}

function toSection(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 40);
}

function toText(value: unknown, max = 220): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function toDayOfWeek(value: unknown): number | null {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 7) {
    return numeric;
  }
  if (typeof value === 'string') {
    const mapped = DAY_LABEL_TO_NUM[value.trim().slice(0, 3).toLowerCase()];
    if (mapped) return mapped;
  }
  return null;
}

function toPeriodNo(value: unknown): number | null {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 20) {
    return numeric;
  }
  return null;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  if (!adminSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'admin-school-missing',
      message: 'Admin school context is required.',
      status: 403,
    });
  }

  const url = new URL(req.url);
  const classLevel = toClassLevel(url.searchParams.get('classLevel'));
  const section = toSection(url.searchParams.get('section'));
  if (!classLevel || !section) {
    return errorJson({
      requestId,
      errorCode: 'missing-timetable-scope',
      message: 'classLevel and section are required.',
      status: 400,
    });
  }

  try {
    const [slots, teachers] = await Promise.all([
      listTimetableSlots({
        schoolId: adminSession.schoolId,
        classLevel,
        section,
      }),
      listTeachers(adminSession.schoolId),
    ]);
    return dataJson({
      requestId,
      data: {
        classLevel,
        section,
        slots,
        teachers: teachers.map((teacher) => ({
          id: teacher.id,
          name: teacher.name,
          status: teacher.status,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load timetable.';
    return errorJson({
      requestId,
      errorCode: 'admin-timetable-read-failed',
      message,
      status: 500,
    });
  }
}

export async function PUT(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  if (!adminSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'admin-school-missing',
      message: 'Admin school context is required.',
      status: 403,
    });
  }
  const bodyResult = await parseAndValidateJsonBody(req, 64 * 1024, upsertTimetableSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  const body = bodyResult.value;
  const classLevel = toClassLevel(body.classLevel);
  const section = toSection(body.section);
  const slotsRaw = Array.isArray(body.slots) && body.slots.length > 0
    ? body.slots
    : (Array.isArray(body.periods) ? body.periods : []);
  if (!classLevel || !section || slotsRaw.length === 0) {
    return errorJson({
      requestId,
      errorCode: 'invalid-timetable-payload',
      message: 'classLevel, section, and at least one slot are required.',
      status: 400,
    });
  }

  const slots = slotsRaw
    .map((item: unknown) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const dayOfWeek = toDayOfWeek(row.dayOfWeek ?? row.day);
      const periodNo = toPeriodNo(row.periodNo ?? row.slot);
      const subject = toText(row.subject, 120);
      const teacherId = toText(row.teacherId, 90);
      const startTime = toText(row.startTime, 16);
      const endTime = toText(row.endTime, 16);
      if (!dayOfWeek || !periodNo || !subject) return null;
      return {
        dayOfWeek,
        periodNo,
        subject,
        teacherId: teacherId || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
      };
    })
    .filter((item: unknown): item is NonNullable<typeof item & object> => !!item) as Array<{
      dayOfWeek: number; periodNo: number; subject: string;
      teacherId?: string; startTime?: string; endTime?: string;
    }>;

  if (slots.length === 0) {
    return errorJson({
      requestId,
      errorCode: 'invalid-timetable-slots',
      message: 'No valid timetable slots found in payload.',
      status: 400,
    });
  }

  try {
    const result = await replaceTimetableSlots({
      schoolId: adminSession.schoolId,
      classLevel,
      section,
      slots,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/timetable',
      action: 'admin-timetable-replaced',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId: adminSession.schoolId,
      metadata: {
        classLevel,
        section,
        inserted: result.inserted,
        committedAt,
      },
    });
    return dataJson({
      requestId,
      data: { classLevel, section, inserted: result.inserted },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update timetable.';
    return errorJson({
      requestId,
      errorCode: 'admin-timetable-write-failed',
      message,
      status: 500,
    });
  }
}
