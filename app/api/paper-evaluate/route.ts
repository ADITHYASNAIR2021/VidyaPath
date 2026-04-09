import { NextResponse } from 'next/server';
import { ALL_CHAPTERS } from '@/lib/data';
import { ALL_PAPERS } from '@/lib/papers';
import { getPYQData } from '@/lib/pyq';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskJson } from '@/lib/ai/generator';
import {
  cleanTextList,
  isPaperEvaluateResponse,
  stripSourceTags,
  type PaperEvaluateResponse,
} from '@/lib/ai/validators';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';

interface AnswerInput {
  questionNo: string;
  answerText: string;
}

interface PaperEvaluateRequest {
  paperId: string;
  answers: AnswerInput[];
  classLevel?: 10 | 12;
  subject?: string;
}

function parseRequest(body: unknown): PaperEvaluateRequest | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const paperId = typeof record.paperId === 'string' ? record.paperId.trim() : '';
  const answers: AnswerInput[] = [];
  if (Array.isArray(record.answers)) {
    record.answers.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const entry = item as Record<string, unknown>;
      const questionNo = typeof entry.questionNo === 'string' ? entry.questionNo.trim() : '';
      const answerText = typeof entry.answerText === 'string' ? entry.answerText.trim() : '';
      if (!questionNo || !answerText) return;
      answers.push({ questionNo, answerText });
    });
  }

  if (!paperId || answers.length === 0) return null;
  const classLevel = Number(record.classLevel);
  return {
    paperId,
    answers,
    classLevel: classLevel === 10 || classLevel === 12 ? classLevel : undefined,
    subject: typeof record.subject === 'string' ? record.subject.trim() : undefined,
  };
}

function buildHeuristicEvaluation(payload: PaperEvaluateRequest): PaperEvaluateResponse {
  const answers = payload.answers;
  const avgWords =
    answers.reduce((sum, answer) => sum + answer.answerText.split(/\s+/).filter(Boolean).length, 0) / answers.length;
  const conceptualScore = Math.min(35, Math.round(avgWords * 0.9));
  const structureScore = Math.min(30, Math.round(avgWords * 0.7));
  const precisionScore = Math.min(35, Math.round(avgWords * 0.6));
  const scoreEstimate = Math.min(100, conceptualScore + structureScore + precisionScore);

  const mistakes: string[] = [];
  if (avgWords < 35) mistakes.push('Answers are brief; add definitions, steps, and final conclusions.');
  if (avgWords < 55) mistakes.push('Use more structured line-by-line approach for board marking clarity.');
  mistakes.push('Revise PYQ-heavy topics and include formula/condition statements where relevant.');

  return {
    scoreEstimate,
    sectionBreakdown: [
      { section: 'Concept Accuracy', score: conceptualScore, maxScore: 35 },
      { section: 'Answer Structure', score: structureScore, maxScore: 30 },
      { section: 'Precision & Keywords', score: precisionScore, maxScore: 35 },
    ],
    mistakes,
    improvementTasks: [
      'Do one timed 40-minute section test on weak topics.',
      'Revise marking-scheme keywords and model answer structure.',
      'Solve 12-15 recent PYQ questions with self-review.',
    ],
    weakTopics: [],
    recommendedChapters: [],
  };
}

