import { getChapterById } from '@/lib/data';
import { getFrequencyLabel, getPYQData } from '@/lib/pyq';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskJson } from '@/lib/ai/generator';
import {
  cleanTextList,
  isChapterPackResponse,
  normalizeChapterCitations,
  stripSourceTags,
  type ChapterPackResponse,
} from '@/lib/ai/validators';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

interface ChapterPackRequest {
  chapterId: string;
}

function parseRequest(body: unknown): ChapterPackRequest | null {
  if (!body || typeof body !== 'object') return null;
  const chapterId = typeof (body as Record<string, unknown>).chapterId === 'string'
    ? String((body as Record<string, unknown>).chapterId).trim()
    : '';
  if (!chapterId) return null;
  return { chapterId };
}

function buildFallbackPack(chapterId: string, contextPack: Awaited<ReturnType<typeof getContextPack>>): ChapterPackResponse | null {
  const chapter = getChapterById(chapterId);
  if (!chapter) return null;
  const pyq = getPYQData(chapterId);
  const highYieldTopics = [
    ...(pyq?.importantTopics ?? []),
    ...chapter.topics,
  ].filter(Boolean).slice(0, 8);

  const formulaFocus = (chapter.formulas ?? []).map((formula) => formula.name).slice(0, 6);
  const citations = normalizeChapterCitations(
    contextPack.snippets.map((snippet) => ({
      sourcePath: snippet.sourcePath,
      year: snippet.year,
    }))
  );
  const frequency = getFrequencyLabel(chapterId)?.label ?? 'Regular';

  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    classLevel: chapter.classLevel,
    subject: chapter.subject,
    highYieldTopics: highYieldTopics.length > 0 ? highYieldTopics : chapter.topics.slice(0, 5),
    formulaFocus: formulaFocus.length > 0 ? formulaFocus : ['Definitions and core NCERT statements'],
    pyqTrend: {
      yearsAsked: pyq?.yearsAsked ?? [],
      avgMarks: pyq?.avgMarks ?? chapter.marks,
      frequencyLabel: frequency,
    },
    commonMistakes: [
      'Skipping chapter-specific keywords in answers.',
      'Not linking theory steps with the final conclusion.',
      'Ignoring PYQ-pattern subtopics during revision.',
    ],
    examStrategy: [
      'Start with high-frequency PYQ topics before broad revision.',
      'Practice one timed mixed set after concept revision.',
      'Use concise definitions, formula conditions, and final units in answers.',
    ],
    sourceCitations: citations,
  };
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(
    (token) => !['the', 'and', 'for', 'with', 'this', 'that', 'chapter', 'class'].includes(token)
  );
}

