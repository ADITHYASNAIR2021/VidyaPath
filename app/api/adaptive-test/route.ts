import { ALL_CHAPTERS } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { getGroundedPYQData } from '@/lib/pyq-grounded';
import { getContextPack } from '@/lib/ai/context-retriever';
import { computeWeightedTemperature } from '@/lib/ai/generation-controls';
import { generateTaskJson } from '@/lib/ai/generator';
import {
  getAdaptiveHistoryProfile,
  hashQuestionStem,
  prioritizeQuestionsForAdaptiveProfile,
  recordGeneratedQuestions,
} from '@/lib/ai/question-history';
import { computeRecommendedTopK } from '@/lib/ai/retrieval-enhancements';
import { checkAiTokenBudget } from '@/lib/ai/token-budget';
import {
  cleanTextList,
  isAdaptiveTestResponse,
  normalizeChapterCitations,
  normalizeMCQs,
  stripSourceTags,
  type AdaptiveTestResponse,
  type MCQItem,
} from '@/lib/ai/validators';
import { buildVariationInstruction, buildVariationProfile } from '@/lib/ai/variation';
import { annotateQuestionsWithRagMeta } from '@/lib/ai/question-rag';
import { buildSubjectSystemPromptAddendum } from '@/lib/ai/subject-prompts';
import { getFewShotExamples } from '@/lib/ai/pyq-examples';
import { verifySelfCheck } from '@/lib/ai/question-verifier';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { adaptiveTestRequestSchema, type AdaptiveTestRequest } from '@/lib/schemas/ai';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/logger';

function buildAdaptiveGenericQuestion(subject: string, chapterTitle: string, topic: string, index: number): MCQItem {
  const variants: MCQItem[] = [
    {
      question: `In ${chapterTitle}, which statement best describes "${topic}"?`,
      options: [
        `It should follow the chapter definition and standard ${subject} conditions.`,
        'It is solved mainly by exam strategy tricks rather than concept.',
        'It belongs outside the syllabus of this chapter.',
        'It never appears in board-level conceptual questions.',
      ],
      answer: 0,
      explanation: `For ${topic}, start from NCERT definition and chapter conditions before applying it in questions.`,
    },
    {
      question: `Which option is the most board-relevant understanding of "${topic}" in ${chapterTitle}?`,
      options: [
        `A precise concept statement with correct ${subject} terminology and constraints.`,
        'A memorized one-line trick without conceptual basis.',
        'A generic exam tactic unrelated to the chapter content.',
        'A random assumption not supported by textbook content.',
      ],
      answer: 0,
      explanation: `Board answers on ${topic} are strongest when concept and chapter language are both accurate.`,
    },
    {
      question: `For "${topic}" questions in ${chapterTitle}, the best first step is to:`,
      options: [
        `Identify the governing ${subject} principle from the chapter and apply it to the given case.`,
        'Start with time-management tips before reading the concept.',
        'Ignore definitions and directly guess from options.',
        'Use only elimination without understanding the topic.',
      ],
      answer: 0,
      explanation: `The reliable path is concept-first: map the question to the chapter principle and then solve.`,
    },
  ];
  return variants[index % variants.length];
}

