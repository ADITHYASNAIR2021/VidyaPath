import { NextResponse } from 'next/server';
import { getChapterById } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskJson } from '@/lib/ai/generator';
import {
  cleanTextList,
  isChapterRemediateResponse,
  stripSourceTags,
  type ChapterRemediateDay,
  type ChapterRemediateResponse,
} from '@/lib/ai/validators';

interface ChapterRemediateRequest {
  chapterId: string;
  weakTags: string[];
  availableDays: number;
  dailyMinutes: number;
}

function parseRequest(body: unknown): ChapterRemediateRequest | null {
  if (!body || typeof body !== 'object') return null;
  const chapterId = typeof (body as Record<string, unknown>).chapterId === 'string'
    ? String((body as Record<string, unknown>).chapterId).trim()
    : '';
  if (!chapterId) return null;

  const weakTags = Array.isArray((body as Record<string, unknown>).weakTags)
    ? ((body as Record<string, unknown>).weakTags as unknown[])
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const availableDaysRaw = Number((body as Record<string, unknown>).availableDays);
  const dailyMinutesRaw = Number((body as Record<string, unknown>).dailyMinutes);
  const availableDays = Number.isFinite(availableDaysRaw) ? Math.max(2, Math.min(21, Math.round(availableDaysRaw))) : 7;
  const dailyMinutes = Number.isFinite(dailyMinutesRaw) ? Math.max(20, Math.min(240, Math.round(dailyMinutesRaw))) : 45;

  return {
    chapterId,
    weakTags,
    availableDays,
    dailyMinutes,
  };
}

function buildFallbackPlan(payload: ChapterRemediateRequest): ChapterRemediateResponse | null {
  const chapter = getChapterById(payload.chapterId);
  if (!chapter) return null;
  const pyq = getPYQData(payload.chapterId);

  const dayPlan: ChapterRemediateDay[] = [];
  const focusTopics = (pyq?.importantTopics ?? chapter.topics).slice(0, Math.min(payload.availableDays, 10));
  for (let day = 1; day <= payload.availableDays; day++) {
    const focus = focusTopics[(day - 1) % Math.max(1, focusTopics.length)] ?? chapter.title;
    dayPlan.push({
      day,
      focus,
      tasks: [
        `Concept review (${Math.round(payload.dailyMinutes * 0.4)} min)`,
        `Targeted practice (${Math.round(payload.dailyMinutes * 0.4)} min)`,
        `Error log + recap (${Math.max(10, Math.round(payload.dailyMinutes * 0.2))} min)`,
      ],
      targetOutcome: `Solve at least 8-12 questions correctly on ${focus}.`,
    });
  }

  const scoreLiftLower = Math.max(4, Math.round(payload.availableDays * 0.8));
  const scoreLiftUpper = Math.max(scoreLiftLower + 3, Math.round(payload.availableDays * 1.4));
  return {
    chapterId: chapter.id,
    dayPlan,
    checkpoints: [
      'Day 3: take a short chapter quiz and compare against baseline.',
      'Day 5: reattempt previously wrong questions without notes.',
      'Final day: run a timed mixed mini-test and log mistakes.',
    ],
    expectedScoreLift: `${scoreLiftLower}-${scoreLiftUpper} marks (if plan adherence is consistent).`,
  };
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(
    (token) => !['the', 'and', 'for', 'with', 'this', 'that', 'chapter', 'class'].includes(token)
  );
}

function alignFocus(focus: string, chapterTitle: string, chapterTopics: string[]): string {
  const cleaned = stripSourceTags(focus);
  const chapterTokens = new Set(tokenize(`${chapterTitle} ${chapterTopics.join(' ')}`));
  const focusTokens = tokenize(cleaned);
  const overlap = focusTokens.filter((token) => chapterTokens.has(token)).length;
  if (overlap > 0) return cleaned;
  return chapterTopics[0] || chapterTitle;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = parseRequest(body);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid request. Required: { chapterId, weakTags?, availableDays?, dailyMinutes? }' },
        { status: 400 }
      );
    }

    const chapter = getChapterById(parsed.chapterId);
    if (!chapter) {
      return NextResponse.json({ error: 'Chapter not found.' }, { status: 404 });
    }

    const pyq = getPYQData(parsed.chapterId);
    const contextPack = await getContextPack({
      task: 'chapter-remediate',
      classLevel: chapter.classLevel,
      subject: chapter.subject,
      chapterId: chapter.id,
      chapterTopics: chapter.topics,
      query: `chapter remediation ${chapter.title} ${parsed.weakTags.join(' ')}`,
      topK: 5,
    });

    const fallback = buildFallbackPlan(parsed);
    if (!fallback) {
      return NextResponse.json({ error: 'Unable to create remediation plan.' }, { status: 500 });
    }

    const prompt = `Create a day-wise remediation plan.
Chapter: ${chapter.title} (${chapter.subject}, Class ${chapter.classLevel}, id ${chapter.id})
Weak tags: ${parsed.weakTags.join(', ') || 'None provided'}
Time budget: ${parsed.availableDays} days x ${parsed.dailyMinutes} minutes/day
PYQ signal: ${pyq ? `avg marks ${pyq.avgMarks}, top topics ${pyq.importantTopics.join(', ')}` : 'None'}

Return ONLY JSON:
{
  "chapterId":"${chapter.id}",
  "dayPlan":[{"day":1,"focus":"...","tasks":["..."],"targetOutcome":"..."}],
  "checkpoints":["..."],
  "expectedScoreLift":"6-10 marks"
}`;

    try {
      const { data } = await generateTaskJson<ChapterRemediateResponse>({
        task: 'chapter-remediate',
        contextHash: contextPack.contextHash,
        contextSnippets: contextPack.snippets,
        chapterId: chapter.id,
        systemPrompt: `You are VidyaAI Remediation Planner.
- Build a realistic day-wise correction plan for weak chapter areas.
- Keep tasks measurable and time-bounded.
- Tie plan to exam outcomes.
- Output JSON only.`,
        userPrompt: prompt,
        temperature: 0.18,
        maxOutputTokens: 1600,
        validate: isChapterRemediateResponse,
      });

      const dayPlan = data.dayPlan
        .filter((day) => Number.isFinite(Number(day.day)) && day.day >= 1)
        .map((day) => ({
          day: Number(day.day),
          focus: alignFocus(String(day.focus).trim(), chapter.title, chapter.topics),
          tasks: Array.isArray(day.tasks)
            ? cleanTextList(day.tasks.map((task) => String(task).trim()), 5)
            : [],
          targetOutcome: stripSourceTags(String(day.targetOutcome).trim()),
        }))
        .slice(0, parsed.availableDays);

      if (dayPlan.length === 0) return NextResponse.json(fallback);

      return NextResponse.json({
        chapterId: chapter.id,
        dayPlan,
        checkpoints: cleanTextList(data.checkpoints, 8).length > 0 ? cleanTextList(data.checkpoints, 8) : fallback.checkpoints,
        expectedScoreLift: stripSourceTags(data.expectedScoreLift || fallback.expectedScoreLift),
      });
    } catch (aiError) {
      console.error('[chapter-remediate] AI fallback triggered', aiError);
      return NextResponse.json(fallback);
    }
  } catch (error) {
    console.error('[chapter-remediate] error', error);
    return NextResponse.json({ error: 'Failed to create remediation plan.' }, { status: 500 });
  }
}
