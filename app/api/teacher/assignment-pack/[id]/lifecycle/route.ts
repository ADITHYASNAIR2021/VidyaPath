import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { packLifecycleSchema } from '@/lib/schemas/teacher-pack';
import { updateAssignmentPackLifecycle } from '@/lib/teacher-admin-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

function normalizeDateInput(value?: string): string | undefined {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Unauthorized teacher access.', requestId);
  const packId = params.id?.trim();
  if (!packId) {
    return errorJson({
      requestId,
      errorCode: 'missing-pack-id',
      message: 'Assignment pack id is required.',
      status: 400,
    });
  }
  const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, packLifecycleSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  const { action, validUntil, extendDays, packId: bodyPackId } = bodyResult.value;
  if (bodyPackId && bodyPackId !== packId) {
    return errorJson({
      requestId,
      errorCode: 'pack-id-mismatch',
      message: 'Path pack id and body packId must match.',
      status: 409,
    });
  }
  const normalizedValidUntil = normalizeDateInput(validUntil);
  const normalizedExtendDays = Number.isFinite(extendDays)
    ? Math.max(1, Math.min(120, Math.round(Number(extendDays))))
    : undefined;
  try {
    const pack = await updateAssignmentPackLifecycle({
      teacherId: session.teacher.id,
      packId,
      action,
      extendDays: action === 'extend' ? normalizedExtendDays : undefined,
      validUntil: action === 'extend' ? normalizedValidUntil : undefined,
    });
    if (!pack) {
      return errorJson({
        requestId,
        errorCode: 'assignment-pack-not-found',
        message: 'Assignment pack not found.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/assignment-pack/[id]/lifecycle',
      action: `teacher-assignment-lifecycle-${action}`,
      statusCode: 200,
      actorRole: 'teacher',
      metadata: {
        teacherId: session.teacher.id,
        packId,
        action,
        extendDays: action === 'extend' ? normalizedExtendDays : undefined,
        validUntil: action === 'extend' ? normalizedValidUntil : undefined,
        committedAt,
      },
    });
    return dataJson({
      requestId,
      data: { pack },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update assignment lifecycle.';
    const status = /already|only for published|cannot/i.test(message)
      ? 409
      : /required|valid|action|extend/i.test(message)
        ? 400
        : 500;
    return errorJson({
      requestId,
      errorCode: 'teacher-assignment-lifecycle-failed',
      message,
      status,
    });
  }
}
