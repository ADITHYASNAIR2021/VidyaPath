import { ALL_CHAPTERS } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskJson } from '@/lib/ai/generator';
import { checkAiTokenBudget } from '@/lib/ai/token-budget';
import {
  cleanTextList,
  isRevisionPlanResponse,
  stripSourceTags,
  type RevisionPlanResponse,
  type RevisionWeek,
} from '@/lib/ai/validators';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { revisionPlanRequestSchema } from '@/lib/schemas/ai';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

interface RevisionRequest {
  classLevel: 10 | 12;
  subject?: string;
  examDate?: string;
  weeklyHours: number;
  weakChapterIds?: string[];
  targetScore?: number;
}

function parseRequest(body: unknown): RevisionRequest | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const classLevel = Number(record.classLevel) as 10 | 12;
  const weeklyHours = Number(record.weeklyHours);
  if ((classLevel !== 10 && classLevel !== 12) || !Number.isFinite(weeklyHours) || weeklyHours <= 0) {
    return null;
  }

  return {
    classLevel,
    subject: typeof record.subject === 'string' ? record.subject.trim() : undefined,
    examDate: typeof record.examDate === 'string' ? record.examDate.trim() : undefined,
    weeklyHours,
    weakChapterIds: Array.isArray(record.weakChapterIds)
      ? record.weakChapterIds.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean)
      : [],
    targetScore: Number.isFinite(Number(record.targetScore)) ? Number(record.targetScore) : undefined,
  };
}

function computeWeeks(examDate?: string): number {
  if (!examDate) return 4;
  const exam = new Date(examDate);
  if (Number.isNaN(exam.getTime())) return 4;
  const diffMs = exam.getTime() - Date.now();
  if (diffMs <= 0) return 2;
  const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(2, Math.min(16, diffWeeks));
}

