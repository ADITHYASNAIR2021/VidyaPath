export const dynamic = 'force-dynamic';
import { getAdminSessionFromRequestCookies, getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { sheetsExportSchema } from '@/lib/schemas/sheets-integration';
import { canTeacherAccessAssignmentPack, getAssignmentPack, getTeacherSubmissionSummary } from '@/lib/teacher-admin-db';
import { exportToSheets } from '@/lib/sheets-bridge';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const admin = await getAdminSessionFromRequestCookies();
    const teacher = await getTeacherSessionFromRequestCookies();
    if (!admin && !teacher) {
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Unauthorized access.',
        status: 401,
      });
    }

    const bodyResult = await parseAndValidateJsonBody(req, 24 * 1024, sheetsExportSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }
    const { packId = '' } = bodyResult.value;

    if (teacher && !(await canTeacherAccessAssignmentPack(teacher.teacher.id, packId))) {
      return errorJson({
        requestId,
        errorCode: 'forbidden-pack-access',
        message: 'Forbidden pack access.',
        status: 403,
      });
    }

    const pack = await getAssignmentPack(packId);
    if (!pack) {
      return errorJson({
        requestId,
        errorCode: 'assignment-pack-not-found',
        message: 'Assignment pack not found.',
        status: 404,
      });
    }

    const summary = teacher
      ? await getTeacherSubmissionSummary(teacher.teacher.id, packId)
      : null;

    const payload = {
      exportedAt: new Date().toISOString(),
      pack,
      summary,
    };
    const result = await exportToSheets(payload);

    return dataJson({ requestId, data: { ok: true, result } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sheets export failed.';
    return errorJson({
      requestId,
      errorCode: 'sheets-export-failed',
      message,
      status: 500,
    });
  }
}
