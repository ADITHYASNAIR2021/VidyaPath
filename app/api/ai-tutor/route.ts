import { NextRequest, NextResponse } from 'next/server';
import { ALL_CHAPTERS } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskText, type ChatMessage } from '@/lib/ai/generator';
import { trackAiQuestion } from '@/lib/analytics-store';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { logServerEvent } from '@/lib/observability';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

interface ChapterContext {
  chapterId?: string;
  title: string;
  subject: string;
  classLevel: number;
  topics: string[];
}

function buildCurriculum(): string {
  const lines: string[] = [];

  for (const cls of [10, 12] as const) {
    const chapters = ALL_CHAPTERS.filter((chapter) => chapter.classLevel === cls);
    lines.push(`\nCLASS ${cls} (${chapters.length} chapters):`);
    for (const chapter of chapters) {
      const relevance = chapter.examRelevance?.join('/') ?? 'Board';
      lines.push(
        `  Ch${chapter.chapterNumber} [${chapter.subject}] ${chapter.title} - ${chapter.marks}M [${relevance}] | Topics: ${chapter.topics.slice(0, 5).join(', ')}`
      );
    }
  }

  return lines.join('\n');
}

const CURRICULUM = buildCurriculum();

const SYSTEM_PROMPT = `You are VidyaAI, a CBSE tutor for VidyaPath.

SCOPE (STRICT)
You only answer:
- Class 10: Science, Mathematics, and English Core (NCERT)
- Class 12: Physics, Chemistry, Biology, Mathematics, and English Core (NCERT)
- CBSE board prep, marking schemes, PYQ trends, study plans
- JEE/NEET foundational relevance for these same topics

If the user asks anything outside scope, reply in this exact format:
OFFTOPIC: <one warm sentence saying what you can help with>

CBSE CURRICULUM CONTEXT
${CURRICULUM}

HOW TO ANSWER
- Keep responses concise, structured, and exam-focused.
- Mention chapter/topic mapping when relevant.
- For numericals: formula, givens, substitution, steps, final answer with unit.
- For theory: one-line definition, key points, and a board-tip line.
- For MCQs: include 4 options and a short explanation.
- For Class 12 topics, mention JEE/NEET relevance briefly when useful.
- If you use retrieved paper context, include source tags like [S1], [S2].

STYLE
- Warm, clear, never condescending.
- Use bold for key terms/formulas.
- Prefer short sections over long paragraphs.
- End with one helpful next-practice suggestion when useful.`;

function normalizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const messages: ChatMessage[] = [];
  input.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const role = record.role;
    const content = record.content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return;
    const trimmed = content.trim();
    if (!trimmed) return;
    messages.push({ role, content: trimmed } as ChatMessage);
  });
  return messages.slice(-20);
}

function normalizeChapterContext(input: unknown): ChapterContext | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const chapterId = typeof record.chapterId === 'string' ? record.chapterId.trim() : '';
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const subject = typeof record.subject === 'string' ? record.subject.trim() : '';
  const classLevel = typeof record.classLevel === 'number' ? record.classLevel : Number(record.classLevel);
  const topics = Array.isArray(record.topics)
    ? record.topics
        .filter((topic): topic is string => typeof topic === 'string')
        .map((topic) => topic.trim())
        .filter(Boolean)
    : [];

  if (!title || !subject || Number.isNaN(classLevel) || topics.length === 0) {
    return undefined;
  }

  return { chapterId: chapterId || undefined, title, subject, classLevel, topics };
}

