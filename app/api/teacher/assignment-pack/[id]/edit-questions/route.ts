import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { editQuestionsSchema } from '@/lib/schemas/teacher-pack';
import { getAssignmentPack, canTeacherAccessAssignmentPack, upsertAssignmentPack } from '@/lib/teacher-admin-db';
import { getChapterById } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { getGroundedPYQData } from '@/lib/pyq-grounded';
import { getContextPack } from '@/lib/ai/context-retriever';
import { annotateQuestionsWithRagMeta } from '@/lib/ai/question-rag';
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

  const rawBody = await req.json().catch(() => null);
  if (!rawBody || typeof rawBody !== 'object') {
    return errorJson({
      requestId,
      errorCode: 'invalid-json',
      message: 'Request body must be a JSON object.',
      status: 400,
    });
  }
  const legacyMcqs = Array.isArray((rawBody as Record<string, unknown>).mcqs)
    ? ((rawBody as Record<string, unknown>).mcqs as unknown[])
    : null;
  const normalizedPayload = legacyMcqs
    ? {
        packId,
        questions: legacyMcqs.map((entry, index) => {
          if (!entry || typeof entry !== 'object') return null;
          const record = entry as Record<string, unknown>;
          return {
            questionNo: `Q${index + 1}`,
            prompt: typeof record.question === 'string' ? record.question : '',
            options: Array.isArray(record.options)
              ? record.options.filter((option): option is string => typeof option === 'string')
              : undefined,
            answerIndex: Number.isFinite(Number(record.answer)) ? Number(record.answer) : undefined,
            answerIndexes: Array.isArray(record.answers)
              ? record.answers.filter((answer): answer is number => Number.isFinite(Number(answer))).map((answer) => Number(answer))
              : undefined,
            answerMode: record.answerMode === 'multiple' ? 'multiple' : 'single',
            rubric: typeof record.explanation === 'string' ? record.explanation : undefined,
            kind: 'mcq',
          };
        }).filter(Boolean),
      }
    : rawBody;
  const parsed = editQuestionsSchema.safeParse(normalizedPayload);
  if (!parsed.success) {
    return errorJson({
      requestId,
      errorCode: 'invalid-input',
      message: 'Invalid question payload.',
      status: 400,
      issues: parsed.error.issues.map((issue) => ({
        path: Array.isArray(issue.path) ? issue.path.map((part) => String(part)).join('.') : '',
        message: issue.message,
      })),
    });
  }
  const sanitised = parsed.data.questions;
  const existing = await getAssignmentPack(packId);
  if (!existing) {
    return errorJson({ requestId, errorCode: 'not-found', message: 'Assignment pack not found.', status: 404 });
  }

  // Only allow edits on draft packs
  if (existing.status !== 'draft') {
    return errorJson({ requestId, errorCode: 'not-editable', message: 'Only draft packs can be edited. Regenerate to get a new draft.', status: 409 });
  }

  // Map schema shape → MCQItem shape expected by upsertAssignmentPack
  const mcqs = sanitised.map((q, index) => {
    const previousMcq = Array.isArray(existing.mcqs) ? existing.mcqs[index] : undefined;
    return {
      question: q.prompt,
      options: q.options ?? [],
      answer:
        q.answerMode === 'multiple'
          ? (Array.isArray(q.answerIndexes) && q.answerIndexes.length > 0 ? q.answerIndexes[0] : 0)
          : (q.answerIndex ?? 0),
      answers: q.answerMode === 'multiple' ? (Array.isArray(q.answerIndexes) ? q.answerIndexes : []) : undefined,
      answerMode: (q.answerMode === 'multiple' ? 'multiple' : 'single') as 'single' | 'multiple',
      explanation: q.rubric ?? '',
      ragMeta: previousMcq?.ragMeta,
      maxMarks: q.maxMarks,
      kind: q.kind,
    };
  });

  const chapter = getChapterById(existing.chapterId);
  const pyq = (await getGroundedPYQData(existing.chapterId)) ?? getPYQData(existing.chapterId);
  let contextSnippets: Awaited<ReturnType<typeof getContextPack>>['snippets'] = [];
  if (chapter) {
    try {
      const contextPack = await getContextPack({
        task: 'chapter-drill',
        classLevel: chapter.classLevel,
        subject: chapter.subject,
        chapterId: chapter.id,
        chapterTopics: chapter.topics,
        query: `teacher edited assignment ${chapter.title}`,
        topK: 4,
      });
      contextSnippets = contextPack.snippets;
    } catch {
      contextSnippets = [];
    }
  }
  const annotatedMcqs = annotateQuestionsWithRagMeta(mcqs, {
    chapterTitle: chapter?.title ?? existing.title,
    chapterTopics: chapter?.topics ?? [],
    pyqTopics: pyq?.importantTopics ?? [],
    contextSnippets,
  });

  const updatedPack = await upsertAssignmentPack(session.teacher.id, {
    ...existing,
    mcqs: annotatedMcqs,
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
