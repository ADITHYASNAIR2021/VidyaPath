import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import {
  canTeacherAccessAssignmentPack,
  getAssignmentPack,
  upsertAssignmentPack,
  updateAssignmentPackStatus,
} from '@/lib/teacher-admin-db';
import { buildTeacherAssignmentPackDraft, buildTeacherPackUrls, toAnswerKey } from '@/lib/teacher-assignment';
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
    const packId = typeof body.packId === 'string' ? body.packId.trim() : '';
    const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
    const requestedQuestionCount = Number(body.questionCount);
    const requestedDifficultyMix = typeof body.difficultyMix === 'string' ? body.difficultyMix.trim() : '';
    if (!packId) {
      return errorJson({
        requestId,
        errorCode: 'missing-pack-id',
        message: 'packId is required.',
        status: 400,
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

    const canAccess = await canTeacherAccessAssignmentPack(teacherSession.teacher.id, packId);
    if (!canAccess) {
      return errorJson({
        requestId,
        errorCode: 'forbidden',
        message: 'Forbidden.',
        status: 403,
      });
    }

    const draft = await buildTeacherAssignmentPackDraft({
      chapterId: pack.chapterId,
      classLevel: pack.classLevel,
      subject: pack.subject,
      questionCount: Number.isFinite(requestedQuestionCount) ? requestedQuestionCount : pack.questionCount,
      difficultyMix:
        requestedDifficultyMix.length > 0
          ? requestedDifficultyMix
          : pack.difficultyMix,
      includeShortAnswers: pack.includeShortAnswers,
      includeFormulaDrill: pack.includeFormulaDrill,
      dueDate: pack.dueDate,
    });
    const urls = buildTeacherPackUrls(packId);

    await upsertAssignmentPack(teacherSession.teacher.id, {
      ...pack,
      ...draft,
      packId,
      shareUrl: urls.shareUrl,
      printUrl: urls.printUrl,
      answerKey: toAnswerKey(draft.mcqs),
      section: pack.section,
      status: 'review',
      questionMeta: pack.questionMeta,
      feedbackHistory: pack.feedbackHistory,
      approvedAt: undefined,
      approvedByTeacherId: undefined,
      publishedAt: undefined,
    });

    if (feedback) {
      await updateAssignmentPackStatus({
        teacherId: teacherSession.teacher.id,
        packId,
        status: 'review',
        feedback,
      });
    }

    const updated = await getAssignmentPack(packId);
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/assignment-pack/regenerate',
      action: 'teacher-regenerated-pack',
      statusCode: 200,
      actorRole: 'teacher',
      metadata: { teacherId: teacherSession.teacher.id, packId, committedAt, hasFeedback: !!feedback },
    });
    return dataJson({
      requestId,
      data: { pack: updated },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to regenerate assignment pack.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'assignment-pack-regenerate-failed',
      message,
      status,
    });
  }
}
