import { getPYQData } from '@/lib/pyq';
import { getGroundedPYQData } from '@/lib/pyq-grounded';
import { getChapterById } from '@/lib/data';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskJson } from '@/lib/ai/generator';
import { checkAiTokenBudget } from '@/lib/ai/token-budget';
import { isFlashcardArray, normalizeFlashcards, type FlashcardItem } from '@/lib/ai/validators';
import { buildVariationInstruction, buildVariationProfile } from '@/lib/ai/variation';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { flashcardsRequestSchema } from '@/lib/schemas/ai';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/logger';

function sanitizeUntrustedPromptContext(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1600);
}

function buildGenericFlashcard(subject: string, chapterTitle: string, topic: string, variant: number): FlashcardItem {
  const fronts = [
    `State the key idea of ${topic} from ${chapterTitle}.`,
    `What is the board-important point for ${topic} in ${chapterTitle}?`,
    `Give a concise revision note for ${topic} (${subject}).`,
  ];
  const front = fronts[variant % fronts.length];
  return {
    front: `Revision check ${variant + 1}: ${front}`,
    back: `${topic} should be revised from NCERT definitions, core relations, and standard chapter examples for board answers.`,
  };
}

function isGroundedFlashcard(card: FlashcardItem): boolean {
  const text = `${card.front} ${card.back}`.toLowerCase();
  return !/(exam strategy|time management|score more|answering technique|attempt order)/.test(text);
}

function ensureExactCardCount(
  items: FlashcardItem[],
  chapterCards: FlashcardItem[],
  cardCount: number,
  subject: string,
  chapterTitle: string,
  chapterTopics: string[]
): FlashcardItem[] {
  const output: FlashcardItem[] = [];
  const used = new Set<string>();

  const pushIfUnique = (card: FlashcardItem) => {
    const key = card.front.trim().toLowerCase();
    if (!key || used.has(key)) return;
    used.add(key);
    output.push(card);
  };

  for (const card of normalizeFlashcards(items).filter(isGroundedFlashcard)) {
    if (output.length >= cardCount) break;
    pushIfUnique(card);
  }

  for (const card of normalizeFlashcards(chapterCards)) {
    if (output.length >= cardCount) break;
    pushIfUnique(card);
  }

  let cursor = 0;
  const topics = chapterTopics.length > 0 ? chapterTopics : [chapterTitle || subject];
  while (output.length < cardCount) {
    const topic = topics[cursor % topics.length] ?? chapterTitle;
    pushIfUnique(buildGenericFlashcard(subject, chapterTitle, topic, cursor));
    cursor += 1;
    if (cursor > cardCount * 6) break;
  }

  return normalizeFlashcards(output).slice(0, cardCount);
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(
    (token) => !['which', 'what', 'with', 'from', 'this', 'that', 'chapter'].includes(token)
  );
}