function filterTopicsForChapter(candidates: string[], chapterTitle: string, chapterTopics: string[]): string[] {
  const chapterTokenSet = new Set(tokenize(`${chapterTitle} ${chapterTopics.join(' ')}`));
  const cleaned = cleanTextList(candidates, 12);
  const aligned = cleaned.filter((topic) => tokenize(topic).some((token) => chapterTokenSet.has(token)));
  return aligned.slice(0, 8);
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const limit = await checkRateLimit({
      key: buildRateLimitKey('ai:chapter-pack', [context?.authUserId || getClientIp(req), context?.schoolId]),
      windowSeconds: 60,
      maxRequests: 16,
      blockSeconds: 120,
    });
    if (!limit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many chapter pack requests. Please retry shortly.',
        status: 429,
        hint: `Retry after ${limit.retryAfterSeconds}s`,
      });
    }

    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 16 * 1024);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
      });
    }
    const body = bodyResult.value;
    const parsed = parseRequest(body);
    if (!parsed) {
      return errorJson({
        requestId,
        errorCode: 'invalid-request-body',
        message: 'Invalid request. Required: { chapterId }',
        status: 400,
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

    const pyq = getPYQData(parsed.chapterId);
    const contextPack = await getContextPack({
      task: 'chapter-pack',
      classLevel: chapter.classLevel,
      subject: chapter.subject,
      chapterId: chapter.id,
      chapterTopics: chapter.topics,
      query: `chapter pack ${chapter.title} high yield`,
      topK: 6,
    });

    const fallback = buildFallbackPack(parsed.chapterId, contextPack);
    if (!fallback) {
      return errorJson({
        requestId,
        errorCode: 'chapter-pack-fallback-failed',
        message: 'Unable to build chapter pack.',
        status: 500,
      });
    }

    const pyqSummary = pyq
      ? `PYQ years: ${[...pyq.yearsAsked].sort((a, b) => b - a).join(', ')} | avg marks: ${pyq.avgMarks} | important topics: ${pyq.importantTopics.join(', ')}`
      : 'No PYQ record available.';

    const prompt = `Create a compact chapter intelligence pack.
Chapter: ${chapter.title} (${chapter.subject}, Class ${chapter.classLevel}, id ${chapter.id})
Topics: ${chapter.topics.join(', ')}
${pyqSummary}

Return ONLY JSON:
{
  "chapterId":"${chapter.id}",
  "chapterTitle":"${chapter.title}",
  "classLevel":${chapter.classLevel},
  "subject":"${chapter.subject}",
  "highYieldTopics":["..."],
  "formulaFocus":["..."],
  "pyqTrend":{"yearsAsked":[2025,2024],"avgMarks":8,"frequencyLabel":"High Frequency"},
  "commonMistakes":["..."],
  "examStrategy":["..."],
  "sourceCitations":[{"sourcePath":"...","year":2024}]
}`;

    try {
      const { data, result } = await generateTaskJson<ChapterPackResponse>({
        task: 'chapter-pack',
        contextHash: contextPack.contextHash,
        contextSnippets: contextPack.snippets,
        chapterId: chapter.id,
        systemPrompt: `You are VidyaAI Chapter Intelligence Engine.
- Build concise chapter-wise exam-ready packs for CBSE.
- Prioritize high-yield topics and board scoring strategy.
- Keep points actionable and specific.
- Output valid JSON only.`,
        userPrompt: prompt,
        temperature: 0.2,
        maxOutputTokens: 1700,
        validate: isChapterPackResponse,
      });

      const highYieldTopics = filterTopicsForChapter(data.highYieldTopics, chapter.title, chapter.topics);
      const formulaFocus = cleanTextList(data.formulaFocus, 8);
      const yearsAsked = Array.from(new Set([...(fallback.pyqTrend.yearsAsked ?? []), ...(data.pyqTrend?.yearsAsked ?? [])]))
        .filter((year) => Number.isFinite(Number(year)))
        .map((year) => Number(year))
        .sort((a, b) => b - a);
      const sourceCitations = normalizeChapterCitations([
        ...(fallback.sourceCitations ?? []),
        ...(data.sourceCitations ?? []),
      ]);

      const payload = {
        ...data,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        classLevel: chapter.classLevel,
        subject: chapter.subject,
        highYieldTopics: highYieldTopics.length > 0 ? highYieldTopics : fallback.highYieldTopics,
        formulaFocus: formulaFocus.length > 0 ? formulaFocus : fallback.formulaFocus,
        pyqTrend: {
          yearsAsked: yearsAsked.length > 0 ? yearsAsked : fallback.pyqTrend.yearsAsked,
          avgMarks: Number.isFinite(Number(data.pyqTrend?.avgMarks))
            ? Number(data.pyqTrend.avgMarks)
            : fallback.pyqTrend.avgMarks,
          frequencyLabel: stripSourceTags(data.pyqTrend?.frequencyLabel || fallback.pyqTrend.frequencyLabel),
        },
        commonMistakes: cleanTextList(data.commonMistakes, 6).length > 0 ? cleanTextList(data.commonMistakes, 6) : fallback.commonMistakes,
        examStrategy: cleanTextList(data.examStrategy, 6).length > 0 ? cleanTextList(data.examStrategy, 6) : fallback.examStrategy,
        sourceCitations,
      };
      await logAiUsage({
        context,
        endpoint: '/api/chapter-pack',
        provider: result.provider,
        model: result.model,
        promptText: prompt,
        completionText: JSON.stringify(payload),
        requestId,
        estimated: true,
      });

      return dataJson({ requestId, data: payload });
    } catch (aiError) {
      console.error('[chapter-pack] AI fallback triggered', aiError);
      return dataJson({ requestId, data: fallback });
    }
  } catch (error) {
    console.error('[chapter-pack] error', error);
    const message = error instanceof Error ? error.message : 'Failed to create chapter pack.';
    return errorJson({
      requestId,
      errorCode: 'chapter-pack-create-failed',
      message,
      status: 500,
    });
  }
}
