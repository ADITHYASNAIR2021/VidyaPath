import { ALL_CHAPTERS } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { getGroundedPYQData } from '@/lib/pyq-grounded';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskJson } from '@/lib/ai/generator';
import { checkAiTokenBudget } from '@/lib/ai/token-budget';
import {
  cleanTextList,
  isAdaptiveTestResponse,
  normalizeMCQs,
  stripSourceTags,
  type AdaptiveTestResponse,
  type MCQItem,
} from '@/lib/ai/validators';
import { buildVariationInstruction, buildVariationProfile } from '@/lib/ai/variation';
import { annotateQuestionsWithRagMeta } from '@/lib/ai/question-rag';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { adaptiveTestRequestSchema } from '@/lib/schemas/ai';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

interface AdaptiveTestRequest {
  classLevel: 10 | 12;
  subject: string;
  chapterIds: string[];
  difficultyMix?: string;
  questionCount?: number;
  mode?: string;
}

function parseRequest(body: unknown): AdaptiveTestRequest | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const classLevel = Number(record.classLevel) as 10 | 12;
  const subject = typeof record.subject === 'string' ? record.subject.trim() : '';
  const chapterIds = Array.isArray(record.chapterIds)
    ? record.chapterIds.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean)
    : [];
  if ((classLevel !== 10 && classLevel !== 12) || !subject || chapterIds.length === 0) return null;

  return {
    classLevel,
    subject,
    chapterIds,
    difficultyMix: typeof record.difficultyMix === 'string' ? record.difficultyMix.trim() : '40% easy, 40% medium, 20% hard',
    questionCount: Number.isFinite(Number(record.questionCount))
      ? Math.max(3, Math.min(30, Math.round(Number(record.questionCount))))
      : 10,
    mode: typeof record.mode === 'string' ? record.mode.trim() : 'board-practice',
  };
}

function buildAdaptiveGenericQuestion(subject: string, index: number): MCQItem {
  const variants: MCQItem[] = [
    {
      question: `In ${subject}, which revision strategy usually improves board scores fastest?`,
      options: [
        'Topic-wise timed practice on weak areas',
        'Only reading solved answers without writing',
        'Ignoring PYQs until last week',
        'Studying random topics without a plan',
      ],
      answer: 0,
      explanation: 'Timed weak-area practice gives the quickest improvement in exam performance.',
    },
    {
      question: `What is the most reliable way to reduce avoidable mistakes in ${subject}?`,
      options: [
        'Maintain an error log and re-attempt similar questions',
        'Skip post-test review to save time',
        'Memorize options without understanding',
        'Attempt only easy questions',
      ],
      answer: 0,
      explanation: 'Error logs and targeted re-attempts reduce repeated mistakes.',
    },
    {
      question: `For mixed-difficulty ${subject} practice, the best approach is:`,
      options: [
        'Start medium, then hard, then recap easy traps',
        'Only hard questions from day one',
        'Only easy questions throughout',
        'No revision after test attempts',
      ],
      answer: 0,
      explanation: 'A balanced progression improves accuracy and confidence sustainably.',
    },
  ];
  return variants[index % variants.length];
}

function ensureAdaptiveQuestionCount(questions: MCQItem[], req: AdaptiveTestRequest): MCQItem[] {
  const target = Math.max(3, Math.min(30, req.questionCount ?? 10));
  const output = normalizeMCQs(questions).slice(0, target);
  let cursor = 0;
  while (output.length < target) {
    output.push(buildAdaptiveGenericQuestion(req.subject, cursor));
    cursor += 1;
  }
  return normalizeMCQs(output).slice(0, target);
}