function isFlashcardAlignedToChapter(card: FlashcardItem, chapterTitle: string, chapterTopics: string[]): boolean {
  const chapterTokens = new Set(tokenize(`${chapterTitle} ${chapterTopics.join(' ')}`));
  if (chapterTokens.size === 0) return true;
  const cardTokens = tokenize(`${card.front} ${card.back}`);
  return cardTokens.some((token) => chapterTokens.has(token));
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth(req);
    if (authResponse) return authResponse;

    const limit = await checkRateLimit({
      key: buildRateLimitKey('ai:flashcards', [context?.authUserId || getClientIp(req), context?.schoolId]),
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

    const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, flashcardsRequestSchema);
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
    const cardCount = Math.min(15, Math.max(3, Number(body.cardCount) || 10));

    const tokenBudget = await checkAiTokenBudget({
      context,
      endpoint: '/api/generate-flashcards',
      projectedInputText: JSON.stringify(body),
      projectedOutputTokens: 2500,
    });
    if (!tokenBudget.allowed) {
      return errorJson({
        requestId,
        errorCode: tokenBudget.reason || 'token-cap-exceeded',
        message: 'AI usage limit reached for flashcard generation.',
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

    const chapter = chapterId ? getChapterById(chapterId) : undefined;
    const subject = chapter?.subject ?? incomingSubject;
    const chapterTitle = chapter?.title ?? incomingChapterTitle;
    const classLevel = chapter?.classLevel ?? (typeof body.classLevel === 'number' ? body.classLevel : 12);
    const pyq = chapterId
      ? (await getGroundedPYQData(chapterId)) ?? getPYQData(chapterId)
      : null;

    const contextPack = await getContextPack({
      task: 'flashcards',
      classLevel,
      subject: chapter?.subject ?? subject,
      chapterId: chapter?.id ?? (chapterId || undefined),
      chapterTopics: chapter?.topics ?? [],
      query: `${chapterTitle} ${subject} ${pyq?.importantTopics.join(' ') ?? ''}`.trim(),
      topK: 6,
    });

    const pyqContext = pyq
      ? `PYQ Signal: avg marks ${pyq.avgMarks}, years asked ${[...pyq.yearsAsked].sort((a, b) => b - a).slice(0, 6).join(', ')}, important topics ${pyq.importantTopics.join(', ')}.`
      : 'No PYQ signal available for this chapter.';
    const variation = buildVariationProfile({
      task: 'flashcards',
      contextHash: contextPack.contextHash,
      chapterId: (chapter?.id ?? chapterId) || undefined,
    });

    const schemaNote = `Return ONLY a valid JSON array of exactly ${cardCount} flashcards. No markdown, no extra text.
[{"front": "question or prompt", "back": "the complete factual answer"}]`;

    const userPrompt = `Generate ${cardCount} high-yield revision flashcards for Class ${classLevel} ${subject}, chapter "${chapterTitle}".
${pyqContext}
${nccontext ? `Additional context notes:\n"""\n${nccontext}\n"""` : ''}

Use the Retrieved NCERT Context in the system message as your PRIMARY content source.
Each flashcard must contain ACTUAL ${subject} content — definitions, laws, formulas, reactions, facts, or examples from the chapter.
The "front" is a precise question or prompt. The "back" is the complete, factual NCERT answer — NOT instructions on how to answer.
Cover different topics across the set for broad revision coverage.
${buildVariationInstruction(variation)}

${schemaNote}`;

    const { data, result } = await generateTaskJson<FlashcardItem[]>({
      task: 'flashcards',
      contextHash: contextPack.contextHash,
      contextSnippets: contextPack.snippets,
      chapterId: chapter?.id ?? (chapterId || undefined),
      diversityKey: variation.diversityKey,
      systemPrompt: `You are VidyaAI Flashcard Engine for Class ${classLevel} CBSE ${subject}.
Generate flashcards grounded exclusively in the NCERT chapter content provided in the "Retrieved NCERT Context" section.
Rules:
- Every flashcard must contain actual ${subject} facts from the chapter: definitions, formulas, laws, reactions, named examples, or key processes.
- "front" must be a specific question or prompt (e.g., "What is the SI unit of electric current?", "State Ohm's Law.").
- "back" must be the complete factual answer in plain language — NOT instructions telling the student what to write.
- Do NOT generate cards whose back says "write the core rule" or "explain the concept" — write the actual rule or explanation.
- Prioritize board-exam relevant content identified in the PYQ signal.
- Use simple, precise student-friendly language.
- Do not include citation tokens like [S1] in output.
- Output ONLY a valid JSON array. No markdown fences, no commentary.`,
      userPrompt,
      temperature: 0.2,
      maxOutputTokens: 2500,
      validate: isFlashcardArray,
    });

    const chapterFallbackCards: FlashcardItem[] = (chapter?.flashcards ?? []).map((card) => ({
      front: card.front,
      back: card.back,
    }));

    const exactCards = ensureExactCardCount(
      data,
      chapterFallbackCards,
      cardCount,
      subject,
      chapterTitle,
      chapter?.topics ?? []
    );
    const groundedCards = exactCards.filter((card) =>
      isFlashcardAlignedToChapter(card, chapterTitle, chapter?.topics ?? [])
    );
    const hardenedCards = ensureExactCardCount(
      groundedCards.length > 0 ? groundedCards : exactCards,
      chapterFallbackCards,
      cardCount,
      subject,
      chapterTitle,
      chapter?.topics ?? []
    );

    if (hardenedCards.length === 0) {
      return errorJson({
        requestId,
        errorCode: 'flashcard-no-cards-generated',
        message: 'Could not generate valid flashcards for this chapter. Please try again.',
        status: 500,
      });
    }

    await logAiUsage({
      context,
      endpoint: '/api/generate-flashcards',
      provider: result.provider,
      model: result.model,
      promptTokens: result.usage?.promptTokens,
      completionTokens: result.usage?.completionTokens,
      totalTokens: result.usage?.totalTokens,
      estimated: !result.usage,
    });
    return dataJson({
      requestId,
      data: {
        success: true,
        data: hardenedCards,
        total: hardenedCards.length,
        requested: cardCount,
        grounding: {
          usedPgvector: contextPack.usedPgvector,
          usedOnDemandFallback: contextPack.usedOnDemandFallback,
          retrieval: contextPack.retrievalMeta,
          alignedCount: hardenedCards.filter((card) =>
            isFlashcardAlignedToChapter(card, chapterTitle, chapter?.topics ?? [])
          ).length,
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[generate-flashcards] error');
    const message = error instanceof Error ? error.message : 'Flashcard generation failed.';
    return errorJson({
      requestId,
      errorCode: 'flashcard-generation-failed',
      message: 'Unable to generate flashcards at this time. Please try again.',
      status: 500,
      hint: message,
    });
  }
}
