import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { editQuestionsSchema } from '@/lib/schemas/teacher-pack';
import { getAssignmentPack, canTeacherAccessAssignmentPack, upsertAssignmentPack } from '@/lib/teacher-admin-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Unauthorized teacher access.', requestId);

  const packId = params.id?.trim();
  if (!packId) {
    return errorJson({ requestId, errorCode: 'missing-pack-id', message: 'Pack id is required.', status: 400 });
  }

  const canAccess = await canTeacherAccessAssignmentPack(session.teacher.id, packId);
  if (!canAccess) {
    return errorJson({ requestId, errorCode: 'forbidden', message: 'You do not own this pack.', status: 403 });
  }

  const bodyResult = await parseAndValidateJsonBody(req, 256 * 1024, editQuestionsSchema);
  if (!bodyResult.ok) {
    return errorJson({ requestId, errorCode: bodyResult.reason, message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason), issues: bodyResult.issues });
  }
  const { questions: sanitised } = bodyResult.value;
  const existing = await getAssignmentPack(packId);
  if (!existing) {
    return errorJson({ requestId, errorCode: 'not-found', message: 'Assignment pack not found.', status: 404 });
  }

  // Only allow edits on draft packs
  if (existing.status !== 'draft') {
    return errorJson({ requestId, errorCode: 'not-editable', message: 'Only draft packs can be edited. Regenerate to get a new draft.', status: 409 });
  }

  // Map schema shape → MCQItem shape expected by upsertAssignmentPack
  const mcqs = sanitised.map((q) => ({
    question: q.prompt,
    options: q.options ?? [],
    answer: q.answerIndex ?? 0,
    explanation: q.rubric ?? '',
    maxMarks: q.maxMarks,
    kind: q.kind,
  }));

  const updatedPack = await upsertAssignmentPack(session.teacher.id, {
    ...existing,
    mcqs,
  });

  await recordAuditEvent({
    requestId,
    endpoint: '/api/teacher/assignment-pack/[id]/edit-questions',
    action: 'teacher-edited-questions',
    statusCode: 200,
    actorRole: 'teacher',
    metadata: { teacherId: session.teacher.id, packId, questionCount: sanitised.length },
  });

  return dataJson({ requestId, data: { pack: updatedPack } });
}
