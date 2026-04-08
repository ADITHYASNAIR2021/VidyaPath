import { NextResponse } from 'next/server';
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
  try {
    const body = await req.json().catch(() => null);
    const parsed = parseRequest(body);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid request. Required: { chapterId }' },
        { status: 400 }
      );
    }

    const chapter = getChapterById(parsed.chapterId);
    if (!chapter) {
      return NextResponse.json({ error: 'Chapter not found.' }, { status: 404 });
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
      return NextResponse.json({ error: 'Unable to build chapter pack.' }, { status: 500 });
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
      const { data } = await generateTaskJson<ChapterPackResponse>({
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

      return NextResponse.json({
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
      });
    } catch (aiError) {
      console.error('[chapter-pack] AI fallback triggered', aiError);
      return NextResponse.json(fallback);
    }
  } catch (error) {
    console.error('[chapter-pack] error', error);
    return NextResponse.json({ error: 'Failed to create chapter pack.' }, { status: 500 });
  }
}
