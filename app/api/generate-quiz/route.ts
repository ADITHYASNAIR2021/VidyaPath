import { NextResponse } from 'next/server';
import { getPYQData } from '@/lib/pyq';
import { getChapterById } from '@/lib/data';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskJson } from '@/lib/ai/generator';
import { checkAiTokenBudget } from '@/lib/ai/token-budget';
import { isMCQArray, normalizeMCQs, type MCQItem } from '@/lib/ai/validators';
import { buildDynamicQuizFallback } from '@/lib/ai/dynamic-fallback';
import { buildVariationInstruction, buildVariationProfile } from '@/lib/ai/variation';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { quizRequestSchema } from '@/lib/schemas/ai';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

function buildFallbackQuiz(input: {
  subject: string;
  chapterTitle: string;
  chapterTopics: string[];
  pyqTopics?: string[];
  questionCount: number;
  difficulty?: string;
  seedText: string;
}): MCQItem[] {
  return buildDynamicQuizFallback({
    subject: input.subject,
    chapterTitle: input.chapterTitle,
    chapterTopics: input.chapterTopics,
    pyqTopics: input.pyqTopics,
    questionCount: input.questionCount,
    difficulty: input.difficulty,
    seedText: input.seedText,
  });
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const limit = await checkRateLimit({
      key: buildRateLimitKey('ai:quiz', [context?.authUserId || getClientIp(req), context?.schoolId]),
      windowSeconds: 60,
      maxRequests: 20,
      blockSeconds: 120,
    });
    if (!limit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many quiz generation requests. Please wait and retry.',
        status: 429,
        hint: `Retry after ${limit.retryAfterSeconds}s`,
      });
    }

    const parsedBody = await parseAndValidateJsonBody(req, 40 * 1024, quizRequestSchema);
    if (!parsedBody.ok) {
      return errorJson({
        requestId,
        errorCode: parsedBody.reason,
        message: parsedBody.message,
        status: bodyReasonToStatus(parsedBody.reason),
        issues: parsedBody.issues,
      });
    }
    const body = parsedBody.value as Record<string, unknown>;
    const tokenBudget = await checkAiTokenBudget({
      context,
      endpoint: '/api/generate-quiz',
      projectedInputText: JSON.stringify(body),
      projectedOutputTokens: 1800,
    });
    if (!tokenBudget.allowed) {
      return errorJson({
        requestId,
        errorCode: tokenBudget.reason || 'token-cap-exceeded',
        message: 'AI usage limit reached for quiz generation.',
        status: 429,
        hint: `Retry after ${tokenBudget.retryAfterSeconds ?? 300}s`,
      });
    }

    const incomingSubject = typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim() : 'CBSE subject';
    const incomingChapterTitle =
      typeof body.chapterTitle === 'string' && body.chapterTitle.trim()
        ? body.chapterTitle.trim()
        : 'this chapter';
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
    const nccontext = typeof body.nccontext === 'string' ? body.nccontext.trim() : '';
    const difficulty = typeof body.difficulty === 'string' ? body.difficulty.trim() : 'mixed';

    const chapter = chapterId ? getChapterById(chapterId) : undefined;
    const subject = chapter?.subject ?? incomingSubject;
    const chapterTitle = chapter?.title ?? incomingChapterTitle;
    const classLevel = chapter?.classLevel ?? (typeof body.classLevel === 'number' ? body.classLevel : 12);
    const pyq = chapterId ? getPYQData(chapterId) : null;

    const contextPack = await getContextPack({
      task: 'mcq',
      classLevel,
      subject: chapter?.subject ?? subject,
      chapterId: chapter?.id ?? (chapterId || undefined),
      chapterTopics: chapter?.topics ?? [],
      query: `${chapterTitle} ${subject} ${pyq?.importantTopics.join(' ') ?? ''}`.trim(),
      topK: 5,
    });

    const pyqContext = pyq
      ? `PYQ signal: avg marks ${pyq.avgMarks}, years ${[...pyq.yearsAsked].sort((a, b) => b - a).slice(0, 8).join(', ')}, top topics ${pyq.importantTopics.join(', ')}.`
      : 'No PYQ signal available.';

    const questionCount = Math.min(20, Math.max(3, Number(body.questionCount) || 5));
    const variation = buildVariationProfile({
      task: 'mcq',
      contextHash: contextPack.contextHash,
      chapterId: (chapter?.id ?? chapterId) || undefined,
      difficulty,
    });
    const schema = `Return ONLY a JSON array of ${questionCount} MCQs:
[{
  "question":"...",
  "options":["A","B","C","D"],
  "answer":0,
  "explanation":"..."
}]`;

    const userPrompt = `Create ${questionCount} board-style MCQs for Class ${classLevel} ${subject}, chapter "${chapterTitle}".
Difficulty mix: ${difficulty}.
${pyqContext}
NCERT context (optional): ${nccontext || 'Use retrieved paper snippets and chapter fundamentals.'}
Ensure concept coverage and no duplicate questions.
${buildVariationInstruction(variation)}

${schema}`;

    const { data, result } = await generateTaskJson<MCQItem[]>({
      task: 'mcq',
      contextHash: contextPack.contextHash,
      contextSnippets: contextPack.snippets,
      chapterId: chapter?.id ?? (chapterId || undefined),
      difficulty,
      diversityKey: variation.diversityKey,
      systemPrompt: `You are VidyaAI Quiz Engine for CBSE.
- Questions must be strictly factual and exam-relevant.
- Keep options mutually exclusive and plausible.
- Explanations should be one to three concise lines.
- Produce varied question phrasings and varied distractor patterns across runs.
- Do not include citation tokens like [S1] in the output.
- Output JSON only.`,
      userPrompt,
      temperature: 0.15,
      maxOutputTokens: 1800,
      validate: isMCQArray,
    });

    const normalized = normalizeMCQs(data);
    const fallback = buildFallbackQuiz({
      subject,
      chapterTitle,
      chapterTopics: chapter?.topics ?? [],
      pyqTopics: pyq?.importantTopics,
      questionCount,
      difficulty,
      seedText: variation.diversityKey,
    });
    const merged: MCQItem[] = [];
    const seen = new Set<string>();
    for (const question of normalized) {
      const key = question.question.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(question);
      if (merged.length >= questionCount) break;
    }
    for (const question of fallback) {
      if (merged.length >= questionCount) break;
      const key = question.question.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(question);
    }
    await logAiUsage({
      context,
      endpoint: '/api/generate-quiz',
      provider: result.provider,
      model: result.model,
      promptText: userPrompt,
      completionText: JSON.stringify(merged.slice(0, questionCount)),
      requestId,
      estimated: true,
    });

    return dataJson({
      requestId,
      data: {
        success: true,
        data: merged.slice(0, questionCount),
      },
    });
  } catch (error) {
    console.error('[Quiz API Error]:', error);
    const questionCount = 5;
    return dataJson({
      requestId,
      data: {
        success: true,
        data: buildFallbackQuiz({
          subject: 'CBSE subject',
          chapterTitle: 'this chapter',
          chapterTopics: ['core concepts', 'definitions', 'applications'],
          questionCount,
          seedText: `fallback:${Date.now()}`,
        }),
      },
    });
  }
}