function buildHeuristicPlan(req: RevisionRequest): RevisionPlanResponse {
  const chapters = ALL_CHAPTERS.filter((chapter) => {
    if (chapter.classLevel !== req.classLevel) return false;
    if (req.subject && req.subject !== 'All' && chapter.subject.toLowerCase() !== req.subject.toLowerCase()) return false;
    return true;
  });

  const weakSet = new Set(req.weakChapterIds ?? []);
  const prioritized = [...(chapters.length > 0 ? chapters : ALL_CHAPTERS.filter((chapter) => chapter.classLevel === req.classLevel))].sort((a, b) => {
    const weakA = weakSet.has(a.id) ? 1 : 0;
    const weakB = weakSet.has(b.id) ? 1 : 0;
    if (weakA !== weakB) return weakB - weakA;
    const pyqA = getPYQData(a.id)?.avgMarks ?? 0;
    const pyqB = getPYQData(b.id)?.avgMarks ?? 0;
    return pyqB - pyqA;
  });

  const totalWeeks = computeWeeks(req.examDate);
  const perWeekChapterCount = req.weeklyHours >= 10 ? 3 : req.weeklyHours >= 6 ? 2 : 1;
  const weeks: RevisionWeek[] = [];

  for (let week = 1; week <= totalWeeks; week++) {
    const start = (week - 1) * perWeekChapterCount;
    const selected = prioritized.slice(start, start + perWeekChapterCount);
    const fallback = prioritized.slice(0, perWeekChapterCount);
    const focus = (selected.length > 0 ? selected : fallback).map((chapter) => chapter.id);
    const targetMarks = focus.reduce((sum, chapterId) => sum + (getPYQData(chapterId)?.avgMarks ?? 4), 0);
    weeks.push({
      week,
      focusChapters: focus,
      tasks: [
        'Concept revision (NCERT + class notes)',
        'Solve 15-25 PYQ-linked questions',
        '1 timed mixed mini-test',
      ],
      targetMarks: Math.min(35, Math.max(8, Math.round(targetMarks))),
      reviewSlots: ['Mon-Wed', 'Thu-Sat', 'Sunday recap'],
      miniTests: ['Topic drill test', 'Timed section test'],
    });
  }

  return { planWeeks: weeks };
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const limit = await checkRateLimit({
      key: buildRateLimitKey('ai:revision-plan', [context?.authUserId || getClientIp(req), context?.schoolId]),
      windowSeconds: 60,
      maxRequests: 10,
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

    const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, revisionPlanRequestSchema);
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
    const tokenBudget = await checkAiTokenBudget({
      context,
      endpoint: '/api/revision-plan',
      projectedInputText: JSON.stringify(body),
      projectedOutputTokens: 1900,
    });
    if (!tokenBudget.allowed) {
      return errorJson({
        requestId,
        errorCode: tokenBudget.reason || 'token-cap-exceeded',
        message: 'AI usage limit reached for revision planning.',
        status: 429,
        hint: `Retry after ${tokenBudget.retryAfterSeconds ?? 300}s`,
      });
    }
    const parsed = parseRequest(body);
    if (!parsed) {
      return errorJson({
        requestId,
        errorCode: 'invalid-revision-plan-input',
        message: 'Invalid request. Required: { classLevel: 10|12, weeklyHours > 0 }',
        status: 400,
      });
    }

    const fallback = buildHeuristicPlan(parsed);
    const weakChapterId = parsed.weakChapterIds?.[0] ?? fallback.planWeeks[0]?.focusChapters?.[0];
    const weakChapter = weakChapterId ? ALL_CHAPTERS.find((chapter) => chapter.id === weakChapterId) : undefined;

    const contextPack = weakChapter
      ? await getContextPack({
          task: 'revision-plan',
          classLevel: parsed.classLevel,
          subject: weakChapter.subject,
          chapterId: weakChapter.id,
          chapterTopics: weakChapter.topics,
          query: `adaptive revision plan ${parsed.subject ?? ''} weak areas`,
          topK: 3,
        })
      : { snippets: [], contextHash: 'no-context', usedOnDemandFallback: false };

    const prompt = `Create an adaptive revision plan for CBSE with this input:
${JSON.stringify(parsed, null, 2)}

Constraints:
- Plan should improve board exam outcomes.
- Prioritize weak chapters and high PYQ frequency.
- Keep workload realistic based on weeklyHours.
- Include review slots and mini-tests in every week.

Return ONLY JSON in this shape:
{
  "planWeeks": [
    {
      "week": 1,
      "focusChapters": ["c12-phy-4"],
      "tasks": ["..."],
      "targetMarks": 12,
      "reviewSlots": ["..."],
      "miniTests": ["..."]
    }
  ]
}`;

    try {
      const { data, result } = await generateTaskJson<RevisionPlanResponse>({
        task: 'revision-plan',
        contextHash: contextPack.contextHash,
        contextSnippets: contextPack.snippets,
        chapterId: weakChapter?.id,
        userPrompt: prompt,
        systemPrompt: `You are VidyaAI Revision Planner.
- Prioritize high-yield chapters from PYQ trend.
- Produce realistic week-by-week plans.
- Keep output concise and structured.
- Return JSON only.`,
        temperature: 0.15,
        maxOutputTokens: 1900,
        validate: isRevisionPlanResponse,
      });

      const validChapterIds = new Set(
        ALL_CHAPTERS.filter((chapter) => chapter.classLevel === parsed.classLevel)
          .filter((chapter) => !parsed.subject || parsed.subject === 'All' || chapter.subject.toLowerCase() === parsed.subject.toLowerCase())
          .map((chapter) => chapter.id)
      );
      const sanitizedWeeks = (data.planWeeks ?? [])
        .map((week, index) => ({
          week: Number.isFinite(Number(week.week)) ? Number(week.week) : index + 1,
          focusChapters: Array.isArray(week.focusChapters)
            ? week.focusChapters.filter((id) => validChapterIds.has(id)).slice(0, 4)
            : [],
          tasks: cleanTextList(Array.isArray(week.tasks) ? week.tasks : [], 6),
          targetMarks: Math.max(2, Math.min(40, Number(week.targetMarks) || 8)),
          reviewSlots: cleanTextList(Array.isArray(week.reviewSlots) ? week.reviewSlots : [], 4),
          miniTests: cleanTextList(Array.isArray(week.miniTests) ? week.miniTests : [], 4),
        }))
        .slice(0, Math.max(2, computeWeeks(parsed.examDate)));

      const finalWeeks = sanitizedWeeks.length > 0
        ? sanitizedWeeks.map((week) => ({
            ...week,
            tasks: week.tasks.length > 0 ? week.tasks : ['Concept revision', 'PYQ practice', 'Timed mini test'],
            focusChapters: week.focusChapters.length > 0 ? week.focusChapters : fallback.planWeeks[0]?.focusChapters ?? [],
          }))
        : fallback.planWeeks;

      const payload = {
        planWeeks: finalWeeks.map((week) => ({
          ...week,
          reviewSlots: (week.reviewSlots ?? []).map((slot) => stripSourceTags(slot)),
          miniTests: (week.miniTests ?? []).map((test) => stripSourceTags(test)),
        })),
      };
      await logAiUsage({
        context,
        endpoint: '/api/revision-plan',
        provider: result.provider,
        model: result.model,
        promptText: prompt,
        completionText: JSON.stringify(payload),
        estimated: true,
      });
      return dataJson({ requestId, data: payload });
    } catch (aiError) {
      console.error('[revision-plan] AI fallback triggered', aiError);
      return dataJson({ requestId, data: fallback });
    }
  } catch (error) {
    console.error('[revision-plan] error', error);
    const message = error instanceof Error ? error.message : 'Failed to generate revision plan.';
    return errorJson({
      requestId,
      errorCode: 'revision-plan-generate-failed',
      message,
      status: 500,
    });
  }
}
