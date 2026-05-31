import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ALL_CHAPTERS } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { getGroundedPYQData } from '@/lib/pyq-grounded';
import { getContextPack, type ContextPack } from '@/lib/ai/context-retriever';
import { buildEvidenceBundle, buildStudentPracticeSignal } from '@/lib/ai/evidence-ux';
import { generateTaskJson, type ChatMessage } from '@/lib/ai/generator';
import { getRecentQuestionHistory } from '@/lib/ai/question-history';
import { checkAiTokenBudget } from '@/lib/ai/token-budget';
import { trackAiQuestion } from '@/lib/analytics-store';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { aiTutorRequestSchema } from '@/lib/schemas/ai';
import { logServerEvent } from '@/lib/observability';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

interface ChapterContext {
  chapterId?: string;
  title: string;
  subject: string;
  classLevel: number;
  topics: string[];
}

const tutorResponseSchema = z.object({
  offTopic: z.boolean().default(false),
  offTopicMessage: z.string().trim().max(320).default(''),
  answer: z.string().trim().min(1).max(8000),
  whyThisAnswer: z.array(z.string().trim().min(1).max(260)).min(1).max(4),
  diagnoseMistake: z.string().trim().min(1).max(500),
  explanation: z.string().trim().min(1).max(2000),
  easierQuestion: z.string().trim().min(1).max(500),
  similarQuestion: z.string().trim().min(1).max(500),
  examQuestion: z.string().trim().min(1).max(700),
  revisitPlan: z.string().trim().min(1).max(400),
});

type TutorResponse = z.infer<typeof tutorResponseSchema>;

