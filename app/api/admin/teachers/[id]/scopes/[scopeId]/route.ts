import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { deleteTeacherScope, getTeacherById } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: { id: string; scopeId: string } }) {
  const requestId = getRequestId(_req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  const teacherId = params.id?.trim();
  const scopeId = params.scopeId?.trim();
  if (!teacherId || !scopeId) {
    return errorJson({
      requestId,
      errorCode: 'missing-scope-identifiers',
      message: 'teacher id and scope id are required.',
      status: 400,
    });
  }
  try {
    await assertTeacherStorageWritable();
    const teacher = await getTeacherById(teacherId, adminSession.role === 'admin' ? adminSession.schoolId : undefined);
    if (!teacher) {
      return errorJson({
        requestId,
        errorCode: 'teacher-not-found',
        message: 'Teacher not found.',
        status: 404,
      });
    }
    const ok = await deleteTeacherScope(teacherId, scopeId);
    if (!ok) {
      return errorJson({
        requestId,
        errorCode: 'scope-not-found',
        message: 'Scope not found.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/teachers/[id]/scopes/[scopeId]',
      action: 'admin-delete-teacher-scope',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId: adminSession.schoolId,
      metadata: { teacherId, scopeId, committedAt },
    });
    return dataJson({
      requestId,
      data: { ok: true },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove scope.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'delete-teacher-scope-failed',
      message,
      status,
    });
  }
}