function ensureAdaptiveQuestionCount(questions: MCQItem[], req: AdaptiveTestRequest): MCQItem[] {
  const target = Math.max(3, Math.min(30, req.questionCount ?? 10));
  const output: MCQItem[] = [];
  const used = new Set<string>();
  for (const item of normalizeMCQs(questions)) {
    const key = item.question.trim().toLowerCase();
    if (!key || used.has(key)) continue;
    used.add(key);
    output.push(item);
    if (output.length >= target) break;
  }
  const selectedChapters = ALL_CHAPTERS.filter((chapter) => req.chapterIds.includes(chapter.id));
  const topicPool = selectedChapters.flatMap((chapter) =>
    (chapter.topics ?? []).map((topic) => ({ chapterTitle: chapter.title, topic }))
  );
  let cursor = 0;
  while (output.length < target) {
    const selected = topicPool[cursor % Math.max(1, topicPool.length)];
    output.push(
      buildAdaptiveGenericQuestion(
        req.subject,
        selected?.chapterTitle ?? `${req.subject} chapter`,
        selected?.topic ?? `${req.subject} core concept`,
        cursor
      )
    );
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
          question: `In ${req.subject}, which choice is most aligned with textbook-grounded problem solving?`,
          options: [
            'Apply the chapter concept accurately before selecting a method.',
            'Pick the longest option because it looks complete.',
            'Rely on guessing patterns from option positions.',
            'Ignore chapter definitions and memorize outcomes.',
          ],
          answer: 0,
          explanation: 'Textbook-grounded reasoning starts with concept accuracy, then application.',
        },
      ];

  const questions = ensureAdaptiveQuestionCount(baseQuestions, req);
  const answerKey = questions.map((question) => question.answer);
  const topicCoverage = chapters.map((chapter) => chapter.title);
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
    const { context, response: authResponse } = await requireInteractiveAuth(req);
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
    const parsed = bodyResult.value;
    const tokenBudget = await checkAiTokenBudget({
      context,
      endpoint: '/api/adaptive-test',
      projectedInputText: JSON.stringify(parsed),
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
    const adaptiveHistory = await getAdaptiveHistoryProfile({
      authUserId: context?.authUserId,
      chapterIds: parsed.chapterIds,
      recentLimit: 8,
    });
    const pyqTopics = pyqRows.flatMap((item) => item.importantTopics ?? []);
    const pyqSummary = pyqRows
      .slice(0, 4)
      .map((item) => `avg ${item.avgMarks} | topics: ${item.importantTopics.slice(0, 3).join(', ')}`)
      .join('\n');

    const chapterTopicsText = chapter?.topics?.join(', ') ?? '';
    const contextPack = await getContextPack({
      task: 'adaptive-test',
      classLevel: parsed.classLevel,
      subject: parsed.subject,
      chapterId: chapter?.id,
      chapterTopics: chapter?.topics ?? [],
      query: `${parsed.subject} ${chapter?.title ?? ''} ${chapterTopicsText} ${pyqTopics.slice(0, 6).join(' ')}`.trim(),
      topK: computeRecommendedTopK(parsed.questionCount ?? 10),
    });

    const textbookSnippetCount = contextPack.snippets.filter((s) => s.sourceType === 'textbook').length;
    const paperSnippetCount = contextPack.snippets.filter((s) => s.sourceType !== 'textbook').length;
    const contextSummary = `Context: ${textbookSnippetCount} NCERT textbook + ${paperSnippetCount} board-paper snippets retrieved.`;
    const resolvedDifficultyMix = parsed.difficultyMix?.trim() || adaptiveHistory.recommendedDifficultyMix;
    const recentQuestionBlock = adaptiveHistory.recentQuestions.length > 0
      ? `Avoid repeating these recent stems too closely: ${adaptiveHistory.recentQuestions.join(' | ')}`
      : '';
    const accuracyBlock = adaptiveHistory.aggregateAccuracy !== null
      ? `Student history across selected chapters: ${Math.round(adaptiveHistory.aggregateAccuracy * 100)}% average accuracy.${adaptiveHistory.weakQuestions.length > 0 ? ` Prior weak stems: ${adaptiveHistory.weakQuestions.join(' | ')}` : ''}`
      : '';
    const challengeBandBlock = `Target challenge band: ${adaptiveHistory.targetDifficultyBand}.`;

    const userPrompt = `Generate ${parsed.questionCount ?? 10} adaptive CBSE MCQs for:
Subject: ${parsed.subject} | Class: ${parsed.classLevel}
Chapter(s): ${chapter?.title ?? parsed.chapterIds.join(', ')}
Chapter topics: ${chapterTopicsText || 'See retrieved context'}
Difficulty split: ${resolvedDifficultyMix}
${contextSummary}
${accuracyBlock}
${recentQuestionBlock}
${challengeBandBlock}

PYQ signal:
${pyqSummary || 'No PYQ data available.'}
Key PYQ topics: ${pyqTopics.slice(0, 8).join(', ') || 'none'}

RULES:
- Draw questions DIRECTLY from the retrieved context snippets (textbook definitions + past-paper question patterns).
- Cover all listed chapter topics across the question set.
- Apply the CBSE Bloom's taxonomy mix from the system prompt.
- Use PYQ topics for 50%+ of questions — these appear in board exams.

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
      difficulty: resolvedDifficultyMix,
    });
    const subjectAddendum = buildSubjectSystemPromptAddendum(parsed.subject, parsed.classLevel);
    const fewShotBlock = getFewShotExamples(parsed.subject, parsed.classLevel);
    const userPromptWithVariation = `${userPrompt}
${buildVariationInstruction(variation)}`;

    try {
      const { data, result } = await generateTaskJson<AdaptiveTestResponse>({
        task: 'adaptive-test',
        contextHash: contextPack.contextHash,
        contextSnippets: contextPack.snippets,
        chapterId: chapter?.id,
        difficulty: resolvedDifficultyMix,
        diversityKey: variation.diversityKey,
        systemPrompt: `You are VidyaAI Adaptive Test Engine — a CBSE board-exam question generator.

GROUNDING (MANDATORY): Use the "Retrieved Paper Context" snippets as your PRIMARY source. Every question must be traceable to a concept, definition, formula, reaction, diagram, or worked example present in those snippets or in standard NCERT content for the requested chapters. Do NOT invent facts or use external knowledge not present in the context.

QUESTION TYPE MIX — distribute across the full set:
• RECALL (35%): definitions, laws, units, naming reactions/processes, identifying diagrams
• APPLICATION (35%): solve numericals, apply concept to real-world scenario, explain natural phenomenon, predict outcome
• ANALYSIS (20%): compare/contrast, identify correct/incorrect statements, assertion-reason pairs, data interpretation
• CASE-BASED (10%): short 2-3 sentence scenario from daily life or experiment → 1 related MCQ

DISTRACTOR RULES:
- All 4 options must be plausible NCERT-language alternatives (common misconceptions, wrong formula sign, reversed cause-effect, correct concept from different chapter)
- Never use generic fillers like "None of the above" or exam-strategy phrases as options
- One option must be a very common student error for that topic

EXPLANATION: 1–3 sentences citing the specific law/formula/definition from the chapter. Include the correct mechanism if applicable.

Ensure answerKey index exactly matches the correct option index in each question.
${subjectAddendum ? subjectAddendum + '\n' : ''}${fewShotBlock ? `${fewShotBlock}\n` : ''}Output ONLY valid JSON.`,
        userPrompt: userPromptWithVariation,
        temperature: computeWeightedTemperature({
          recall: 35,
          application: 35,
          analysis: 20,
          caseBased: 10,
        }),
        maxOutputTokens: 3500,
        validate: isAdaptiveTestResponse,
      });

      const selectedChapters = ALL_CHAPTERS.filter((item) => parsed.chapterIds.includes(item.id));
      const allowText = selectedChapters.map((item) => `${item.title} ${item.topics.join(' ')}`).join(' ');
      const rawNormalized = normalizeMCQs(data.questions)
        .filter((item) => (allowText ? isAlignedToChapter(item.question, allowText) : true))
        .slice(0, Math.max(3, parsed.questionCount ?? 10));
      const normalized = await verifySelfCheck(rawNormalized, contextPack.snippets);
      const merged = normalized.length > 0 ? normalized : fallback.questions;
      const reviewHashes = new Set(adaptiveHistory.weakHashes);
      const reviewQuota = Math.min(
        Math.max(0, Math.round((parsed.questionCount ?? 10) * adaptiveHistory.reviewQuota)),
        Math.max(0, (parsed.questionCount ?? 10) - 1)
      );
      const reviewPool = selectedChapters
        .flatMap((chapterItem) =>
          (chapterItem.quizzes ?? []).map((quiz) => ({
            question: quiz.question,
            options: quiz.options,
            answer: quiz.correctAnswerIndex,
            explanation: quiz.explanation ?? 'Review this chapter concept again.',
          }))
        )
        .filter((item) => reviewHashes.has(hashQuestionStem(item.question)));
      const prioritized = prioritizeQuestionsForAdaptiveProfile(merged, adaptiveHistory);
      const finalQuestions = ensureAdaptiveQuestionCount(
        [...reviewPool.slice(0, reviewQuota), ...prioritized],
        parsed
      );
      const topicHints = selectedChapters.flatMap((item) => item.topics ?? []);
      const annotatedQuestions = annotateQuestionsWithRagMeta(finalQuestions, {
        chapterTitle: chapter?.title,
        chapterTopics: topicHints,
        pyqTopics,
        contextSnippets: contextPack.snippets,
      });
      await recordGeneratedQuestions({
        authUserId: context?.authUserId,
        chapterId: chapter?.id,
        subject: parsed.subject,
        questions: annotatedQuestions,
      });
      const answerKey = annotatedQuestions.map((question) => question.answer);
      const response: AdaptiveTestResponse & {
        sourceCitations: Array<{ sourcePath: string; year?: number }>;
        grounding: {
          usedPgvector: boolean;
          usedOnDemandFallback: boolean;
          retrieval: typeof contextPack.retrievalMeta;
        };
      } = {
        questions: annotatedQuestions,
        answerKey,
        topicCoverage: cleanTextList(
          Array.isArray(data.topicCoverage) ? data.topicCoverage : fallback.topicCoverage,
          Math.max(12, parsed.questionCount ?? 10)
        ),
        predictedScoreBand: stripSourceTags(
          typeof data.predictedScoreBand === 'string' ? data.predictedScoreBand : fallback.predictedScoreBand
        ),
        sourceCitations: normalizeChapterCitations(
          contextPack.snippets.map((snippet) => ({ sourcePath: snippet.sourcePath, year: snippet.year }))
        ),
        grounding: {
          usedPgvector: contextPack.usedPgvector,
          usedOnDemandFallback: contextPack.usedOnDemandFallback,
          retrieval: contextPack.retrievalMeta,
        },
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
      logger.warn({ err: aiError }, '[adaptive-test] AI fallback triggered');
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
    logger.error({ err: error }, '[adaptive-test] error');
    const message = error instanceof Error ? error.message : 'Failed to generate adaptive test.';
    return errorJson({
      requestId,
      errorCode: 'adaptive-test-generate-failed',
      message,
      status: 500,
    });
  }
}
