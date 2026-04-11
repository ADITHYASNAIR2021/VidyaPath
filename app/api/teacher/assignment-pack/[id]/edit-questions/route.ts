import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
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

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 256 * 1024);
  if (!bodyResult.ok) {
    return errorJson({ requestId, errorCode: bodyResult.reason, message: bodyResult.message, status: bodyResult.reason === 'payload-too-large' ? 413 : 400 });
  }

  const { mcqs } = bodyResult.value as { mcqs?: unknown };
  if (!Array.isArray(mcqs)) {
    return errorJson({ requestId, errorCode: 'invalid-body', message: 'mcqs array is required.', status: 400 });
  }

  const existing = await getAssignmentPack(packId);
  if (!existing) {
    return errorJson({ requestId, errorCode: 'not-found', message: 'Assignment pack not found.', status: 404 });
  }

  // Only allow edits on draft packs
  if (existing.status !== 'draft') {
    return errorJson({ requestId, errorCode: 'not-editable', message: 'Only draft packs can be edited. Regenerate to get a new draft.', status: 409 });
  }

  // Validate and sanitise each MCQ
  const sanitised = (mcqs as Array<Record<string, unknown>>).map((q) => ({
    question: String(q.question ?? '').trim(),
    options: Array.isArray(q.options) ? (q.options as unknown[]).map((o) => String(o).trim()) : ['', '', '', ''],
    answer: Number.isFinite(Number(q.answer)) ? Math.max(0, Math.min(3, Number(q.answer))) : 0,
    explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
  }));

  const updatedPack = await upsertAssignmentPack(session.teacher.id, {
    ...existing,
    mcqs: sanitised,
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
