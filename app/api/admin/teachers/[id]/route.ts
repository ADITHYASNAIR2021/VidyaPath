import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { updateTeacherSchema } from '@/lib/schemas/admin-management';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import { updateTeacher } from '@/lib/teacher/auth.db';

export const dynamic = 'force-dynamic';

interface PatchTeacherRequest {
  phone?: string;
  name?: string;
  status?: 'active' | 'inactive';
}

function parsePatch(value: unknown): PatchTeacherRequest | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const output: PatchTeacherRequest = {};
  if (typeof body.phone === 'string') output.phone = body.phone.trim();
  if (typeof body.name === 'string') output.name = body.name.trim();
  if (body.status === 'active' || body.status === 'inactive') output.status = body.status;
  if (!output.phone && !output.name && !output.status) return null;
  return output;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  const teacherId = params.id?.trim();
  if (!teacherId) {
    return errorJson({
      requestId,
      errorCode: 'missing-teacher-id',
      message: 'Teacher id is required.',
      status: 400,
    });
  }

  const bodyResult = await parseAndValidateJsonBody(req, 64 * 1024, updateTeacherSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  const parsed = parsePatch(bodyResult.value);
  if (!parsed) {
    return errorJson({
      requestId,
      errorCode: 'invalid-patch-payload',
      message: 'Invalid patch payload.',
      status: 400,
    });
  }

  try {
    await assertTeacherStorageWritable();
    const teacher = await updateTeacher(teacherId, parsed, adminSession.role === 'admin' ? adminSession.schoolId : undefined);
    if (!teacher) {
      return errorJson({
        requestId,
        errorCode: 'teacher-not-found',
        message: 'Teacher not found.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/teachers/[id]',
      action: 'admin-update-teacher',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId: adminSession.schoolId,
      metadata: { teacherId, committedAt, fields: Object.keys(parsed) },
    });
    return dataJson({
      requestId,
      data: { teacher },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update teacher.';
    const status = /required|valid|phone|name/i.test(message)
      ? 400
      : /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message)
        ? 503
        : 500;
    return errorJson({
      requestId,
      errorCode: 'update-teacher-failed',
      message,
      status,
    });
  }
}