function fallbackError(error: unknown, requestId?: string): NextResponse {
  const message = error instanceof Error ? error.message : 'No response from AI. Please try again.';
  if (message.toLowerCase().includes('configured')) {
    return errorJson({
      requestId: requestId || 'unknown',
      errorCode: 'ai-provider-not-configured',
      message: 'AI tutor not configured. Set GEMINI_API_KEY (primary) or GROQ_API_KEY (backup).',
      status: 503,
    });
  }
  return errorJson({
    requestId: requestId || 'unknown',
    errorCode: 'ai-upstream-failed',
    message: 'No response from AI. Please try again.',
    status: 502,
  });
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const { context, response } = await requireInteractiveAuth();
    if (response) return response;

    const limit = await checkRateLimit({
      key: buildRateLimitKey('ai:chat', [context?.authUserId || getClientIp(req), context?.schoolId]),
      windowSeconds: 60,
      maxRequests: 24,
      blockSeconds: 120,
    });
    if (!limit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many AI tutor requests. Please try again shortly.',
        status: 429,
        hint: `Retry after ${limit.retryAfterSeconds}s`,
      });
    }

    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 48 * 1024);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
      });
    }
    const body = bodyResult.value;
    if (!body || typeof body !== 'object') {
      return errorJson({
        requestId,
        errorCode: 'invalid-request-body',
        message: 'Invalid request body',
        status: 400,
      });
    }

    const payload = body;
    const messages = normalizeMessages(payload.messages);
    const chapterContext = normalizeChapterContext(payload.chapterContext);

    if (messages.length === 0) {
      return errorJson({
        requestId,
        errorCode: 'invalid-chat-messages',
        message: 'Invalid request',
        status: 400,
      });
    }

    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const pyq = chapterContext?.chapterId ? getPYQData(chapterContext.chapterId) : null;
    const contextPack = chapterContext
      ? await getContextPack({
          task: 'chat',
          classLevel: chapterContext.classLevel,
          subject: chapterContext.subject,
          chapterId: chapterContext.chapterId,
          chapterTopics: chapterContext.topics,
          query: lastUserMessage,
          topK: 4,
        })
      : { snippets: [], contextHash: 'no-context', usedOnDemandFallback: false };

    const chapterPin = chapterContext
      ? `\n==============================================\nCURRENT CHAPTER (student is studying this now)\n==============================================\nChapter: ${chapterContext.title}\nSubject: ${chapterContext.subject} | Class: ${chapterContext.classLevel}\nTopics: ${chapterContext.topics.join(', ')}\n${
          pyq
            ? `PYQ signal: asked in ${pyq.yearsAsked.length} years (${[...pyq.yearsAsked].sort((a, b) => b - a).slice(0, 6).join(', ')}), avg marks ${pyq.avgMarks}, high-yield topics: ${pyq.importantTopics.join(', ')}.`
            : ''
        }\nPrioritize this chapter when the question is aligned with it.`
      : '';

    const fullSystemPrompt = `${SYSTEM_PROMPT}${chapterPin}`;

    const generated = await generateTaskText({
      task: 'chat',
      contextHash: contextPack.contextHash,
      contextSnippets: contextPack.snippets,
      chapterId: chapterContext?.chapterId,
      includeCitations: true,
      systemPrompt: fullSystemPrompt,
      userPrompt: lastUserMessage,
      messages,
      temperature: 0.4,
      maxOutputTokens: 2048,
    });

    const rawMessage = generated.text.trim();
    const isOffTopic = rawMessage.startsWith('OFFTOPIC:');
    const message = isOffTopic ? rawMessage.replace(/^OFFTOPIC:\s*/i, '').trim() : rawMessage;
    if (chapterContext?.chapterId) {
      trackAiQuestion(chapterContext.chapterId).catch(() => {
        // best-effort analytics only
      });
    }
    await logAiUsage({
      context,
      endpoint: '/api/ai-tutor',
      provider: generated.provider,
      model: generated.model,
      promptText: lastUserMessage,
      completionText: message,
      requestId,
      estimated: true,
    });
    logServerEvent({
      event: 'ai-tutor-response',
      requestId,
      endpoint: '/api/ai-tutor',
      role: context?.role,
      schoolId: context?.schoolId,
      statusCode: 200,
    });

    return dataJson({
      requestId,
      data: { message, isOffTopic },
    });
  } catch (error) {
    console.error('AI tutor route error:', error);
    logServerEvent({
      level: 'error',
      event: 'ai-tutor-error',
      requestId,
      endpoint: '/api/ai-tutor',
      statusCode: 502,
    });
    return fallbackError(error, requestId);
  }
}
