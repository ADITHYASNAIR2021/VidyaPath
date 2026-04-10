import { getChapterById } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskJson } from '@/lib/ai/generator';
import { buildLearningProfile } from '@/lib/learning-profile';
import {
  cleanTextList,
  isChapterDiagnoseResponse,
  type ChapterDiagnoseResponse,
} from '@/lib/ai/validators';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';

interface ChapterDiagnoseRequest {
  chapterId: string;
  quizScore: number | null;
  flashcardsDue: number;
  studied: boolean;
  bookmarked: boolean;
  recentMistakes: string[];
}

function parseRequest(body: unknown): ChapterDiagnoseRequest | null {
  if (!body || typeof body !== 'object') return null;
  const chapterId = typeof (body as Record<string, unknown>).chapterId === 'string'
    ? String((body as Record<string, unknown>).chapterId).trim()
    : '';
  if (!chapterId) return null;

  const quizScoreRaw = Number((body as Record<string, unknown>).quizScore);
  const quizScore = Number.isFinite(quizScoreRaw) && quizScoreRaw >= 0 ? Math.max(0, Math.min(100, quizScoreRaw)) : null;
  const flashcardsDueRaw = Number((body as Record<string, unknown>).flashcardsDue);
  const flashcardsDue = Number.isFinite(flashcardsDueRaw) ? Math.max(0, Math.round(flashcardsDueRaw)) : 0;
  const studied = (body as Record<string, unknown>).studied === true;
  const bookmarked = (body as Record<string, unknown>).bookmarked === true;
  const recentMistakes = Array.isArray((body as Record<string, unknown>).recentMistakes)
    ? ((body as Record<string, unknown>).recentMistakes as unknown[])
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  return {
    chapterId,
    quizScore,
    flashcardsDue,
    studied,
    bookmarked,
    recentMistakes,
  };
}

