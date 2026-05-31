export const dynamic = 'force-dynamic';

import { getPYQData } from '@/lib/pyq';
import { getGroundedPYQData } from '@/lib/pyq-grounded';
import { getChapterById } from '@/lib/data';
import { getContextPack } from '@/lib/ai/context-retriever';
import { computeWeightedTemperature } from '@/lib/ai/generation-controls';
import { generateTaskJson } from '@/lib/ai/generator';
import { getRecentQuestionHistory, prioritizeUnseenQuestions, recordGeneratedQuestions } from '@/lib/ai/question-history';
import { computeRecommendedTopK } from '@/lib/ai/retrieval-enhancements';
import { checkAiTokenBudget } from '@/lib/ai/token-budget';
import { isMCQArray, normalizeChapterCitations, normalizeMCQs, type MCQItem } from '@/lib/ai/validators';
import { buildVariationInstruction, buildVariationProfile } from '@/lib/ai/variation';
import { annotateQuestionsWithRagMeta } from '@/lib/ai/question-rag';
import { buildSubjectSystemPromptAddendum } from '@/lib/ai/subject-prompts';
import { getFewShotExamples } from '@/lib/ai/pyq-examples';
import { verifySelfCheck } from '@/lib/ai/question-verifier';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { quizRequestSchema } from '@/lib/schemas/ai';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/logger';

function sanitizeUntrustedPromptContext(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1600);
}

function buildGenericQuestion(subject: string, chapterTitle: string, topic: string, variant: number): MCQItem {
  const prompts = [
    `In ${chapterTitle}, which statement about "${topic}" is most accurate?`,
    `For ${subject}, what is the board-relevant understanding of "${topic}" in ${chapterTitle}?`,
    `Which option best explains "${topic}" from ${chapterTitle}?`,
  ];
  const stem = prompts[variant % prompts.length];
  return {
    question: `${stem} (Concept check ${variant + 1})`,
    options: [
      'It should be understood with concept clarity and correct terminology from the textbook.',
      'It is usually ignored in board preparation.',
      'It appears only in practical files and not in theory.',
      'It is outside NCERT chapter scope.',
    ],
    answer: 0,
    explanation: `Revise "${topic}" from NCERT and apply it in board-style questions with accurate terms.`,
  };
}

function isGroundedQuestion(item: MCQItem): boolean {
  const text = `${item.question} ${item.options.join(' ')} ${item.explanation}`.toLowerCase();
  return !/(exam strategy|time management|score more|marks boosting|answering technique|attempt order)/.test(text);
}

function ensureExactQuizCount(
  items: MCQItem[],
  chapterQuizzes: MCQItem[],
  questionCount: number,
  subject: string,
  chapterTitle: string,
  chapterTopics: string[]
): MCQItem[] {
  const output: MCQItem[] = [];
  const used = new Set<string>();

  const pushIfUnique = (item: MCQItem) => {
    const key = item.question.trim().toLowerCase();
    if (!key || used.has(key)) return;
    used.add(key);
    output.push(item);
  };

  for (const item of normalizeMCQs(items).filter(isGroundedQuestion)) {
    if (output.length >= questionCount) break;
    pushIfUnique(item);
  }

  for (const item of normalizeMCQs(chapterQuizzes)) {
    if (output.length >= questionCount) break;
    pushIfUnique(item);
  }

  let cursor = 0;
  const topics = chapterTopics.length > 0 ? chapterTopics : [chapterTitle || subject];
  while (output.length < questionCount) {
    const topic = topics[cursor % topics.length] ?? chapterTitle;
    pushIfUnique(buildGenericQuestion(subject, chapterTitle, topic, cursor));
    cursor += 1;
    if (cursor > questionCount * 6) break;
  }

  return normalizeMCQs(output).slice(0, questionCount);
}

