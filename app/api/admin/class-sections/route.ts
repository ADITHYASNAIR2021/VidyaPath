import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { createClassSection, listClassSectionsForSchool } from '@/lib/school-management-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

function readString(value: unknown, max = 120): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  const schoolId = adminSession.schoolId;
  if (!schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-scope',
      message: 'School scope missing for admin session.',
      status: 400,
    });
  }
  try {
    const sections = await listClassSectionsForSchool(schoolId);
    return dataJson({
      requestId,
      data: { sections },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load class sections.';
    return errorJson({
      requestId,
      errorCode: 'admin-class-sections-read-failed',
      message,
      status: 500,
    });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  const schoolId = adminSession.schoolId;
  if (!schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-scope',
      message: 'School scope missing for admin session.',
      status: 400,
    });
  }

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 48 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }
  const body = bodyResult.value;
  const classLevel = Number(body.classLevel);
  const section = readString(body.section, 40);
  const batch = readString(body.batch, 40);
  const notes = readString(body.notes, 600);
  const classTeacherId = readString(body.classTeacherId, 90);
  if ((classLevel !== 10 && classLevel !== 12) || !section) {
    return errorJson({
      requestId,
      errorCode: 'invalid-class-section-payload',
      message: 'Required fields: classLevel(10|12), section.',
      status: 400,
    });
  }

  try {
    const created = await createClassSection({
      schoolId,
      classLevel: classLevel as 10 | 12,
      section,
      batch: batch || undefined,
      notes: notes || undefined,
      classTeacherId: classTeacherId || undefined,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/class-sections',
      action: 'admin-create-class-section',
      statusCode: 201,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId,
      metadata: {
        classSectionId: created.id,
        classLevel: created.classLevel,
        section: created.section,
        batch: created.batch,
        committedAt,
      },
    });
    return dataJson({
      requestId,
      status: 201,
      data: { classSection: created },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create class section.';
    const status = /required|valid|classlevel|section/i.test(message) ? 400 : 500;
    return errorJson({
      requestId,
      errorCode: 'admin-create-class-section-failed',
      message,
      status,
    });
  }
}
