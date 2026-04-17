import { getContextPack, type ContextTask } from '@/lib/ai/context-retriever';
import { getChapterById } from '@/lib/data';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { contextPackRequestSchema } from '@/lib/schemas/ai';

const ALLOWED_TASKS: ContextTask[] = [
  'chat',
  'flashcards',
  'mcq',
  'adaptive-test',
  'revision-plan',
  'paper-evaluate',
  'chapter-pack',
  'chapter-drill',
  'chapter-diagnose',
  'chapter-remediate',
];

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, contextPackRequestSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }
    const body = bodyResult.value as Record<string, unknown>;

    const classLevel = Number((body as Record<string, unknown>).classLevel);
    const subject = typeof (body as Record<string, unknown>).subject === 'string'
      ? String((body as Record<string, unknown>).subject).trim()
      : '';
    const chapterId = typeof (body as Record<string, unknown>).chapterId === 'string'
      ? String((body as Record<string, unknown>).chapterId).trim()
      : '';
    const query = typeof (body as Record<string, unknown>).query === 'string'
      ? String((body as Record<string, unknown>).query).trim()
      : '';
    const taskRaw = typeof (body as Record<string, unknown>).task === 'string'
      ? String((body as Record<string, unknown>).task).trim()
      : 'chat';
    const task = ALLOWED_TASKS.includes(taskRaw as ContextTask) ? (taskRaw as ContextTask) : 'chat';

    if (!Number.isFinite(classLevel) || (classLevel !== 10 && classLevel !== 12) || !subject) {
      return errorJson({
        requestId,
        errorCode: 'invalid-context-pack-input',
        message: 'Invalid payload. classLevel (10|12) and subject are required.',
        status: 400,
      });
    }

    const chapterTopics = Array.isArray((body as Record<string, unknown>).chapterTopics)
      ? ((body as Record<string, unknown>).chapterTopics as unknown[])
          .filter((topic): topic is string => typeof topic === 'string')
          .map((topic) => topic.trim())
          .filter(Boolean)
      : [];

    const chapter = chapterId ? getChapterById(chapterId) : undefined;
    const effectiveClassLevel = chapter?.classLevel ?? classLevel;
    const effectiveSubject = chapter?.subject ?? subject;
    const effectiveTopics = chapter?.topics ?? chapterTopics;

    const contextPack = await getContextPack({
      task,
      classLevel: effectiveClassLevel,
      subject: effectiveSubject,
      chapterId: chapter?.id ?? (chapterId || undefined),
      chapterTopics: effectiveTopics,
      query,
      topK: 6,
    });

    const payload = {
      snippets: contextPack.snippets.map((snippet) => ({
        text: snippet.text,
        sourcePath: snippet.sourcePath,
        year: snippet.year ?? null,
        relevanceScore: snippet.relevanceScore,
      })),
      contextHash: contextPack.contextHash,
      usedOnDemandFallback: contextPack.usedOnDemandFallback,
    };
    await logAiUsage({
      context,
      endpoint: '/api/context-pack',
      provider: 'local-retriever',
      model: 'context-index',
      promptText: query,
      completionText: JSON.stringify({ snippets: payload.snippets.length, usedOnDemandFallback: payload.usedOnDemandFallback }),
      estimated: true,
    });
    return dataJson({ requestId, data: payload });
  } catch (error) {
    console.error('[context-pack] error', error);
    const message = error instanceof Error ? error.message : 'Failed to build context pack.';
    return errorJson({
      requestId,
      errorCode: 'context-pack-build-failed',
      message,
      status: 500,
    });
  }
}
