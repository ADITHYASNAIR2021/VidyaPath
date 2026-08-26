import { getContextPack, type ContextTask } from '@/lib/ai/context-retriever';
import { getChapterById } from '@/lib/data';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { contextPackRequestSchema } from '@/lib/schemas/ai';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/logger';

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
    const { context, response: authResponse } = await requireInteractiveAuth(req);
    if (authResponse) return authResponse;

    const limit = await checkRateLimit({
      key: buildRateLimitKey('ai:context-pack', [context?.authUserId || getClientIp(req), context?.schoolId]),
      windowSeconds: 60,
      maxRequests: 40,
      blockSeconds: 120,
    });
    if (!limit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many context retrieval requests. Please wait and retry.',
        status: 429,
        hint: `Retry after ${limit.retryAfterSeconds}s`,
      });
    }

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
        sourceType: snippet.sourceType ?? 'paper',
        modalityHints: snippet.modalityHints ?? [],
        topicHints: snippet.topicHints ?? [],
      })),
      contextHash: contextPack.contextHash,
      usedOnDemandFallback: contextPack.usedOnDemandFallback,
      usedPgvector: contextPack.usedPgvector,
      retrieval: contextPack.retrievalMeta ?? null,
    };
    await logAiUsage({
      context,
      endpoint: '/api/context-pack',
      provider: contextPack.usedPgvector ? 'gemini-pgvector' : 'local-retriever',
      model: contextPack.usedPgvector ? 'gemini-embedding-001' : 'context-index',
      promptText: query,
      completionText: JSON.stringify({ snippets: payload.snippets.length, usedPgvector: payload.usedPgvector }),
      estimated: true,
    });
    return dataJson({ requestId, data: payload });
  } catch (error) {
    logger.error({ err: error }, '[context-pack] error');
    const message = error instanceof Error ? error.message : 'Failed to build context pack.';
    return errorJson({
      requestId,
      errorCode: 'context-pack-build-failed',
      message,
      status: 500,
    });
  }
}
