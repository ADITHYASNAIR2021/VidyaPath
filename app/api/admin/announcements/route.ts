import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { createSchoolAnnouncement, listSchoolAnnouncements } from '@/lib/school-ops-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

type AnnouncementAudience = 'all' | 'teachers' | 'students' | 'class10' | 'class12';

function toText(value: unknown, max = 240): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function isAudience(value: string): value is AnnouncementAudience {
  return value === 'all' || value === 'teachers' || value === 'students' || value === 'class10' || value === 'class12';
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
  const audienceParam = toText(url.searchParams.get('audience'), 20);
  const limit = Number(url.searchParams.get('limit') || 120);
  try {
    const announcements = await listSchoolAnnouncements({
      schoolId: adminSession.schoolId,
      audience: isAudience(audienceParam) ? audienceParam : undefined,
      limit,
    });
    return dataJson({
      requestId,
      data: { announcements },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load announcements.';
    return errorJson({
      requestId,
      errorCode: 'admin-announcements-read-failed',
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
  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 96 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }
  const body = bodyResult.value;
  const title = toText(body.title, 180);
  const message = toText(body.body, 3000);
  const audienceRaw = toText(body.audience, 20);
  const audience: AnnouncementAudience = isAudience(audienceRaw) ? audienceRaw : 'all';
  if (!title || !message) {
    return errorJson({
      requestId,
      errorCode: 'invalid-announcement-payload',
      message: 'title and body are required.',
      status: 400,
    });
  }
  try {
    const announcement = await createSchoolAnnouncement({
      schoolId: adminSession.schoolId,
      title,
      body: message,
      audience,
      createdByRole: adminSession.role === 'developer' ? 'developer' : 'admin',
      createdByAuthUserId: adminSession.authUserId,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/announcements',
      action: 'admin-announcement-created',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId: adminSession.schoolId,
      metadata: {
        announcementId: announcement.id,
        audience,
        committedAt,
      },
    });
    return dataJson({
      requestId,
      data: { announcement },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create announcement.';
    return errorJson({
      requestId,
      errorCode: 'admin-announcements-create-failed',
      message,
      status: 500,
    });
  }
}

