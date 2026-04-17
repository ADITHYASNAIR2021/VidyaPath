import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { z } from 'zod';
const calendarEventBodySchema = z.object({
  title: z.string().trim().min(1).max(180),
  type: z.enum(['exam', 'assignment_due', 'holiday', 'meeting', 'other']),
  eventDate: z.string().trim().min(1).max(20),
  description: z.string().trim().max(1200).optional(),
  classLevel: z.union([z.literal(10), z.literal(12)]).optional(),
  section: z.string().trim().max(40).optional(),
});
import { createSchoolEvent, deleteSchoolEvent, listSchoolEvents } from '@/lib/school-ops-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

type EventType = 'exam' | 'assignment_due' | 'holiday' | 'meeting' | 'other';

function toClassLevel(value: unknown): 10 | 12 | undefined {
  const parsed = Number(value);
  if (parsed === 10 || parsed === 12) return parsed;
  return undefined;
}

function toText(value: unknown, max = 220): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function isEventType(value: string): value is EventType {
  return value === 'exam' || value === 'assignment_due' || value === 'holiday' || value === 'meeting' || value === 'other';
}

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
  const url = new URL(req.url);
  const classLevel = toClassLevel(url.searchParams.get('classLevel'));
  const section = toText(url.searchParams.get('section'), 40).toUpperCase();
  const fromDate = toText(url.searchParams.get('fromDate'), 20);
  const toDate = toText(url.searchParams.get('toDate'), 20);
  const limit = Number(url.searchParams.get('limit') || 300);

  try {
    const events = await listSchoolEvents({
      schoolId: teacherSession.teacher.schoolId,
      classLevel,
      section: section || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit,
    });
    return dataJson({
      requestId,
      data: { events },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load events.';
    return errorJson({
      requestId,
      errorCode: 'teacher-calendar-read-failed',
      message,
      status: 500,
    });
  }
}

export async function POST(req: Request) {
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
  const bodyResult = await parseAndValidateJsonBody(req, 96 * 1024, calendarEventBodySchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  const { title, type, eventDate, description = '', classLevel, section: rawSection } = bodyResult.value;
  const section = rawSection?.toUpperCase() ?? '';
  if (!title || !eventDate || !type) {
    return errorJson({
      requestId,
      errorCode: 'invalid-event-payload',
      message: 'title, eventDate, and valid type are required.',
      status: 400,
    });
  }

  try {
    const event = await createSchoolEvent({
      schoolId: teacherSession.teacher.schoolId,
      title,
      description: description || undefined,
      type,
      eventDate,
      classLevel,
      section: section || undefined,
      createdBy: `teacher:${teacherSession.teacher.id}`,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/calendar',
      action: 'teacher-calendar-event-created',
      statusCode: 200,
      actorRole: 'teacher',
      schoolId: teacherSession.teacher.schoolId,
      metadata: { eventId: event.id, type: event.type, eventDate: event.eventDate, committedAt },
    });
    return dataJson({
      requestId,
      data: { event },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create event.';
    return errorJson({
      requestId,
      errorCode: 'teacher-calendar-create-failed',
      message,
      status: 500,
    });
  }
}

export async function DELETE(req: Request) {
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
  const url = new URL(req.url);
  const eventId = toText(url.searchParams.get('id'), 90);
  if (!eventId) {
    return errorJson({
      requestId,
      errorCode: 'missing-event-id',
      message: 'Event id is required.',
      status: 400,
    });
  }
  try {
    const deleted = await deleteSchoolEvent({
      eventId,
      schoolId: teacherSession.teacher.schoolId,
    });
    if (!deleted) {
      return errorJson({
        requestId,
        errorCode: 'event-not-found',
        message: 'Event not found.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/calendar',
      action: 'teacher-calendar-event-deleted',
      statusCode: 200,
      actorRole: 'teacher',
      schoolId: teacherSession.teacher.schoolId,
      metadata: { eventId, committedAt },
    });
    return dataJson({
      requestId,
      data: { deleted: true, eventId },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete event.';
    return errorJson({
      requestId,
      errorCode: 'teacher-calendar-delete-failed',
      message,
      status: 500,
    });
  }
}

