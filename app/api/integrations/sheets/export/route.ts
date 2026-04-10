export const dynamic = 'force-dynamic';
import { getAdminSessionFromRequestCookies, getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
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

    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 24 * 1024);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
      });
    }
    const body = bodyResult.value;
    const packId = typeof body?.packId === 'string' ? body.packId.trim() : '';
    if (!packId) {
      return errorJson({
        requestId,
        errorCode: 'missing-pack-id',
        message: 'packId is required.',
        status: 400,
      });
    }

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
