import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { packIdOnlySchema } from '@/lib/schemas/teacher-pack';
import { updateAssignmentPackStatus } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const teacherSession = await getTeacherSessionFromRequestCookies();
    if (!teacherSession) {
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Unauthorized teacher access.',
        status: 401,
      });
    }
    await assertTeacherStorageWritable();

    const bodyResult = await parseAndValidateJsonBody(req, 16 * 1024, packIdOnlySchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }
    const { packId } = bodyResult.value;

    const pack = await updateAssignmentPackStatus({
      teacherId: teacherSession.teacher.id,
      packId,
      status: 'archived',
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
      endpoint: '/api/teacher/assignment-pack/archive',
      action: 'teacher-archived-pack',
      statusCode: 200,
      actorRole: 'teacher',
      metadata: { teacherId: teacherSession.teacher.id, packId, committedAt },
    });
    return dataJson({
      requestId,
      data: { pack },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to archive assignment pack.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'assignment-pack-archive-failed',
      message,
      status,
    });
  }
}