export async function POST(req: Request) {
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const body = await req.json().catch(() => null);
    const parsed = parseRequest(body);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid request. Required: { paperId, answers: [{questionNo, answerText}] }' },
        { status: 400 }
      );
    }

    const paper = ALL_PAPERS.find((entry) => entry.id === parsed.paperId);
    const classLevel = parsed.classLevel ?? (paper?.classLevel === 10 || paper?.classLevel === 12 ? paper.classLevel : 12);
    const subject = parsed.subject ?? paper?.subject ?? 'Physics';
    const fallback = buildHeuristicEvaluation(parsed);

    const chapterPool = ALL_CHAPTERS.filter(
      (chapter) => chapter.classLevel === classLevel && chapter.subject.toLowerCase() === subject.toLowerCase()
    )
      .sort((a, b) => (getPYQData(b.id)?.avgMarks ?? 0) - (getPYQData(a.id)?.avgMarks ?? 0))
      .slice(0, 6);

    const weakTopicsHint = chapterPool
      .map((chapter) => `${chapter.id}: ${chapter.title} (avg ${getPYQData(chapter.id)?.avgMarks ?? 0}M)`)
      .join('\n');

    const contextPack = await getContextPack({
      task: 'paper-evaluate',
      classLevel,
      subject,
      chapterId: chapterPool[0]?.id,
      chapterTopics: chapterPool[0]?.topics ?? [],
      query: `${subject} board paper evaluation common mistakes`,
      topK: 4,
    });

    const prompt = `Evaluate these student answers for a CBSE ${subject} paper.
Paper info: ${JSON.stringify({ paperId: parsed.paperId, classLevel, subject }, null, 2)}
Answers: ${JSON.stringify(parsed.answers, null, 2)}

Weak-topic hints:
${weakTopicsHint || 'No chapter hints available.'}

Return ONLY JSON:
{
  "scoreEstimate": 68,
  "sectionBreakdown": [{"section":"Concept Accuracy","score":24,"maxScore":35}],
  "mistakes": ["..."],
  "improvementTasks": ["..."],
  "weakTopics": ["..."],
  "recommendedChapters": ["c12-phy-4"]
}`;

    try {
      const { data, result } = await generateTaskJson<PaperEvaluateResponse>({
        task: 'paper-evaluate',
        contextHash: contextPack.contextHash,
        contextSnippets: contextPack.snippets,
        chapterId: chapterPool[0]?.id,
        userPrompt: prompt,
        systemPrompt: `You are VidyaAI Paper Evaluator.
- Estimate score conservatively using board standards.
- Identify concrete mistakes and corrective tasks.
- Recommend chapter IDs only from supplied hints when possible.
- Output JSON only.`,
        temperature: 0.2,
        maxOutputTokens: 1800,
        validate: isPaperEvaluateResponse,
      });

      const validChapterIds = new Set(chapterPool.map((chapter) => chapter.id));
      const weakTopics = cleanTextList(Array.isArray(data.weakTopics) ? data.weakTopics : fallback.weakTopics ?? [], 8);
      const recommendedChapters = (Array.isArray(data.recommendedChapters) ? data.recommendedChapters : [])
        .map((id) => id.trim())
        .filter((id) => validChapterIds.has(id))
        .slice(0, 6);

      const payload = {
        ...fallback,
        ...data,
        scoreEstimate: Math.max(0, Math.min(100, Number(data.scoreEstimate))),
        mistakes: cleanTextList(data.mistakes, 8),
        improvementTasks: cleanTextList(data.improvementTasks, 8),
        weakTopics,
        recommendedChapters: recommendedChapters.length > 0 ? recommendedChapters : fallback.recommendedChapters,
        sectionBreakdown: (Array.isArray(data.sectionBreakdown) ? data.sectionBreakdown : fallback.sectionBreakdown).map((section) => ({
          section: stripSourceTags(String(section.section || 'Section')),
          score: Math.max(0, Math.min(100, Number(section.score) || 0)),
          maxScore: Math.max(1, Math.min(100, Number(section.maxScore) || 1)),
        })),
      };
      await logAiUsage({
        context,
        endpoint: '/api/paper-evaluate',
        provider: result.provider,
        model: result.model,
        promptText: prompt,
        completionText: JSON.stringify(payload),
        estimated: true,
      });
      return NextResponse.json(payload);
    } catch (aiError) {
      console.error('[paper-evaluate] AI fallback triggered', aiError);
      return NextResponse.json(fallback);
    }
  } catch (error) {
    console.error('[paper-evaluate] error', error);
    return NextResponse.json({ error: 'Failed to evaluate paper answers.' }, { status: 500 });
  }
}
