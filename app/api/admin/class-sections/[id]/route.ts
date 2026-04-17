import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { updateClassSectionSchema } from '@/lib/schemas/admin-management';
import { updateClassSection } from '@/lib/school-management-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

function readString(value: unknown, max = 120): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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
  const classSectionId = params.id?.trim();
  if (!classSectionId) {
    return errorJson({
      requestId,
      errorCode: 'missing-class-section-id',
      message: 'Class section id is required.',
      status: 400,
    });
  }

  const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, updateClassSectionSchema);
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
  const patch: {
    section?: string;
    batch?: string;
    notes?: string;
    status?: 'active' | 'inactive' | 'archived';
    classTeacherId?: string | null;
  } = {};
  if (typeof body.section === 'string') patch.section = readString(body.section, 40);
  if (typeof body.batch === 'string') patch.batch = readString(body.batch, 40);
  if (typeof body.notes === 'string') patch.notes = readString(body.notes, 600);
  if (body.status === 'active' || body.status === 'inactive' || body.status === 'archived') {
    patch.status = body.status;
  }
  if (body.classTeacherId !== undefined) {
    patch.classTeacherId = typeof body.classTeacherId === 'string' && body.classTeacherId.trim()
      ? readString(body.classTeacherId, 90)
      : null;
  }

  try {
    const updated = await updateClassSection(classSectionId, schoolId, patch);
    if (!updated) {
      return errorJson({
        requestId,
        errorCode: 'class-section-not-found',
        message: 'Class section not found.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/class-sections/[id]',
      action: 'admin-update-class-section',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId,
      metadata: {
        classSectionId,
        fields: Object.keys(patch),
        committedAt,
      },
    });
    return dataJson({
      requestId,
      data: { classSection: updated },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update class section.';
    const status = /required|valid|section/i.test(message) ? 400 : 500;
    return errorJson({
      requestId,
      errorCode: 'admin-update-class-section-failed',
      message,
      status,
    });
  }
}
