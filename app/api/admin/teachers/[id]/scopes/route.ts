import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { updateTeacherScopesSchema } from '@/lib/schemas/admin-management';
import { isSubjectInCatalog } from '@/lib/subject-catalog-db';
import { addTeacherScope, getTeacherById } from '@/lib/teacher/auth.db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import type { TeacherScope } from '@/lib/teacher-types';

export const dynamic = 'force-dynamic';

interface ScopeRequest {
  classLevel: 10 | 12;
  subject: TeacherScope['subject'];
  section?: string;
}

function parseScope(value: unknown): ScopeRequest | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const classLevel = Number(body.classLevel);
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const section = typeof body.section === 'string' ? body.section.trim() : undefined;
  if ((classLevel !== 10 && classLevel !== 12) || !subject) return null;
  return {
    classLevel: classLevel as 10 | 12,
    subject: subject as TeacherScope['subject'],
    section,
  };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
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
  const bodyResult = await parseAndValidateJsonBody(req, 64 * 1024, updateTeacherScopesSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  const parsed = parseScope(bodyResult.value);
  if (!parsed) {
    return errorJson({
      requestId,
      errorCode: 'invalid-scope-payload',
      message: 'Invalid scope payload.',
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
    const allowed = await isSubjectInCatalog({
      schoolId: teacher.schoolId,
      classLevel: parsed.classLevel,
      subject: parsed.subject,
    });
    if (!allowed) {
      return errorJson({
        requestId,
        errorCode: 'unsupported-teacher-scope-subject',
        message: `Unsupported scope subject for Class ${parsed.classLevel}: ${parsed.subject}.`,
        status: 400,
      });
    }
    const scope = await addTeacherScope(teacherId, parsed);
    if (!scope) {
      return errorJson({
        requestId,
        errorCode: 'scope-create-failed',
        message: 'Failed to create teacher scope.',
        status: 500,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/teachers/[id]/scopes',
      action: 'admin-add-teacher-scope',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId: adminSession.schoolId,
      metadata: { teacherId, scopeId: scope.id, committedAt },
    });
    return dataJson({
      requestId,
      data: { scope },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add scope.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'add-teacher-scope-failed',
      message,
      status,
    });
  }
}
