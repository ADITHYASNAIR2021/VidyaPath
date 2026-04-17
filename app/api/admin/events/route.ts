import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { createSchoolEventSchema } from '@/lib/schemas/admin-management';
import { createSchoolEvent, deleteSchoolEvent, listSchoolEvents } from '@/lib/school-ops-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

type EventType = 'exam' | 'assignment_due' | 'holiday' | 'meeting' | 'other';

function toText(value: unknown, max = 240): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function toClassLevel(value: unknown): 10 | 12 | undefined {
  const parsed = Number(value);
  if (parsed === 10 || parsed === 12) return parsed;
  return undefined;
}

function isEventType(value: string): value is EventType {
  return value === 'exam' || value === 'assignment_due' || value === 'holiday' || value === 'meeting' || value === 'other';
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
  const section = toText(url.searchParams.get('section'), 40).toUpperCase();
  const fromDate = toText(url.searchParams.get('fromDate'), 20);
  const toDate = toText(url.searchParams.get('toDate'), 20);
  const limit = Number(url.searchParams.get('limit') || 300);
  try {
    const events = await listSchoolEvents({
      schoolId: adminSession.schoolId,
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
      errorCode: 'admin-events-read-failed',
      message,
      status: 500,
    });
  }
}

export async function POST(req: Request) {
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
  const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, createSchoolEventSchema);
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
  const title = toText(body.title, 180);
  const description = toText(body.description, 1200);
  const type = toText(body.type, 32);
  const eventDate = toText(body.eventDate, 20);
  const classLevel = toClassLevel(body.classLevel);
  const section = toText(body.section, 40).toUpperCase();
  if (!title || !eventDate || !isEventType(type)) {
    return errorJson({
      requestId,
      errorCode: 'invalid-event-payload',
      message: 'title, eventDate, and valid type are required.',
      status: 400,
    });
  }

  try {
    const event = await createSchoolEvent({
      schoolId: adminSession.schoolId,
      title,
      description: description || undefined,
      type,
      eventDate,
      classLevel,
      section: section || undefined,
      createdBy: `admin:${adminSession.authUserId || 'session'}`,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/events',
      action: 'admin-event-created',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId: adminSession.schoolId,
      metadata: { eventId: event.id, type, eventDate, committedAt },
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
      errorCode: 'admin-events-create-failed',
      message,
      status: 500,
    });
  }
}

export async function DELETE(req: Request) {
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
    const deleted = await deleteSchoolEvent({ eventId, schoolId: adminSession.schoolId });
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
      endpoint: '/api/admin/events',
      action: 'admin-event-deleted',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId: adminSession.schoolId,
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
      errorCode: 'admin-events-delete-failed',
      message,
      status: 500,
    });
  }
}

