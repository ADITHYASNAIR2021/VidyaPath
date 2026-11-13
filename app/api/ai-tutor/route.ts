import { withAiMetrics } from '@/lib/ai/with-ai-metrics';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ALL_CHAPTERS } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { getGroundedPYQData } from '@/lib/pyq-grounded';
import { getContextPack, type ContextPack } from '@/lib/ai/context-retriever';
import { buildEvidenceBundle, buildStudentPracticeSignal } from '@/lib/ai/evidence-ux';
import { generateTaskJson, type ChatMessage } from '@/lib/ai/generator';
import { checkAiTokenBudget } from '@/lib/ai/token-budget';
import { requirePublicAiAccess } from '@/lib/ai/public-access';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { aiTutorRequestSchema } from '@/lib/schemas/ai';
import { logServerEvent } from '@/lib/observability';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { buildSafeSystemPrompt } from '@/lib/ai/content-safety';
import { getStudentSafetyIntervention } from '@/lib/ai/student-safety';

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

function clip(value: unknown, max: number): string {
  if (typeof value === 'string') return value.trim().slice(0, max);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).slice(0, max);
  if (Array.isArray(value)) return value.map((item) => clip(item, max)).filter(Boolean).join(' ').slice(0, max);
  return '';
}

/** Turns a nested object/array answer into readable text (models sometimes nest the answer). */
function flattenToText(value: unknown, max: number, depth = 0): string {
  if (value === null || value === undefined || depth > 4) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return clip(value, max);
  if (Array.isArray(value)) {
    return value.map((item) => flattenToText(item, max, depth + 1)).filter(Boolean).map((line) => `- ${line}`).join('\n').slice(0, max);
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = flattenToText(item, max, depth + 1);
        if (!text) return '';
        const label = key.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
        return `**${label}:** ${text}`;
      })
      .filter(Boolean)
      .join('\n\n')
      .slice(0, max);
  }
  return '';
}

/**
 * Models often return valid tutoring JSON that is slightly off-spec (5 bullet points,
 * a long explanation, a missing optional field). Normalise it so only a missing/empty
 * answer is treated as a failure.
 */
function coerceTutorResponse(value: unknown): TutorResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const answer = flattenToText(raw.answer ?? raw.response ?? raw.message, 8000);
  if (!answer) return null;
  const whyRaw = Array.isArray(raw.whyThisAnswer) ? raw.whyThisAnswer : raw.whyThisAnswer ? [raw.whyThisAnswer] : [];
  const whyThisAnswer = whyRaw.map((item) => clip(item, 260)).filter(Boolean).slice(0, 4);
  const candidate = {
    offTopic: raw.offTopic === true || raw.offTopic === 'true',
    offTopicMessage: clip(raw.offTopicMessage, 320),
    answer,
    whyThisAnswer: whyThisAnswer.length > 0 ? whyThisAnswer : ['Based on the NCERT chapter content for this topic.'],
    diagnoseMistake: clip(raw.diagnoseMistake, 500) || 'Check whether the core definition and its conditions are clear.',
    explanation: clip(raw.explanation, 2000) || answer.slice(0, 2000),
    easierQuestion: clip(raw.easierQuestion, 500) || 'Can you state the key definition from this topic in one line?',
    similarQuestion: clip(raw.similarQuestion, 500) || 'Try one more NCERT in-text question on the same concept.',
    examQuestion: clip(raw.examQuestion, 700) || 'Attempt a 3-mark board question on this concept from a previous year paper.',
    revisitPlan: clip(raw.revisitPlan, 400) || 'Revisit this topic tomorrow and again before your next test.',
  };
  const parsed = tutorResponseSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

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
- Class 12: Physics, Chemistry, Biology, Mathematics, English Core, Accountancy, Business Studies, and Economics (NCERT/CBSE)
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
- Return only valid JSON with exactly these keys (all values are plain strings except where noted):
{
  "offTopic": false,
  "offTopicMessage": "",
  "answer": "the full answer for the student (markdown allowed)",
  "whyThisAnswer": ["1 to 4 short reasons or evidence cues"],
  "diagnoseMistake": "likely confusion behind the question",
  "explanation": "a slightly deeper explanation",
  "easierQuestion": "an easier practice question",
  "similarQuestion": "a similar practice question",
  "examQuestion": "a board-style 3-5 mark question",
  "revisitPlan": "when/why to revisit"
}
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

async function handlePost(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const { response } = await requirePublicAiAccess(req);
    if (response) return response;

    const limit = await checkRateLimit({
      key: buildRateLimitKey('ai:chat', [getClientIp(req)]),
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
    const safetyIntervention = getStudentSafetyIntervention(lastUserMessage);
    if (safetyIntervention) {
      return dataJson({
        requestId,
        data: {
          responseId: `safety-${requestId}`,
          message: safetyIntervention.message,
          isOffTopic: true,
          sources: [],
          safety: { intervention: true, kind: safetyIntervention.kind },
          quality: {
            provider: 'local-guardrail',
            model: 'deterministic-student-safety-v1',
            latencyMs: 0,
            groundednessScore: 100,
            citationCoverageScore: 100,
            retrievalMiss: false,
            repaired: false,
            retrievalConfidence: 100,
            retrievalConfidenceLevel: 'high',
          },
        },
      });
    }
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

    // No accounts: practice history lives on the student's device, so the tutor
    // starts every conversation without server-side history.
    const recentHistory = {
      attempted: 0,
      accuracyRate: null,
      weakQuestions: [] as string[],
      recentQuestions: [] as string[],
    };
    const practiceSignal = buildStudentPracticeSignal({
      attempted: recentHistory.attempted,
      accuracyRate: recentHistory.accuracyRate,
      weakQuestions: recentHistory.weakQuestions,
    });
    const chapterPin = buildChapterPin(chapterContext, pyq);
    const fullSystemPrompt = buildSafeSystemPrompt(`${SYSTEM_PROMPT}

${chapterPin ? `${chapterPin}\n` : ''}STUDENT PRACTICE SIGNAL
${practiceSignal.summary}
Performance band: ${practiceSignal.performanceBand}
Review urgency: ${practiceSignal.reviewUrgency}
Recent weak questions: ${recentHistory.weakQuestions.slice(0, 3).join(' | ') || 'none'}
Recent asked questions: ${recentHistory.recentQuestions.slice(0, 3).join(' | ') || 'none'}`);

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
      validate: (value): value is TutorResponse => coerceTutorResponse(value) !== null,
      qualityMeta: {
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
    const tutor = coerceTutorResponse(generated.data) ?? generated.data;
    const isOffTopic = tutor.offTopic === true;
    const message = isOffTopic ? tutor.offTopicMessage || tutor.answer : tutor.answer;

    await logAiUsage({
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
      details: { error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) },
    });
    return fallbackError(error, requestId);
  }
}

export const POST = withAiMetrics('/api/ai-tutor', handlePost);
