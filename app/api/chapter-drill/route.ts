import { NextResponse } from 'next/server';
import { getChapterById } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskJson } from '@/lib/ai/generator';
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

interface ChapterDrillRequest {
  chapterId: string;
  questionCount: number;
  difficulty: string;
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
  return { chapterId, questionCount, difficulty: difficulty || 'mixed' };
}

function buildFallbackDrill(chapterId: string, questionCount: number, difficulty: string): ChapterDrillResponse | null {
  const chapter = getChapterById(chapterId);
  if (!chapter) return null;
  const fromChapter: MCQItem[] = (chapter.quizzes ?? []).map((quiz) => ({
    question: quiz.question,
    options: quiz.options,
    answer: quiz.correctAnswerIndex,
    explanation: quiz.explanation ?? 'Revise this concept from chapter notes and PYQs.',
  }));

  const generated: MCQItem[] = fromChapter.length > 0
    ? fromChapter
    : Array.from({ length: questionCount }, (_, index) => {
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
  const expanded = normalized.length >= questionCount
    ? normalized
    : [
        ...normalized,
        ...Array.from({ length: questionCount - normalized.length }, (_, idx) => {
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
      ];
  const questions = normalizeMCQs(expanded).slice(0, questionCount);
  return {
    chapterId: chapter.id,
    difficulty,
    questions,
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = parseRequest(body);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid request. Required: { chapterId, questionCount?, difficulty? }' },
        { status: 400 }
      );
    }

    const chapter = getChapterById(parsed.chapterId);
    if (!chapter) {
      return NextResponse.json({ error: 'Chapter not found.' }, { status: 404 });
    }

    const pyq = getPYQData(parsed.chapterId);
    const contextPack = await getContextPack({
      task: 'chapter-drill',
      classLevel: chapter.classLevel,
      subject: chapter.subject,
      chapterId: chapter.id,
      chapterTopics: chapter.topics,
      query: `chapter drill ${chapter.title} ${parsed.difficulty}`,
      topK: 6,
    });

    const fallback = buildFallbackDrill(parsed.chapterId, parsed.questionCount, parsed.difficulty);
    if (!fallback) {
      return NextResponse.json({ error: 'Unable to create chapter drill.' }, { status: 500 });
    }

    const prompt = `Create a chapter-wise CBSE drill set.
Chapter: ${chapter.title} (${chapter.subject}, Class ${chapter.classLevel}, id ${chapter.id})
Question count: ${parsed.questionCount}
Difficulty: ${parsed.difficulty}
PYQ signal: ${pyq ? `avg marks ${pyq.avgMarks}, important topics ${pyq.importantTopics.join(', ')}` : 'No PYQ record'}

Return ONLY JSON:
{
  "chapterId":"${chapter.id}",
  "difficulty":"${parsed.difficulty}",
  "questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}],
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
    const promptWithVariation = `${prompt}
${buildVariationInstruction(variation)}`;

    try {
      const { data } = await generateTaskJson<ChapterDrillResponse>({
        task: 'chapter-drill',
        contextHash: contextPack.contextHash,
        contextSnippets: contextPack.snippets,
        chapterId: chapter.id,
        difficulty: parsed.difficulty,
        diversityKey: variation.diversityKey,
        systemPrompt: `You are VidyaAI Chapter Drill Engine.
- Generate board-style chapter-targeted practice questions.
- Ensure options are plausible and non-overlapping.
- Keep explanations concise and exam-oriented.
- Vary wording and distractor logic across runs.
- Output JSON only.`,
        userPrompt: promptWithVariation,
        temperature: 0.18,
        maxOutputTokens: Math.min(3600, 900 + parsed.questionCount * 170),
        validate: isChapterDrillResponse,
      });

      const aiQuestions = normalizeMCQs(data.questions).filter((item) =>
        isQuestionAligned(item.question, chapter.title, chapter.topics)
      );
      const usedQuestionText = new Set(aiQuestions.map((item) => item.question.trim().toLowerCase()));
      const toppedUp = [...aiQuestions];
      for (const fallbackQuestion of fallback.questions) {
        if (toppedUp.length >= parsed.questionCount) break;
        const key = fallbackQuestion.question.trim().toLowerCase();
        if (usedQuestionText.has(key)) continue;
        toppedUp.push(fallbackQuestion);
        usedQuestionText.add(key);
      }
      const questions = toppedUp.slice(0, parsed.questionCount);
      if (questions.length === 0) return NextResponse.json(fallback);

      const response: ChapterDrillResponse = {
        chapterId: chapter.id,
        difficulty: stripSourceTags(data.difficulty || parsed.difficulty),
        questions,
        answerKey: questions.map((item) => item.answer),
        topicCoverage: cleanTextList(
          Array.isArray(data.topicCoverage) ? data.topicCoverage : fallback.topicCoverage,
          12
        ),
        sourceCitations: normalizeChapterCitations([
          ...contextPack.snippets.map((snippet) => ({ sourcePath: snippet.sourcePath, year: snippet.year })),
          ...(data.sourceCitations ?? []),
        ]),
      };

      return NextResponse.json(response);
    } catch (aiError) {
      const reason = aiError instanceof Error ? aiError.message : String(aiError);
      console.warn(`[chapter-drill] AI fallback triggered: ${reason}`);
      return NextResponse.json(fallback);
    }
  } catch (error) {
    console.error('[chapter-drill] error', error);
    return NextResponse.json({ error: 'Failed to create chapter drill.' }, { status: 500 });
  }
}