function buildCurriculum(): string {
  const lines: string[] = [];
  for (const cls of [10, 12] as const) {
    const chapters = ALL_CHAPTERS.filter((chapter) => chapter.classLevel === cls);
    lines.push(`CLASS ${cls} (${chapters.length} chapters):`);
    for (const chapter of chapters) {
      const relevance = chapter.examRelevance?.join('/') ?? 'Board';
      lines.push(
        `  Ch${chapter.chapterNumber} [${chapter.subject}] ${chapter.title} - ${chapter.marks}M [${relevance}] | Topics: ${chapter.topics.slice(0, 5).join(', ')}`
      );
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

const CURRICULUM = buildCurriculum();

const SYSTEM_PROMPT = `You are VidyaAI, a CBSE tutor for VidyaPath.

SCOPE (STRICT)
You only answer:
- Class 10: Science, Mathematics, and English Core (NCERT)
- Class 12: Physics, Chemistry, Biology, Mathematics, and English Core (NCERT)
- CBSE board prep, marking schemes, PYQ trends, study plans
- JEE/NEET foundational relevance for these same topics

CBSE CURRICULUM CONTEXT
${CURRICULUM}

HOW TO TEACH
- Stay concise, exam-focused, and supportive.
- If the answer is a numerical, show formula, substitution, and final answer with unit.
- If the answer is theory, define the key idea and highlight the board-writing points.
- Use source tags like [S1], [S2] inside answer text and explanation text when grounded context is used.
- "whyThisAnswer" must explain the evidence used or the chapter cue used.
- "diagnoseMistake" should infer the student's likely confusion, not blame them.
- "easierQuestion" must be easier than the user ask.
- "similarQuestion" must stay on the same concept.
- "examQuestion" must feel board-style or 3-5 mark ready.
- "revisitPlan" must say when or why the student should return if they are still weak.

OFF-TOPIC HANDLING
- If the user is outside scope, set offTopic=true.
- In that case: offTopicMessage should be one warm sentence, answer should still be a short redirect to what you can help with, and the teaching fields should stay useful but brief.

OUTPUT
- Return only valid JSON.
- No markdown fences.
- No prose before or after the JSON object.`;

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
      message: 'AI tutor not configured. Set NVIDIA_API_KEY (recommended) or GEMINI_API_KEY/GROQ_API_KEY.',
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

function buildChapterPin(chapterContext: ChapterContext | undefined, pyq: Awaited<ReturnType<typeof getGroundedPYQData>> | ReturnType<typeof getPYQData>) {
  if (!chapterContext) return '';
  return `CURRENT CHAPTER
Chapter: ${chapterContext.title}
Subject: ${chapterContext.subject} | Class: ${chapterContext.classLevel}
Topics: ${chapterContext.topics.join(', ')}
${pyq ? `PYQ signal: asked in ${pyq.yearsAsked.length} years (${[...pyq.yearsAsked].sort((a, b) => b - a).slice(0, 6).join(', ')}), avg marks ${pyq.avgMarks}, high-yield topics: ${pyq.importantTopics.join(', ')}.` : ''}
Prioritize this chapter when the question is aligned with it.`;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const { context, response } = await requireInteractiveAuth(req);
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

    const bodyResult = await parseAndValidateJsonBody(req, 48 * 1024, aiTutorRequestSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }

    const payload = bodyResult.value as Record<string, unknown>;
    const tokenBudget = await checkAiTokenBudget({
      context,
      endpoint: '/api/ai-tutor',
      projectedInputText: JSON.stringify(payload),
      projectedOutputTokens: 2600,
    });
    if (!tokenBudget.allowed) {
      return errorJson({
        requestId,
        errorCode: tokenBudget.reason || 'token-cap-exceeded',
        message: 'AI usage limit reached for this account. Please try again later.',
        status: 429,
        hint: `Retry after ${tokenBudget.retryAfterSeconds ?? 300}s`,
      });
    }

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
    const pyq = chapterContext?.chapterId
      ? (await getGroundedPYQData(chapterContext.chapterId)) ?? getPYQData(chapterContext.chapterId)
      : null;
    const contextPack: ContextPack = chapterContext
      ? await getContextPack({
          task: 'chat',
          classLevel: chapterContext.classLevel,
          subject: chapterContext.subject,
          chapterId: chapterContext.chapterId,
          chapterTopics: chapterContext.topics,
          query: lastUserMessage,
          topK: 4,
        })
      : {
          snippets: [],
          contextHash: 'no-context',
          usedOnDemandFallback: false,
          usedPgvector: false,
        };

    const recentHistory =
      context?.role === 'student' && chapterContext?.chapterId
        ? await getRecentQuestionHistory({
            authUserId: context.authUserId,
            chapterId: chapterContext.chapterId,
            limit: 8,
          })
        : { recentHashes: [], recentQuestions: [], attempted: 0, accuracyRate: null, weakQuestions: [] };
    const practiceSignal = buildStudentPracticeSignal({
      attempted: recentHistory.attempted,
      accuracyRate: recentHistory.accuracyRate,
      weakQuestions: recentHistory.weakQuestions,
    });
    const chapterPin = buildChapterPin(chapterContext, pyq);
    const fullSystemPrompt = `${SYSTEM_PROMPT}

${chapterPin ? `${chapterPin}\n` : ''}STUDENT PRACTICE SIGNAL
${practiceSignal.summary}
Performance band: ${practiceSignal.performanceBand}
Review urgency: ${practiceSignal.reviewUrgency}
Recent weak questions: ${recentHistory.weakQuestions.slice(0, 3).join(' | ') || 'none'}
Recent asked questions: ${recentHistory.recentQuestions.slice(0, 3).join(' | ') || 'none'}`;

    const generated = await generateTaskJson<TutorResponse>({
      task: 'chat',
      contextHash: contextPack.contextHash,
      contextSnippets: contextPack.snippets,
      chapterId: chapterContext?.chapterId,
      includeCitations: true,
      systemPrompt: fullSystemPrompt,
      userPrompt: lastUserMessage,
      messages,
      temperature: 0.3,
      maxOutputTokens: 2600,
      validate: (value): value is TutorResponse => tutorResponseSchema.safeParse(value).success,
      qualityMeta: {
        schoolId: context?.schoolId,
        authUserId: context?.authUserId,
        role: context?.role,
        subject: chapterContext?.subject,
        chapterId: chapterContext?.chapterId,
        endpoint: '/api/ai-tutor',
        requestId,
        responseId: `chat-${requestId}`,
        promptVersion: 'vidyai-answer-v2',
        routingKey: 'chat-evidence-first',
        retrievalConfidence: contextPack.retrievalMeta?.confidence,
        retrievalConfidenceLevel: contextPack.retrievalMeta?.confidenceLevel,
        retrievalAvgRelevance: contextPack.retrievalMeta?.averageRelevance,
      },
    });

    const evidence = buildEvidenceBundle({ contextPack, chapterContext });
    const tutor = generated.data;
    const isOffTopic = tutor.offTopic === true;
    const message = isOffTopic ? tutor.offTopicMessage || tutor.answer : tutor.answer;

    if (chapterContext?.chapterId) {
      trackAiQuestion(chapterContext.chapterId).catch(() => {
        // best-effort analytics only
      });
    }

    await logAiUsage({
      context,
      endpoint: '/api/ai-tutor',
      provider: generated.result.provider,
      model: generated.result.model,
      promptTokens: generated.result.usage?.promptTokens,
      completionTokens: generated.result.usage?.completionTokens,
      totalTokens: generated.result.usage?.totalTokens,
      requestId,
      estimated: !generated.result.usage,
    });

    logServerEvent({
      event: 'ai-tutor-response',
      requestId,
      endpoint: '/api/ai-tutor',
      role: context?.role,
      schoolId: context?.schoolId,
      statusCode: 200,
    });

    const sources = evidence.textbookSnippets.map((source) => ({
      sourcePath: source.sourcePath,
      chapterId: source.chapterId,
      page: source.page,
      locatorHint: source.locatorHint,
      sourceType: source.sourceType,
      relevanceScore: source.relevanceScore,
      snippet: source.snippet,
      sourceLabel: source.sourceLabel,
    }));

    return dataJson({
      requestId,
      data: {
        responseId: `chat-${requestId}`,
        message,
        isOffTopic,
        sources,
        evidence: {
          ...evidence,
          whyThisAnswer: tutor.whyThisAnswer,
        },
        teaching: {
          diagnoseMistake: tutor.diagnoseMistake,
          explanation: tutor.explanation,
          easierQuestion: tutor.easierQuestion,
          similarQuestion: tutor.similarQuestion,
          examQuestion: tutor.examQuestion,
          revisitPlan: tutor.revisitPlan,
          practiceSignal,
        },
        quality: {
          provider: generated.result.provider,
          model: generated.result.model,
          latencyMs: generated.result.latencyMs,
          groundednessScore: generated.quality.groundednessScore,
          citationCoverageScore: generated.quality.citationCoverageScore,
          retrievalMiss: generated.quality.retrievalMiss,
          repaired: generated.quality.repaired,
          retrievalConfidence: evidence.confidence.score,
          retrievalConfidenceLevel: evidence.confidence.level,
        },
      },
    });
  } catch (error) {
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