function buildFallbackQuestions(req: AdaptiveTestRequest): AdaptiveTestResponse {
  const chapters = ALL_CHAPTERS.filter((chapter) => req.chapterIds.includes(chapter.id));
  const pool: MCQItem[] = chapters
    .flatMap((chapter) =>
      (chapter.quizzes ?? []).map((quiz) => ({
        question: quiz.question,
        options: quiz.options,
        answer: quiz.correctAnswerIndex,
        explanation: quiz.explanation ?? 'Review this chapter concept again.',
      }))
    )
    .slice(0, Math.max(3, Math.min(20, req.questionCount ?? 10)));

  const baseQuestions = pool.length > 0
    ? normalizeMCQs(pool)
    : [
        {
          question: `Which area should be prioritized first for ${req.subject} improvement?`,
          options: [
            'Low-frequency trivia topics',
            'High-frequency PYQ topics',
            'Only long derivations',
            'Random sample questions',
          ],
          answer: 1,
          explanation: 'High-frequency PYQ topics provide the strongest score impact in board exams.',
        },
      ];

  const questions = ensureAdaptiveQuestionCount(baseQuestions, req);
  const answerKey = questions.map((question) => question.answer);
  const topicCoverage = chapters.map((chapter) => chapter.title).slice(0, 8);
  const estimatedPct = Math.min(92, 55 + topicCoverage.length * 4);

  return {
    questions,
    answerKey,
    topicCoverage,
    predictedScoreBand: `${Math.max(45, estimatedPct - 12)}-${estimatedPct}%`,
  };
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(
    (token) => !['which', 'what', 'following', 'correct', 'statement', 'about', 'this', 'that'].includes(token)
  );
}

