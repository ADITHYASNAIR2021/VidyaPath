import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { bodyReasonToStatus, parseAndValidateJsonBody } from '@/lib/http/request-body';
import { reviewControlsSchema } from '@/lib/schemas/teacher-pack';
import { canTeacherAccessAssignmentPack, getAssignmentPack, upsertAssignmentPack } from '@/lib/teacher-admin-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

function normalizeQuestionNo(value: string): string {
  const clean = String(value || '').trim().toUpperCase();
  if (!clean) return '';
  const numeric = Number(clean.replace(/[^0-9]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return `Q${Math.round(numeric)}`;
}

function normalizeQuestionNoSet(values: string[] | undefined): Set<string> {
  return new Set((values ?? []).map((value) => normalizeQuestionNo(value)).filter(Boolean));
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

  const bodyResult = await parseAndValidateJsonBody(req, 24 * 1024, reviewControlsSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  if (bodyResult.value.packId && bodyResult.value.packId !== packId) {
    return errorJson({
      requestId,
      errorCode: 'pack-id-mismatch',
      message: 'Path pack id and body packId must match.',
      status: 409,
    });
  }

  const canAccess = await canTeacherAccessAssignmentPack(session.teacher.id, packId);
  if (!canAccess) {
    return errorJson({
      requestId,
      errorCode: 'forbidden',
      message: 'You do not own this assignment pack.',
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

  const lockSet = normalizeQuestionNoSet(bodyResult.value.lockQuestionNos);
  const unlockSet = normalizeQuestionNoSet(bodyResult.value.unlockQuestionNos);
  const weakSet = normalizeQuestionNoSet(bodyResult.value.weakQuestionNos);
  const clearWeakSet = normalizeQuestionNoSet(bodyResult.value.clearWeakQuestionNos);

  const nextMeta = { ...(pack.questionMeta ?? {}) };
  const touched = new Set<string>([...lockSet, ...unlockSet, ...weakSet, ...clearWeakSet]);
  for (const questionNo of touched) {
    const prev = nextMeta[questionNo] ?? { maxMarks: 1 };
    const next = { ...prev };
    if (lockSet.has(questionNo)) next.locked = true;
    if (unlockSet.has(questionNo)) next.locked = false;
    if (weakSet.has(questionNo)) {
      next.weakSignal = true;
      next.quality = 'weak';
    }
    if (clearWeakSet.has(questionNo)) {
      next.weakSignal = false;
      if (next.quality === 'weak') next.quality = 'needs-review';
    }
    nextMeta[questionNo] = next;
  }

  const updated = await upsertAssignmentPack(session.teacher.id, {
    ...pack,
    packId,
    section: pack.section,
    status: pack.status,
    questionMeta: nextMeta,
  });

  const committedAt = new Date().toISOString();
  await recordAuditEvent({
    requestId,
    endpoint: '/api/teacher/assignment-pack/[id]/review-controls',
    action: 'teacher-review-controls-updated',
    statusCode: 200,
    actorRole: 'teacher',
    metadata: {
      teacherId: session.teacher.id,
      packId,
      committedAt,
      lockCount: lockSet.size,
      unlockCount: unlockSet.size,
      weakCount: weakSet.size,
      clearWeakCount: clearWeakSet.size,
    },
  });

  return dataJson({
    requestId,
    data: { pack: updated },
    meta: { committedAt },
  });
}