function inferRiskLevel(weakTags: string[], quizScore: number | null, pyqAvgMarks: number): 'low' | 'medium' | 'high' {
  const quizRisk = quizScore === null ? 1 : quizScore < 55 ? 3 : quizScore < 75 ? 2 : 0;
  const pyqRisk = pyqAvgMarks >= 8 ? 2 : pyqAvgMarks >= 6 ? 1 : 0;
  const tagRisk = weakTags.length >= 3 ? 3 : weakTags.length >= 1 ? 2 : 0;
  const score = quizRisk + pyqRisk + tagRisk;
  if (score >= 6) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

function buildFallbackDiagnosis(payload: ChapterDiagnoseRequest): ChapterDiagnoseResponse | null {
  const chapter = getChapterById(payload.chapterId);
  if (!chapter) return null;
  const pyq = getPYQData(payload.chapterId);

  const profile = buildLearningProfile({
    chapterId: chapter.id,
    quizScore: payload.quizScore,
    flashcardsDue: payload.flashcardsDue,
    studied: payload.studied,
    bookmarked: payload.bookmarked,
    pyqAvgMarks: pyq?.avgMarks ?? chapter.marks,
  });

  const riskLevel = inferRiskLevel(profile.weakTags, payload.quizScore, pyq?.avgMarks ?? chapter.marks);
  const diagnosis = [
    payload.quizScore === null
      ? 'No chapter quiz score found yet, so mastery is unverified.'
      : `Current chapter quiz score is ${payload.quizScore}%.`,
    `Flashcards due: ${payload.flashcardsDue}.`,
    pyq ? `PYQ pressure is ~${pyq.avgMarks} marks, so consistency matters.` : 'PYQ trend unavailable; use chapter importance for prioritization.',
    ...payload.recentMistakes.slice(0, 2).map((mistake) => `Observed mistake: ${mistake}`),
  ];

  return {
    chapterId: chapter.id,
    riskLevel,
    weakTags: profile.weakTags.length > 0 ? profile.weakTags : ['No major weakness detected'],
    diagnosis,
    nextActions: profile.recommendedActions.slice(0, 4),
    recommendedTaskTypes: riskLevel === 'high'
      ? ['chapter-drill', 'flashcards', 'paper-evaluate']
      : riskLevel === 'medium'
        ? ['chapter-drill', 'flashcards']
        : ['flashcards', 'revision-plan'],
  };
}

const ALLOWED_TASK_TYPES = new Set(['chapter-drill', 'flashcards', 'paper-evaluate', 'revision-plan', 'adaptive-test']);

function normalizeWeakTags(tags: string[], fallbackTags: string[]): string[] {
  const mapped: string[] = [];
  for (const raw of tags) {
    const lower = raw.toLowerCase();
    if (lower.includes('quiz') || lower.includes('accuracy')) mapped.push('Low Quiz Accuracy');
    if (lower.includes('recall') || lower.includes('flashcard') || lower.includes('memory')) mapped.push('High Recall Debt');
    if (lower.includes('high-yield') || lower.includes('pyq')) mapped.push('High-Yield Risk');
    if (lower.includes('not studied') || lower.includes('unstudied')) mapped.push('Not Marked Studied');
  }
  const merged = cleanTextList([...fallbackTags, ...mapped], 6);
  return merged.length > 0 ? merged : fallbackTags;
}

function normalizeTaskTypes(taskTypes: string[], fallback: string[]): string[] {
  const normalized = taskTypes
    .map((item) => item.trim())
    .filter((item) => ALLOWED_TASK_TYPES.has(item));
  const deduped = Array.from(new Set(normalized));
  return deduped.length > 0 ? deduped : fallback;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 32 * 1024);
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
        errorCode: 'invalid-chapter-diagnose-input',
        message: 'Invalid request. Required: { chapterId, quizScore?, flashcardsDue?, studied?, bookmarked?, recentMistakes? }',
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
      task: 'chapter-diagnose',
      classLevel: chapter.classLevel,
      subject: chapter.subject,
      chapterId: chapter.id,
      chapterTopics: chapter.topics,
      query: `chapter diagnose ${chapter.title}`,
      topK: 4,
    });

    const fallback = buildFallbackDiagnosis(parsed);
    if (!fallback) {
      return errorJson({
        requestId,
        errorCode: 'chapter-diagnose-fallback-failed',
        message: 'Unable to diagnose chapter.',
        status: 500,
      });
    }

    const prompt = `Diagnose chapter performance risk and return actionable next steps.
Chapter: ${chapter.title} (${chapter.subject}, Class ${chapter.classLevel}, id ${chapter.id})
User performance:
${JSON.stringify(parsed, null, 2)}
PYQ signal: ${pyq ? `avg ${pyq.avgMarks}, topics ${pyq.importantTopics.join(', ')}` : 'None'}

Return ONLY JSON:
{
  "chapterId":"${chapter.id}",
  "riskLevel":"low|medium|high",
  "weakTags":["..."],
  "diagnosis":["..."],
  "nextActions":["..."],
  "recommendedTaskTypes":["chapter-drill","flashcards"]
}`;

    try {
      const { data, result } = await generateTaskJson<ChapterDiagnoseResponse>({
        task: 'chapter-diagnose',
        contextHash: contextPack.contextHash,
        contextSnippets: contextPack.snippets,
        chapterId: chapter.id,
        systemPrompt: `You are VidyaAI Diagnosis Engine.
- Infer weakness from quiz, recall debt, and chapter demand.
- Keep diagnosis precise and exam-focused.
- Recommend concrete next actions for marks improvement.
- Output JSON only.`,
        userPrompt: prompt,
        temperature: 0.2,
        maxOutputTokens: 1200,
        validate: isChapterDiagnoseResponse,
      });

      const riskLevel = ['low', 'medium', 'high'].includes(data.riskLevel) ? data.riskLevel : fallback.riskLevel;
      const payload = {
        chapterId: chapter.id,
        riskLevel,
        weakTags: normalizeWeakTags(data.weakTags, fallback.weakTags),
        diagnosis: cleanTextList(data.diagnosis, 6).length > 0 ? cleanTextList(data.diagnosis, 6) : fallback.diagnosis,
        nextActions: cleanTextList(data.nextActions, 6).length > 0 ? cleanTextList(data.nextActions, 6) : fallback.nextActions,
        recommendedTaskTypes: normalizeTaskTypes(data.recommendedTaskTypes, fallback.recommendedTaskTypes),
      };
      await logAiUsage({
        context,
        endpoint: '/api/chapter-diagnose',
        provider: result.provider,
        model: result.model,
        promptText: prompt,
        completionText: JSON.stringify(payload),
        estimated: true,
      });
      return dataJson({ requestId, data: payload });
    } catch (aiError) {
      console.error('[chapter-diagnose] AI fallback triggered', aiError);
      return dataJson({ requestId, data: fallback });
    }
  } catch (error) {
    console.error('[chapter-diagnose] error', error);
    const message = error instanceof Error ? error.message : 'Failed to diagnose chapter.';
    return errorJson({
      requestId,
      errorCode: 'chapter-diagnose-failed',
      message,
      status: 500,
    });
  }
}
