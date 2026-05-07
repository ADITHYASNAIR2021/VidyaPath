import { getChapterById } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { getGroundedPYQData } from '@/lib/pyq-grounded';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskJson } from '@/lib/ai/generator';
import { checkAiTokenBudget } from '@/lib/ai/token-budget';
import {
  cleanTextList,
  isChapterDrillResponse,
  normalizeChapterCitations,
  normalizeMCQs,
  stripSourceTags,
  type ChapterDrillResponse,
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
import { chapterDrillRequestSchema } from '@/lib/schemas/ai';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/logger';

interface ChapterDrillRequest {
  chapterId: string;
  questionCount: number;
  difficulty: string;
  questionType: 'mcq' | 'short' | 'long' | 'mixed';
}

function parseRequest(body: unknown): ChapterDrillRequest | null {
  if (!body || typeof body !== 'object') return null;
  const chapterId = typeof (body as Record<string, unknown>).chapterId === 'string'
    ? String((body as Record<string, unknown>).chapterId).trim()
    : '';
  if (!chapterId) return null;
  const requestedCount = Number((body as Record<string, unknown>).questionCount);
  const questionCount = Number.isFinite(requestedCount) ? Math.max(4, Math.min(20, Math.round(requestedCount))) : 8;
  const difficulty = typeof (body as Record<string, unknown>).difficulty === 'string'
    ? String((body as Record<string, unknown>).difficulty).trim()
    : 'mixed';
  const rawQuestionType = typeof (body as Record<string, unknown>).questionType === 'string'
    ? String((body as Record<string, unknown>).questionType).trim().toLowerCase()
    : 'mixed';
  const questionType: 'mcq' | 'short' | 'long' | 'mixed' =
    rawQuestionType === 'mcq' || rawQuestionType === 'short' || rawQuestionType === 'long' || rawQuestionType === 'mixed'
      ? rawQuestionType
      : 'mixed';
  return { chapterId, questionCount, difficulty: difficulty || 'mixed', questionType };
}

function allocateQuestionCounts(total: number, questionType: 'mcq' | 'short' | 'long' | 'mixed'): {
  mcqCount: number;
  shortCount: number;
  longCount: number;
} {
  if (questionType === 'mcq') return { mcqCount: total, shortCount: 0, longCount: 0 };
  if (questionType === 'short') return { mcqCount: 0, shortCount: total, longCount: 0 };
  if (questionType === 'long') return { mcqCount: 0, shortCount: 0, longCount: total };
  if (total <= 1) return { mcqCount: 1, shortCount: 0, longCount: 0 };
  if (total === 2) return { mcqCount: 1, shortCount: 1, longCount: 0 };
  if (total === 3) return { mcqCount: 1, shortCount: 1, longCount: 1 };

  let mcqCount = Math.max(1, Math.round(total * 0.5));
  let shortCount = Math.max(1, Math.round(total * 0.3));
  let longCount = Math.max(1, total - mcqCount - shortCount);

  let sum = mcqCount + shortCount + longCount;
  while (sum > total) {
    if (mcqCount >= shortCount && mcqCount >= longCount && mcqCount > 1) {
      mcqCount -= 1;
    } else if (shortCount >= longCount && shortCount > 1) {
      shortCount -= 1;
    } else if (longCount > 1) {
      longCount -= 1;
    } else if (mcqCount > 0) {
      mcqCount -= 1;
    } else {
      break;
    }
    sum = mcqCount + shortCount + longCount;
  }
  while (sum < total) {
    mcqCount += 1;
    sum += 1;
  }

  return { mcqCount, shortCount, longCount };
}

function buildShortAnswerPrompt(topic: string, chapterTitle: string, variant = 0): string {
  const stems = [
    `Write a concise 2-3 mark answer on "${topic}" from ${chapterTitle}. Include definition, key point, and one application/example.`,
    `For ${chapterTitle}, explain "${topic}" in a board-style short answer (2-3 marks) with one textbook example.`,
    `Give a short-answer response for "${topic}" from ${chapterTitle}: definition + core idea + one use-case.`,
  ];
  return stems[variant % stems.length];
}

function buildLongAnswerPrompt(topic: string, chapterTitle: string, variant = 0): string {
  const stems = [
    `Write a board-style 5-mark long answer on "${topic}" from ${chapterTitle}. Include structured steps, core concept/formula, and a concluding statement.`,
    `Prepare a detailed long-answer response (5 marks) for "${topic}" in ${chapterTitle} with explanation, formula/process, and final inference.`,
    `Draft a full-length board answer for "${topic}" from ${chapterTitle}, covering concept, derivation/process, and exam-ready conclusion.`,
  ];
  return stems[variant % stems.length];
}

function buildFallbackDrill(
  chapterId: string,
  questionCount: number,
  difficulty: string,
  questionType: 'mcq' | 'short' | 'long' | 'mixed'
): ChapterDrillResponse | null {
  const chapter = getChapterById(chapterId);
  if (!chapter) return null;
  const { mcqCount, shortCount, longCount } = allocateQuestionCounts(questionCount, questionType);
  const fromChapter: MCQItem[] = (chapter.quizzes ?? []).map((quiz) => ({
    question: quiz.question,
    options: quiz.options,
    answer: quiz.correctAnswerIndex,
    explanation: quiz.explanation ?? 'Revise this concept from chapter notes and PYQs.',
  }));

  const generated: MCQItem[] = fromChapter.length > 0
    ? fromChapter
    : Array.from({ length: Math.max(1, mcqCount) }, (_, index) => {
        const topic = chapter.topics[index % Math.max(1, chapter.topics.length)] ?? chapter.title;
        return {
          question: `Which statement is most accurate for "${topic}" in ${chapter.title}?`,
          options: [
            'It is usually ignored in board exams.',
            'It is a high-yield concept requiring definition + application.',
            'It only appears in practical exams.',
            'It is not part of NCERT scope.',
          ],
          answer: 1,
          explanation: `${topic} should be revised with concept clarity and board-style examples.`,
        };
      });

  const normalized = normalizeMCQs(generated);
  const expanded = normalized.length >= mcqCount
    ? normalized
    : mcqCount > 0
      ? [
        ...normalized,
        ...Array.from({ length: mcqCount - normalized.length }, (_, idx) => {
          const topic = chapter.topics[idx % Math.max(1, chapter.topics.length)] ?? chapter.title;
          return {
            question: `Board drill check: what is the most important exam angle of "${topic}" in ${chapter.title}?`,
            options: [
              'Formula and concept clarity with solved examples',
              'Skip this topic because it is never asked',
              'Only practical file work is needed',
              'Only memorize definitions without application',
            ],
            answer: 0,
            explanation: `For ${topic}, prioritize concept + formula + PYQ application.`,
          };
        }),
      ]
      : [];
  const questions = mcqCount > 0 ? normalizeMCQs(expanded).slice(0, mcqCount) : [];
  const shortQuestions = shortCount > 0
    ? cleanTextList(
        Array.from({ length: shortCount }, (_, idx) => {
          const topic = chapter.topics[idx % Math.max(1, chapter.topics.length)] ?? chapter.title;
          return buildShortAnswerPrompt(topic, chapter.title);
        }),
        shortCount
      )
    : [];
  const longQuestions = longCount > 0
    ? cleanTextList(
        Array.from({ length: longCount }, (_, idx) => {
          const topic = chapter.topics[idx % Math.max(1, chapter.topics.length)] ?? chapter.title;
          return buildLongAnswerPrompt(topic, chapter.title);
        }),
        longCount
      )
    : [];
  return {
    chapterId: chapter.id,
    difficulty,
    questionType,
    questions,
    shortQuestions,
    longQuestions,
    answerKey: questions.map((item) => item.answer),
    topicCoverage: chapter.topics.slice(0, 10),
    sourceCitations: [],
  };
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(
    (token) => !['which', 'what', 'following', 'correct', 'statement', 'about', 'this', 'that'].includes(token)
  );
}

function isQuestionAligned(question: string, chapterTitle: string, chapterTopics: string[]): boolean {
  const allow = new Set(tokenize(`${chapterTitle} ${chapterTopics.join(' ')}`));
  const questionTokens = tokenize(question);
  if (questionTokens.length === 0) return false;
  return questionTokens.some((token) => allow.has(token));
}

function buildGenericQuestion(topic: string, chapterTitle: string, variant = 0): MCQItem {
  const stems = [
    `In ${chapterTitle}, which statement about "${topic}" is most exam-relevant?`,
    `For ${chapterTitle}, what is the most accurate board-level understanding of "${topic}"?`,
    `Which option best captures the NCERT idea of "${topic}" in ${chapterTitle}?`,
  ];
  return {
    question: `${stems[variant % stems.length]} (Set ${variant + 1})`,
    options: [
      'Apply concept + formula with correct units/sign convention.',
      'Memorize one definition only and skip applications.',
      'Ignore this topic because it never appears in boards.',
      'Attempt without showing intermediate steps.',
    ],
    answer: 0,
    explanation: `Board scoring improves when ${topic} is solved with concept, formula, and final-unit checks.`,
  };
}

function ensureExactPromptCount(
  items: string[],
  fallbackItems: string[],
  questionCount: number,
  chapterTitle: string,
  chapterTopics: string[],
  kind: 'short' | 'long'
): string[] {
  const cleaned = cleanTextList(items, questionCount);
  const output = [...cleaned];
  const used = new Set(output.map((item) => item.toLowerCase()));
  for (const item of cleanTextList(fallbackItems, questionCount)) {
    if (output.length >= questionCount) break;
    const key = item.toLowerCase();
    if (used.has(key)) continue;
    output.push(item);
    used.add(key);
  }

  let cursor = 0;
  while (output.length < questionCount && cursor < questionCount * 10) {
    const topic = chapterTopics[cursor % Math.max(1, chapterTopics.length)] ?? chapterTitle;
    const generated = kind === 'long'
      ? buildLongAnswerPrompt(topic, chapterTitle, cursor)
      : buildShortAnswerPrompt(topic, chapterTitle, cursor);
    const key = generated.toLowerCase();
    if (!used.has(key)) {
      output.push(generated);
      used.add(key);
    }
    cursor += 1;
  }

  if (output.length < questionCount) {
    for (let index = output.length; index < questionCount; index += 1) {
      const topic = chapterTopics[index % Math.max(1, chapterTopics.length)] ?? chapterTitle;
      const forced = kind === 'long'
        ? `Long-answer checkpoint ${index + 1}: Explain "${topic}" from ${chapterTitle} with structure, concept, and conclusion.`
        : `Short-answer checkpoint ${index + 1}: State "${topic}" from ${chapterTitle} with definition and one application.`;
      const key = forced.toLowerCase();
      if (!used.has(key)) {
        output.push(forced);
        used.add(key);
      }
    }
  }

  return cleanTextList(output, questionCount);
}

function ensureExactDrillCount(
  items: MCQItem[],
  fallbackItems: MCQItem[],
  chapterTitle: string,
  chapterTopics: string[],
  questionCount: number
): MCQItem[] {
  const normalized = normalizeMCQs(items);
  const output = normalized.slice(0, questionCount);
  const used = new Set(output.map((item) => item.question.trim().toLowerCase()));

  for (const item of fallbackItems) {
    if (output.length >= questionCount) break;
    const key = item.question.trim().toLowerCase();
    if (used.has(key)) continue;
    output.push(item);
    used.add(key);
  }

  let cursor = 0;
  while (output.length < questionCount && cursor < questionCount * 10) {
    const topic = chapterTopics[cursor % Math.max(1, chapterTopics.length)] ?? chapterTitle;
    const generated = buildGenericQuestion(topic, chapterTitle, cursor);
    const key = generated.question.trim().toLowerCase();
    if (!used.has(key)) {
      output.push(generated);
      used.add(key);
    }
    cursor += 1;
  }

  if (output.length < questionCount) {
    for (let index = output.length; index < questionCount; index += 1) {
      const topic = chapterTopics[index % Math.max(1, chapterTopics.length)] ?? chapterTitle;
      const forced = buildGenericQuestion(topic, chapterTitle, 100 + index);
      const key = forced.question.trim().toLowerCase();
      if (!used.has(key)) {
        output.push(forced);
        used.add(key);
      }
    }
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
      key: buildRateLimitKey('ai:chapter-drill', [context?.authUserId || getClientIp(req), context?.schoolId]),
      windowSeconds: 60,
      maxRequests: 15,
      blockSeconds: 120,
    });
    if (!limit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many requests. Please try again later.',
        hint: `Retry after ${limit.retryAfterSeconds}s`,
        status: 429,
      });
    }

    const bodyResult = await parseAndValidateJsonBody(req, 64 * 1024, chapterDrillRequestSchema);
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
        errorCode: 'invalid-chapter-drill-input',
        message: 'Invalid request. Required: { chapterId, questionCount?, difficulty? }',
        status: 400,
      });
    }
    const projectedOutputTokens = Math.min(3600, 900 + parsed.questionCount * 170);
    const tokenBudget = await checkAiTokenBudget({
      context,
      endpoint: '/api/chapter-drill',
      projectedInputText: JSON.stringify(body),
      projectedOutputTokens,
    });
    if (!tokenBudget.allowed) {
      return errorJson({
        requestId,
        errorCode: tokenBudget.reason || 'token-cap-exceeded',
        message: 'AI usage limit reached for chapter drill generation.',
        status: 429,
        hint: `Retry after ${tokenBudget.retryAfterSeconds ?? 300}s`,
      });
    }

    const chapter = getChapterById(parsed.chapterId);
    if (!chapter) {
      return errorJson({
        requestId,
        errorCode: 'chapter-not-found',
        message: 'Chapter not found.',
        status: 404,
      });
    }

    const pyq = (await getGroundedPYQData(parsed.chapterId)) ?? getPYQData(parsed.chapterId);
    const contextPack = await getContextPack({
      task: 'chapter-drill',
      classLevel: chapter.classLevel,
      subject: chapter.subject,
      chapterId: chapter.id,
      chapterTopics: chapter.topics,
      query: `chapter drill ${chapter.title} ${parsed.difficulty}`,
      topK: 6,
    });

    const { mcqCount, shortCount, longCount } = allocateQuestionCounts(parsed.questionCount, parsed.questionType);
    const fallback = buildFallbackDrill(parsed.chapterId, parsed.questionCount, parsed.difficulty, parsed.questionType);
    if (!fallback) {
      return errorJson({
        requestId,
        errorCode: 'chapter-drill-fallback-failed',
        message: 'Unable to create chapter drill.',
        status: 500,
      });
    }
    const fallbackQuestions = annotateQuestionsWithRagMeta(fallback.questions, {
      chapterTitle: chapter.title,
      chapterTopics: chapter.topics,
      pyqTopics: pyq?.importantTopics ?? [],
      contextSnippets: contextPack.snippets,
    });
    const annotatedFallback: ChapterDrillResponse = {
      ...fallback,
      questions: fallbackQuestions,
      answerKey: fallbackQuestions.map((item) => item.answer),
    };

    const textbookCount = contextPack.snippets.filter((s) => s.sourceType === 'textbook').length;
    const paperCount = contextPack.snippets.filter((s) => s.sourceType !== 'textbook').length;
    const topicList = chapter.topics.slice(0, 12).join(', ');
    const prompt = `Create a CBSE board-style drill for:
Chapter: "${chapter.title}" (${chapter.subject}, Class ${chapter.classLevel})
Topics to cover: ${topicList}
Total questions: MCQ ${mcqCount}, Short ${shortCount}, Long ${longCount}
Difficulty: ${parsed.difficulty}
PYQ signal: ${pyq ? `avg marks ${pyq.avgMarks} | top topics: ${pyq.importantTopics.slice(0, 6).join(', ')}` : 'No PYQ record'}
Context available: ${textbookCount} NCERT textbook + ${paperCount} board-paper snippets

GROUNDING REQUIREMENT:
- MCQ distractors must use NCERT-language errors (not generic options).
- Short/Long questions must reference specific chapter concepts, reactions, or diagrams from the context.
- PYQ topics must appear in at least 50% of questions.
- Cover every topic listed above across the question set.

Return ONLY JSON:
{
  "chapterId":"${chapter.id}",
  "difficulty":"${parsed.difficulty}",
  "questionType":"${parsed.questionType}",
  "questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}],
  "shortQuestions":["..."],
  "longQuestions":["..."],
  "answerKey":[0,1,2],
  "topicCoverage":["..."],
  "sourceCitations":[{"sourcePath":"...","year":2024}]
}`;
    const variation = buildVariationProfile({
      task: 'chapter-drill',
      contextHash: contextPack.contextHash,
      chapterId: chapter.id,
      difficulty: parsed.difficulty,
    });
    const subjectAddendum = buildSubjectSystemPromptAddendum(chapter.subject, chapter.classLevel);
    const fewShotBlock = getFewShotExamples(chapter.subject, chapter.classLevel);
    const promptWithVariation = `${prompt}
${buildVariationInstruction(variation)}${fewShotBlock ? `\n\n${fewShotBlock}` : ''}`;

    try {
      const { data, result } = await generateTaskJson<ChapterDrillResponse>({
        task: 'chapter-drill',
        contextHash: contextPack.contextHash,
        contextSnippets: contextPack.snippets,
        chapterId: chapter.id,
        difficulty: parsed.difficulty,
        diversityKey: variation.diversityKey,
        systemPrompt: `You are VidyaAI Chapter Drill Engine — generating authentic CBSE board-exam questions.

GROUNDING (MANDATORY): Use the "Retrieved Paper Context" snippets as your PRIMARY source. Every question must be directly derived from a concept, law, formula, chemical reaction, diagram label, biological process, or numerical example present in those snippets or the NCERT chapter.

FOR MCQs — CBSE board question taxonomy (use this mix):
• Type 1 – DIRECT RECALL (30%): "Define / Name / State the law / Write the formula" style stem; tests exact NCERT language
• Type 2 – APPLICATION (35%): "Calculate / Find / Why does X happen / Predict the product of" — apply the concept to a new situation
• Type 3 – ASSERTION-REASON (15%): "Assertion: [A]. Reason: [R]." with standard CBSE 4-option format
  (a) Both A and R are true and R is the correct explanation of A
  (b) Both A and R are true but R is not the correct explanation of A
  (c) A is true but R is false  (d) A is false but R is true
• Type 4 – CASE/DATA-BASED (20%): 1-2 sentence scenario, table, or observation → 1 MCQ with NCERT-grounded distractors

DISTRACTOR QUALITY: Use plausible NCERT-language errors — wrong formula sign, reversed cause-effect, adjacent-chapter confusion, common student misconception. Never use nonsense or generic fillers.
EXPLANATIONS: Cite the specific law, formula, or mechanism in 1–2 sentences. Be precise.

FOR SHORT QUESTIONS (2-3 marks): "State/Explain/Differentiate/Write with equation" — exact CBSE 3-mark question patterns.
FOR LONG QUESTIONS (5 marks): "Explain with labelled diagram / Derive the expression / Write the mechanism with equation / Compare with examples" — authentic 5-mark board format.

Match the split EXACTLY: MCQ ${mcqCount}, Short ${shortCount}, Long ${longCount}.
${subjectAddendum ? subjectAddendum + '\n' : ''}Output ONLY valid JSON. No markdown fences.`,
        userPrompt: promptWithVariation,
        temperature: 0.18,
        maxOutputTokens: projectedOutputTokens,
        validate: isChapterDrillResponse,
      });

      const rawAiQuestions = normalizeMCQs(data.questions).filter((item) =>
        isQuestionAligned(item.question, chapter.title, chapter.topics)
      );
      const aiQuestions = await verifySelfCheck(rawAiQuestions, contextPack.snippets);
      const usedQuestionText = new Set(aiQuestions.map((item) => item.question.trim().toLowerCase()));
      const toppedUp = [...aiQuestions];
      for (const fallbackQuestion of fallback.questions) {
        if (toppedUp.length >= mcqCount) break;
        const key = fallbackQuestion.question.trim().toLowerCase();
        if (usedQuestionText.has(key)) continue;
        toppedUp.push(fallbackQuestion);
        usedQuestionText.add(key);
      }
      const questions = mcqCount > 0
        ? ensureExactDrillCount(
            toppedUp,
            annotatedFallback.questions,
            chapter.title,
            chapter.topics,
            mcqCount
          )
        : [];
      const annotatedQuestions = questions.length > 0
        ? annotateQuestionsWithRagMeta(questions, {
            chapterTitle: chapter.title,
            chapterTopics: chapter.topics,
            pyqTopics: pyq?.importantTopics ?? [],
            contextSnippets: contextPack.snippets,
          })
        : [];
      const groundedQuestionSeed = annotatedQuestions.filter(isQuestionStronglyGrounded);
      const hardenedQuestions = mcqCount > 0
        ? ensureExactDrillCount(
            groundedQuestionSeed.length > 0 ? groundedQuestionSeed : annotatedQuestions,
            annotatedFallback.questions,
            chapter.title,
            chapter.topics,
            mcqCount
          )
        : [];
      const finalAnnotatedQuestions = hardenedQuestions.length > 0
        ? annotateQuestionsWithRagMeta(hardenedQuestions, {
            chapterTitle: chapter.title,
            chapterTopics: chapter.topics,
            pyqTopics: pyq?.importantTopics ?? [],
            contextSnippets: contextPack.snippets,
          })
        : [];
      const shortQuestions = shortCount > 0
        ? ensureExactPromptCount(
            Array.isArray(data.shortQuestions) ? data.shortQuestions : [],
            Array.isArray(fallback.shortQuestions) ? fallback.shortQuestions : [],
            shortCount,
            chapter.title,
            chapter.topics,
            'short'
          )
        : [];
      const longQuestions = longCount > 0
        ? ensureExactPromptCount(
            Array.isArray(data.longQuestions) ? data.longQuestions : [],
            Array.isArray(fallback.longQuestions) ? fallback.longQuestions : [],
            longCount,
            chapter.title,
            chapter.topics,
            'long'
          )
        : [];

      const response: ChapterDrillResponse = {
        chapterId: chapter.id,
        difficulty: stripSourceTags(data.difficulty || parsed.difficulty),
        questionType: parsed.questionType,
        questions: finalAnnotatedQuestions,
        shortQuestions,
        longQuestions,
        answerKey: finalAnnotatedQuestions.map((item) => item.answer),
        topicCoverage: cleanTextList(
          Array.isArray(data.topicCoverage) ? data.topicCoverage : fallback.topicCoverage,
          12
        ),
        sourceCitations: normalizeChapterCitations([
          ...contextPack.snippets.map((snippet) => ({ sourcePath: snippet.sourcePath, year: snippet.year })),
          ...(data.sourceCitations ?? []),
        ]),
        grounding: {
          usedPgvector: contextPack.usedPgvector,
          usedOnDemandFallback: contextPack.usedOnDemandFallback,
          retrieval: contextPack.retrievalMeta,
          strongGroundedCount: finalAnnotatedQuestions.filter(isQuestionStronglyGrounded).length,
        },
      };

      await logAiUsage({
        context,
        endpoint: '/api/chapter-drill',
        provider: result.provider,
        model: result.model,
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
        totalTokens: result.usage?.totalTokens,
        estimated: !result.usage,
      });
      return dataJson({ requestId, data: response });
    } catch (aiError) {
      const reason = aiError instanceof Error ? aiError.message : String(aiError);
      logger.warn({ reason }, '[chapter-drill] AI fallback triggered');
      return dataJson({ requestId, data: annotatedFallback });
    }
  } catch (error) {
    logger.error({ err: error }, '[chapter-drill] error');
    const message = error instanceof Error ? error.message : 'Failed to create chapter drill.';
    return errorJson({
      requestId,
      errorCode: 'chapter-drill-failed',
      message,
      status: 500,
    });
  }
}
