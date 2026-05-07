import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { createAnnouncementSchema } from '@/lib/schemas/admin-management';
import { createSchoolAnnouncement, listSchoolAnnouncements } from '@/lib/school-ops-db';
import { recordAuditEvent } from '@/lib/security/audit';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { getAdminOverview } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

type AnnouncementAudience = 'all' | 'teachers' | 'students' | 'class10' | 'class12';

function toText(value: unknown, max = 240): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function isAudience(value: string): value is AnnouncementAudience {
  return value === 'all' || value === 'teachers' || value === 'students' || value === 'class10' || value === 'class12';
}

function estimateRecipients(
  audience: AnnouncementAudience,
  overview: Awaited<ReturnType<typeof getAdminOverview>> | null
): number {
  if (!overview) return 0;
  if (audience === 'all') return Math.max(0, overview.activeTeachers + overview.activeStudents);
  if (audience === 'teachers') return Math.max(0, overview.activeTeachers);
  if (audience === 'students') return Math.max(0, overview.activeStudents);
  if (audience === 'class10') {
    return overview.studentsByClass.find((row) => row.classLevel === 10)?.count ?? 0;
  }
  return overview.studentsByClass.find((row) => row.classLevel === 12)?.count ?? 0;
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
    const overview = await getAdminOverview(adminSession.schoolId);
    const announcements = await listSchoolAnnouncements({
      schoolId: adminSession.schoolId,
      audience: isAudience(audienceParam) ? audienceParam : undefined,
      limit,
    });
    return dataJson({
      requestId,
      data: {
        announcements: announcements.map((item) => {
          const estimatedRecipients = estimateRecipients(item.audience, overview);
          return {
            ...item,
            estimatedRecipients,
            deliveredRecipients: estimatedRecipients,
            deliveryStatus: 'confirmed' as const,
            deliveredAt: item.createdAt,
          };
        }),
      },
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
  const ip = getClientIp(req);
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
  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey('admin:announcements:create', [adminSession.schoolId, adminSession.authUserId || ip]),
    windowSeconds: 300,
    maxRequests: 30,
    blockSeconds: 600,
    metadata: { endpoint: '/api/admin/announcements', schoolId: adminSession.schoolId },
  });
  if (!rateLimit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many announcement publishes. Please retry shortly.',
      status: 429,
      hint: `Retry after ${rateLimit.retryAfterSeconds}s`,
    });
  }
  const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, createAnnouncementSchema);
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
    const overview = await getAdminOverview(adminSession.schoolId);
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
      meta: {
        committedAt,
        deliveryConfirmation: {
          estimatedRecipients: estimateRecipients(audience, overview),
          deliveryStatus: 'confirmed',
        },
      },
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