function isQuestionStronglyGrounded(item: MCQItem): boolean {
  const meta = item.ragMeta;
  if (!meta) return true;
  if ((meta.qualityScore ?? 0) >= 55) return true;
  if (Array.isArray(meta.sourceMix) && meta.sourceMix.length > 0) return true;
  return false;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth(req);
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
      projectedOutputTokens: 4000,
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
    const nccontext = sanitizeUntrustedPromptContext(
      typeof body.nccontext === 'string' ? body.nccontext : ''
    );
    const difficulty = typeof body.difficulty === 'string' ? body.difficulty.trim() : 'mixed';

    const chapter = chapterId ? getChapterById(chapterId) : undefined;
    const subject = chapter?.subject ?? incomingSubject;
    const chapterTitle = chapter?.title ?? incomingChapterTitle;
    const classLevel = chapter?.classLevel ?? (typeof body.classLevel === 'number' ? body.classLevel : 12);
    const questionCount = Math.min(30, Math.max(3, Number(body.questionCount) || 10));
    const pyq = chapterId
      ? (await getGroundedPYQData(chapterId)) ?? getPYQData(chapterId)
      : null;
    const recentHistory = await getRecentQuestionHistory({
      authUserId: context?.authUserId,
      chapterId: chapter?.id ?? (chapterId || undefined),
      limit: 10,
    });

    const contextPack = await getContextPack({
      task: 'mcq',
      classLevel,
      subject: chapter?.subject ?? subject,
      chapterId: chapter?.id ?? (chapterId || undefined),
      chapterTopics: chapter?.topics ?? [],
      query: `${chapterTitle} ${subject} ${pyq?.importantTopics.join(' ') ?? ''}`.trim(),
      topK: computeRecommendedTopK(questionCount),
    });

    const pyqContext = pyq
      ? `PYQ signal: avg marks ${pyq.avgMarks}, years ${[...pyq.yearsAsked].sort((a, b) => b - a).slice(0, 8).join(', ')}, top topics ${pyq.importantTopics.join(', ')}.`
      : 'No PYQ signal available.';

    const variation = buildVariationProfile({
      task: 'mcq',
      contextHash: contextPack.contextHash,
      chapterId: (chapter?.id ?? chapterId) || undefined,
      difficulty,
    });
    const subjectAddendum = buildSubjectSystemPromptAddendum(subject, classLevel);
    const fewShotBlock = getFewShotExamples(subject, classLevel);
    const schema = `Return ONLY a valid JSON array of ${questionCount} MCQs. No markdown fences, no extra text before or after.
[{
  "question": "...",
  "options": ["option A text", "option B text", "option C text", "option D text"],
  "answer": 0,
  "explanation": "..."
}]
Where "answer" is the 0-based index of the correct option.`;

    const chapterTopicList = chapter?.topics?.join(', ') ?? '';
    const ctxTextbook = contextPack.snippets.filter((s) => s.sourceType === 'textbook').length;
    const ctxPaper = contextPack.snippets.filter((s) => s.sourceType !== 'textbook').length;
    const recentlyTestedBlock = recentHistory.recentQuestions.length > 0
      ? `Recently tested stems to avoid repeating too closely: ${recentHistory.recentQuestions.slice(0, 6).join(' | ')}`
      : '';
    const performanceBlock = recentHistory.accuracyRate !== null
      ? `Student history for this chapter: ${Math.round(recentHistory.accuracyRate * 100)}% accuracy.${recentHistory.weakQuestions.length > 0 ? ` Prior weak stems: ${recentHistory.weakQuestions.join(' | ')}` : ''}`
      : '';
    const userPrompt = `Generate ${questionCount} CBSE board-style MCQs for Class ${classLevel} ${subject}, chapter "${chapterTitle}".
Difficulty: ${difficulty}.
${chapterTopicList ? `Chapter topics: ${chapterTopicList}` : ''}
${pyqContext}
${performanceBlock}
${recentlyTestedBlock}
Context available: ${ctxTextbook} NCERT textbook + ${ctxPaper} board-paper snippets in system message.
${nccontext ? `Additional context notes:\n"""\n${nccontext}\n"""` : ''}

GROUNDING RULES:
- Draw questions directly from the Retrieved NCERT Context snippets above.
- Cover all listed chapter topics proportionally across the ${questionCount} questions.
- Use PYQ topics for at least half the questions — these appear on board exams.
- Each question must test ${subject} knowledge: definitions, laws, formulas, reactions, processes, or applications.
- Do NOT generate questions about exam strategy, time management, or "how to answer".
- Each question must have exactly 4 factually distinct options using correct NCERT language.
${buildVariationInstruction(variation)}

${schema}`;

    const { data, result } = await generateTaskJson<MCQItem[]>({
      task: 'mcq',
      contextHash: contextPack.contextHash,
      contextSnippets: contextPack.snippets,
      chapterId: chapter?.id ?? (chapterId || undefined),
      difficulty,
      diversityKey: variation.diversityKey,
      systemPrompt: `You are VidyaAI Quiz Engine for Class ${classLevel} CBSE ${subject}.

GROUNDING (MANDATORY): Use the "Retrieved NCERT Context" snippets as your PRIMARY source. Every question must test a specific concept, law, formula, chemical reaction, biological process, diagram, or numerical example directly present in those snippets. Do NOT use external knowledge not in the context.

QUESTION TYPE DISTRIBUTION:
• 30% RECALL — definitions, naming, stating laws/formulae, identifying correct terms
• 35% APPLICATION — "Calculate / Predict / Explain why / Write the reaction" using the chapter concept
• 20% ANALYSIS — assertion-reason, identifying correct/incorrect statements, compare two concepts
• 15% CASE/SCENARIO-BASED — 1-2 line observation/data → MCQ testing underlying concept

QUALITY RULES:
- All 4 options must be factually plausible NCERT-language alternatives (misconceptions, reversed causation, wrong sign, adjacent-chapter concepts)
- Never include exam-strategy phrases or scoring tips as options
- Explanations: 1–3 sentences citing the specific NCERT law/formula/definition; include units/equation where applicable
- Cover ALL major topics of the chapter across the question set
- For PYQ-heavy topics, frame questions similar to how they appear in board exams

${subjectAddendum ? subjectAddendum + '\n' : ''}${fewShotBlock ? `${fewShotBlock}\n` : ''}Output ONLY a valid JSON array. No markdown fences, no commentary, no citation tokens like [S1].`,
      userPrompt,
      temperature: computeWeightedTemperature({
        recall: 30,
        application: 35,
        analysis: 20,
        caseBased: 15,
      }),
      maxOutputTokens: 4000,
      validate: isMCQArray,
    });

    const chapterFallbackQuizzes: MCQItem[] = (chapter?.quizzes ?? []).map((quiz) => ({
      question: quiz.question,
      options: quiz.options,
      answer: quiz.correctAnswerIndex,
      explanation: quiz.explanation ?? `Review this concept from ${chapterTitle}.`,
    }));

    const exactQuestions = ensureExactQuizCount(
      prioritizeUnseenQuestions(data, recentHistory.recentHashes),
      chapterFallbackQuizzes,
      questionCount,
      subject,
      chapterTitle,
      chapter?.topics ?? []
    );

    if (exactQuestions.length === 0) {
      return errorJson({
        requestId,
        errorCode: 'quiz-no-questions-generated',
        message: 'Could not generate valid quiz questions for this chapter. Please try again.',
        status: 500,
      });
    }

    const verifiedQuestions = await verifySelfCheck(exactQuestions, contextPack.snippets);
    const annotatedInitial = annotateQuestionsWithRagMeta(verifiedQuestions, {
      chapterTitle,
      chapterTopics: chapter?.topics ?? [],
      pyqTopics: pyq?.importantTopics ?? [],
      contextSnippets: contextPack.snippets,
    });
    const highGroundedSeed = annotatedInitial.filter(isQuestionStronglyGrounded);
    const hardenedQuestions = ensureExactQuizCount(
      highGroundedSeed.length > 0 ? highGroundedSeed : annotatedInitial,
      chapterFallbackQuizzes,
      questionCount,
      subject,
      chapterTitle,
      chapter?.topics ?? []
    );
    const orderedQuestions = prioritizeUnseenQuestions(hardenedQuestions, recentHistory.recentHashes).slice(0, questionCount);
    const annotated = annotateQuestionsWithRagMeta(orderedQuestions, {
      chapterTitle,
      chapterTopics: chapter?.topics ?? [],
      pyqTopics: pyq?.importantTopics ?? [],
      contextSnippets: contextPack.snippets,
    });
    await recordGeneratedQuestions({
      authUserId: context?.authUserId,
      chapterId: chapter?.id ?? (chapterId || undefined),
      subject,
      questions: annotated,
    });
    await logAiUsage({
      context,
      endpoint: '/api/generate-quiz',
      provider: result.provider,
      model: result.model,
      promptTokens: result.usage?.promptTokens,
      completionTokens: result.usage?.completionTokens,
      totalTokens: result.usage?.totalTokens,
      requestId,
      estimated: !result.usage,
    });

    return dataJson({
      requestId,
      data: {
        success: true,
        data: annotated,
        total: annotated.length,
        requested: questionCount,
        grounding: {
          usedPgvector: contextPack.usedPgvector,
          usedOnDemandFallback: contextPack.usedOnDemandFallback,
          retrieval: contextPack.retrievalMeta,
          strongGroundedCount: annotated.filter(isQuestionStronglyGrounded).length,
          sourceCitations: normalizeChapterCitations(
            contextPack.snippets.map((snippet) => ({ sourcePath: snippet.sourcePath, year: snippet.year }))
          ),
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[generate-quiz] error');
    const message = error instanceof Error ? error.message : 'Quiz generation failed.';
    return errorJson({
      requestId,
      errorCode: 'quiz-generation-failed',
      message: 'Unable to generate quiz questions at this time. Please try again.',
      status: 500,
      hint: message,
    });
  }
}