function isAlignedToChapter(question: string, allowText: string): boolean {
  const allow = new Set(tokenize(allowText));
  const qTokens = tokenize(question);
  return qTokens.some((token) => allow.has(token));
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const limit = await checkRateLimit({
      key: buildRateLimitKey('ai:adaptive-test', [context?.authUserId || getClientIp(req), context?.schoolId]),
      windowSeconds: 60,
      maxRequests: 10,
      blockSeconds: 120,
    });
    if (!limit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many adaptive test requests. Please retry shortly.',
        status: 429,
        hint: `Retry after ${limit.retryAfterSeconds}s`,
      });
    }

    const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, adaptiveTestRequestSchema);
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
    const parsed = parseRequest(body);
    if (!parsed) {
      return errorJson({
        requestId,
        errorCode: 'invalid-adaptive-test-input',
        message: 'Invalid request. Required: { classLevel, subject, chapterIds[] }',
        status: 400,
      });
    }
    const tokenBudget = await checkAiTokenBudget({
      context,
      endpoint: '/api/adaptive-test',
      projectedInputText: JSON.stringify(body),
      projectedOutputTokens: 2000,
    });
    if (!tokenBudget.allowed) {
      return errorJson({
        requestId,
        errorCode: tokenBudget.reason || 'token-cap-exceeded',
        message: 'AI usage limit reached for adaptive test generation.',
        status: 429,
        hint: `Retry after ${tokenBudget.retryAfterSeconds ?? 300}s`,
      });
    }

    const fallback = buildFallbackQuestions(parsed);
    const chapter = ALL_CHAPTERS.find((item) => item.id === parsed.chapterIds[0]);
    const pyqRows = (await Promise.all(
      parsed.chapterIds.map(async (id) => (await getGroundedPYQData(id)) ?? getPYQData(id))
    ))
      .filter((item): item is NonNullable<ReturnType<typeof getPYQData>> => !!item)
      .slice(0, 6);
    const pyqTopics = pyqRows.flatMap((item) => item.importantTopics ?? []);
    const pyqSummary = pyqRows
      .slice(0, 4)
      .map((item) => `avg ${item.avgMarks} | topics: ${item.importantTopics.slice(0, 3).join(', ')}`)
      .join('\n');

    const contextPack = await getContextPack({
      task: 'adaptive-test',
      classLevel: parsed.classLevel,
      subject: parsed.subject,
      chapterId: chapter?.id,
      chapterTopics: chapter?.topics ?? [],
      query: `adaptive test ${parsed.subject} ${parsed.chapterIds.join(' ')}`,
      topK: 5,
    });

    const userPrompt = `Create a weak-area adaptive CBSE test with:
${JSON.stringify(parsed, null, 2)}

PYQ signal:
${pyqSummary || 'No PYQ data available.'}

Return ONLY JSON:
{
  "questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}],
  "answerKey":[0,2,1],
  "topicCoverage":["..."],
  "predictedScoreBand":"65-78%"
}`;
    const variation = buildVariationProfile({
      task: 'adaptive-test',
      contextHash: contextPack.contextHash,
      chapterId: chapter?.id,
      difficulty: parsed.difficultyMix,
    });
    const userPromptWithVariation = `${userPrompt}
${buildVariationInstruction(variation)}`;

    try {
      const { data, result } = await generateTaskJson<AdaptiveTestResponse>({
        task: 'adaptive-test',
        contextHash: contextPack.contextHash,
        contextSnippets: contextPack.snippets,
        chapterId: chapter?.id,
        difficulty: parsed.difficultyMix,
        diversityKey: variation.diversityKey,
        systemPrompt: `You are VidyaAI Adaptive Test Engine.
- Generate exam-style MCQs with balanced difficulty.
- Align questions with weak topics and PYQ-heavy areas.
- Ensure answerKey matches generated questions.
- Avoid repetitive phrasing across runs.
- Output JSON only.`,
        userPrompt: userPromptWithVariation,
        temperature: 0.2,
        maxOutputTokens: 2000,
        validate: isAdaptiveTestResponse,
      });

      const selectedChapters = ALL_CHAPTERS.filter((item) => parsed.chapterIds.includes(item.id));
      const allowText = selectedChapters.map((item) => `${item.title} ${item.topics.join(' ')}`).join(' ');
      const normalized = normalizeMCQs(data.questions)
        .filter((item) => (allowText ? isAlignedToChapter(item.question, allowText) : true))
        .slice(0, Math.max(3, parsed.questionCount ?? 10));
      const merged = normalized.length > 0 ? normalized : fallback.questions;
      const finalQuestions = ensureAdaptiveQuestionCount(merged, parsed);
      const topicHints = selectedChapters.flatMap((item) => item.topics ?? []);
      const annotatedQuestions = annotateQuestionsWithRagMeta(finalQuestions, {
        chapterTitle: chapter?.title,
        chapterTopics: topicHints,
        pyqTopics,
        contextSnippets: contextPack.snippets,
      });
      const answerKey = annotatedQuestions.map((question) => question.answer);
      const response: AdaptiveTestResponse = {
        questions: annotatedQuestions,
        answerKey,
        topicCoverage: cleanTextList(
          Array.isArray(data.topicCoverage) ? data.topicCoverage : fallback.topicCoverage,
          12
        ),
        predictedScoreBand: stripSourceTags(
          typeof data.predictedScoreBand === 'string' ? data.predictedScoreBand : fallback.predictedScoreBand
        ),
      };
      await logAiUsage({
        context,
        endpoint: '/api/adaptive-test',
        provider: result.provider,
        model: result.model,
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
        totalTokens: result.usage?.totalTokens,
        estimated: !result.usage,
      });
      return dataJson({ requestId, data: response });
    } catch (aiError) {
      console.error('[adaptive-test] AI fallback triggered', aiError);
      const selectedChapters = ALL_CHAPTERS.filter((item) => parsed.chapterIds.includes(item.id));
      const topicHints = selectedChapters.flatMap((item) => item.topics ?? []);
      const fallbackQuestions = annotateQuestionsWithRagMeta(fallback.questions, {
        chapterTitle: chapter?.title,
        chapterTopics: topicHints,
        pyqTopics,
        contextSnippets: contextPack.snippets,
      });
      return dataJson({
        requestId,
        data: {
          ...fallback,
          questions: fallbackQuestions,
          answerKey: fallbackQuestions.map((question) => question.answer),
        },
      });
    }
  } catch (error) {
    console.error('[adaptive-test] error', error);
    const message = error instanceof Error ? error.message : 'Failed to generate adaptive test.';
    return errorJson({
      requestId,
      errorCode: 'adaptive-test-generate-failed',
      message,
      status: 500,
    });
  }
}
