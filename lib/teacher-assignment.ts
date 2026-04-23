import { getChapterById } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { getGroundedPYQData } from '@/lib/pyq-grounded';
import { getContextPack } from '@/lib/ai/context-retriever';
import { buildVariationInstruction, buildVariationProfile } from '@/lib/ai/variation';
import { generateTaskJson } from '@/lib/ai/generator';
import { annotateQuestionsWithRagMeta } from '@/lib/ai/question-rag';
import {
  cleanTextList,
  normalizeMCQs,
  stripSourceTags,
  type MCQItem,
} from '@/lib/ai/validators';
import type {
  TeacherAssignmentPack,
  TeacherFormulaDrillItem,
  TeacherQuestionResult,
  TeacherQuestionVerdict,
  TeacherSubmissionAnswer,
  TeacherSubmissionAttemptDetail,
  TeacherSubmissionResult,
} from '@/lib/teacher-types';

export interface TeacherAssignmentPackRequest {
  chapterId: string;
  classLevel: 10 | 12;
  subject: string;
  questionCount: number;
  difficultyMix: string;
  includeShortAnswers: boolean;
  includeLongAnswers?: boolean;
  includeFormulaDrill: boolean;
  dueDate?: string;
}

interface AssignmentDraftModelResponse {
  title: string;
  mcqs: MCQItem[];
  shortAnswers: string[];
  longAnswers: string[];
  formulaDrill: TeacherFormulaDrillItem[];
  commonMistakes: string[];
  estimatedTimeMinutes: number;
}

function sanitizeText(value: string, max = 220): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function isAssignmentDraftResponse(value: unknown): value is AssignmentDraftModelResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.title === 'string' &&
    Array.isArray(record.mcqs) &&
    Array.isArray(record.shortAnswers) &&
    Array.isArray(record.longAnswers) &&
    Array.isArray(record.formulaDrill) &&
    Array.isArray(record.commonMistakes) &&
    Number.isFinite(Number(record.estimatedTimeMinutes))
  );
}

function clampQuestionCount(value: number): number {
  if (!Number.isFinite(value)) return 8;
  return Math.max(4, Math.min(24, Math.round(value)));
}

function normalizeDifficultyMix(value: string): string {
  const clean = sanitizeText(value, 120);
  if (!clean) return '40% easy, 40% medium, 20% hard';
  return clean;
}

function buildGeneratedFallbackQuestion(topic: string, chapterTitle: string, idx: number): MCQItem {
  const normalizedTopic = sanitizeText(topic, 120) || chapterTitle;
  const variants: MCQItem[] = [
    {
      question: `Which statement is correct about ${normalizedTopic} in ${chapterTitle}?`,
      options: [
        `It is a high-yield concept and should be revised with examples.`,
        `It is not part of the board syllabus and can be skipped.`,
        `It appears only in practical exams, not theory papers.`,
        `It is unrelated to NCERT and PYQ trends.`,
      ],
      answer: 0,
      explanation: `${normalizedTopic} is repeatedly tested in concept + application format.`,
    },
    {
      question: `In board answers for ${normalizedTopic}, what improves marks the most?`,
      options: [
        `Writing keyword-rich steps with a clear final statement.`,
        `Memorizing only one-line definitions without application.`,
        `Skipping diagrams/formulas even when asked.`,
        `Ignoring units and sign conventions.`,
      ],
      answer: 0,
      explanation: `Structured steps and keywords improve scoring reliability in board marking.`,
    },
    {
      question: `The most common scoring mistake in ${normalizedTopic} is usually:`,
      options: [
        `Missing condition, formula form, or final unit.`,
        `Explaining too clearly with chapter terminology.`,
        `Solving with proper stepwise structure.`,
        `Checking the result against concept limits.`,
      ],
      answer: 0,
      explanation: `Many students lose marks by missing conditions/signs/units in final responses.`,
    },
  ];
  return variants[idx % variants.length];
}

function buildFallbackMcqs(chapterId: string, questionCount: number): MCQItem[] {
  const chapter = getChapterById(chapterId);
  if (!chapter) return [];
  const fromChapter = normalizeMCQs(
    (chapter.quizzes ?? []).map((quiz) => ({
      question: quiz.question,
      options: quiz.options,
      answer: quiz.correctAnswerIndex,
      explanation: quiz.explanation ?? 'Revise this concept from chapter notes and PYQs.',
    }))
  );

  const output = [...fromChapter];
  let cursor = 0;
  while (output.length < questionCount) {
    const topic = chapter.topics[cursor % Math.max(1, chapter.topics.length)] ?? chapter.title;
    output.push(buildGeneratedFallbackQuestion(topic, chapter.title, cursor));
    cursor += 1;
  }

  return normalizeMCQs(output).slice(0, questionCount);
}

function buildFallbackShortAnswers(chapterId: string, includeShortAnswers: boolean): string[] {
  if (!includeShortAnswers) return [];
  const chapter = getChapterById(chapterId);
  if (!chapter) return [];
  return cleanTextList(
    chapter.topics.slice(0, 8).map((topic) => `Write a 3-mark board-style answer on: ${topic}.`),
    8
  );
}

function buildFallbackLongAnswers(chapterId: string): string[] {
  const chapter = getChapterById(chapterId);
  if (!chapter) return [];
  return cleanTextList(
    chapter.topics
      .slice(0, 5)
      .map((topic) => `Write a 5-mark board-style long answer for: ${topic}. Include key points and a final conclusion.`),
    5
  );
}

function buildFallbackFormulaDrill(chapterId: string, includeFormulaDrill: boolean): TeacherFormulaDrillItem[] {
  if (!includeFormulaDrill) return [];
  const chapter = getChapterById(chapterId);
  if (!chapter) return [];
  const formulaItems = chapter.formulas ?? [];
  if (formulaItems.length === 0) {
    return chapter.topics.slice(0, 5).map((topic) => ({ name: `${topic} core relation` }));
  }
  return formulaItems.slice(0, 8).map((formula) => ({
    name: sanitizeText(formula.name, 140),
    latex: sanitizeText(formula.latex, 240),
  }));
}

async function buildFallbackCommonMistakes(chapterId: string): Promise<string[]> {
  const chapter = getChapterById(chapterId);
  if (!chapter) return [];
  const pyq = (await getGroundedPYQData(chapterId)) ?? getPYQData(chapterId);
  const pyqMistakes = (pyq?.importantTopics ?? []).slice(0, 4).map(
    (topic) => `Weak handling of ${topic} during board-style answers.`
  );
  const generic = [
    'Missing stepwise structure in 3-5 mark responses.',
    'Formula or sign errors in numerical steps.',
    'Final answer written without proper unit/keyword.',
  ];
  return cleanTextList([...pyqMistakes, ...generic], 8);
}

function normalizeFormulaDrill(items: TeacherFormulaDrillItem[]): TeacherFormulaDrillItem[] {
  return items
    .map((item) => ({
      name: sanitizeText(String(item.name ?? ''), 140),
      latex: item.latex ? sanitizeText(String(item.latex), 240) : undefined,
    }))
    .filter((item) => item.name.length > 0)
    .slice(0, 10);
}

function withFallbackMcqs(
  aiQuestions: MCQItem[],
  fallbackQuestions: MCQItem[],
  chapterId: string,
  questionCount: number
): MCQItem[] {
  const chapter = getChapterById(chapterId);
  if (!chapter) return fallbackQuestions.slice(0, questionCount);
  const chapterTokenSet = new Set(
    `${chapter.title} ${chapter.topics.join(' ')}`
      .toLowerCase()
      .match(/[a-z]{3,}/g) ?? []
  );
  const alignedAi = normalizeMCQs(aiQuestions).filter((item) => {
    const tokens = item.question.toLowerCase().match(/[a-z]{3,}/g) ?? [];
    return tokens.some((token) => chapterTokenSet.has(token));
  });
  const used = new Set(alignedAi.map((item) => item.question.toLowerCase()));
  const merged = [...alignedAi];
  for (const question of fallbackQuestions) {
    if (merged.length >= questionCount) break;
    const key = question.question.toLowerCase();
    if (used.has(key)) continue;
    merged.push(question);
    used.add(key);
  }
  return ensureExactMcqCount(normalizeMCQs(merged), chapterId, questionCount);
}

function ensureExactMcqCount(items: MCQItem[], chapterId: string, questionCount: number): MCQItem[] {
  const chapter = getChapterById(chapterId);
  const output = normalizeMCQs(items).slice(0, questionCount);
  let cursor = 0;
  while (output.length < questionCount) {
    const topic = chapter?.topics[cursor % Math.max(1, chapter.topics.length)] ?? chapter?.title ?? 'Core concept';
    output.push(buildGeneratedFallbackQuestion(topic, chapter?.title ?? 'Chapter', cursor));
    cursor += 1;
  }
  return normalizeMCQs(output).slice(0, questionCount);
}

function parseAnswerTokenToIndex(token: string, optionCount: number): number | null {
  const clean = token.trim().toUpperCase();
  if (!clean) return null;
  if (/^[A-Z]$/.test(clean)) {
    const letterIndex = clean.charCodeAt(0) - 'A'.charCodeAt(0);
    return letterIndex >= 0 && letterIndex < optionCount ? letterIndex : null;
  }
  if (/^\d+$/.test(clean)) {
    const value = Number(clean);
    if (value >= 0 && value < optionCount) return value;
    if (value >= 1 && value <= optionCount) return value - 1;
  }
  return null;
}

function parseIndexedAnswerList(value: string, optionCount: number): number[] {
  const indexes = value
    .split(/[^A-Za-z0-9]+/)
    .map((token) => parseAnswerTokenToIndex(token, optionCount))
    .filter((entry): entry is number => entry !== null);
  return Array.from(new Set(indexes)).sort((a, b) => a - b);
}

function guessOptionIndex(answerText: string, options: string[]): number | null {
  const clean = answerText.trim();
  if (!clean) return null;

  const optionCount = options.length;
  const optionIndexMatch = clean.match(/option\s*[:=-]?\s*([A-Za-z0-9]+)/i);
  if (optionIndexMatch) {
    return parseAnswerTokenToIndex(optionIndexMatch[1], optionCount);
  }

  const singleTokenMatch = clean.match(/^\s*([A-Za-z0-9]+)\s*$/);
  if (singleTokenMatch) {
    if (/^\d+$/.test(singleTokenMatch[1])) {
      const numeric = Number(singleTokenMatch[1]);
      if (numeric >= 1 && numeric <= optionCount) return numeric - 1;
    }
    const parsed = parseAnswerTokenToIndex(singleTokenMatch[1], optionCount);
    if (parsed !== null) return parsed;
  }

  const lowered = clean.toLowerCase();
  for (let idx = 0; idx < options.length; idx++) {
    const option = options[idx]?.toLowerCase().trim();
    if (!option) continue;
    if (lowered.includes(option)) return idx;
  }

  return null;
}

function parseMultipleOptionIndexes(answerText: string, options: string[]): number[] {
  const clean = answerText.trim();
  if (!clean) return [];
  const optionCount = options.length;
  const prefixedListMatch = clean.match(/options?\s*[:=-]\s*(.+)$/i);
  if (prefixedListMatch) {
    return parseIndexedAnswerList(prefixedListMatch[1], optionCount);
  }
  if (/[,\|;/]/.test(clean)) {
    return parseIndexedAnswerList(clean, optionCount);
  }
  const letterMatches = [...clean.toUpperCase().matchAll(/\b([A-Z])\b/g)]
    .map((match) => parseAnswerTokenToIndex(match[1], optionCount))
    .filter((entry): entry is number => entry !== null);
  if (letterMatches.length >= 2) {
    return Array.from(new Set(letterMatches)).sort((a, b) => a - b);
  }
  return [];
}

function sanitizeAnswers(answers: TeacherSubmissionAnswer[]): TeacherSubmissionAnswer[] {
  return answers
    .map((item) => ({
      questionNo: sanitizeText(item.questionNo, 30).toUpperCase(),
      answerText: sanitizeText(item.answerText, 1500),
    }))
    .filter((item) => item.questionNo.length > 0 && item.answerText.length > 0)
    .slice(0, 140);
}

export async function buildTeacherAssignmentPackDraft(
  request: TeacherAssignmentPackRequest
): Promise<Omit<TeacherAssignmentPack, 'packId' | 'answerKey' | 'createdAt' | 'updatedAt' | 'createdByKeyId' | 'status' | 'shareUrl' | 'printUrl'>> {
  const chapter = getChapterById(request.chapterId);
  if (!chapter) {
    throw new Error('Chapter not found.');
  }

  const questionCount = clampQuestionCount(request.questionCount);
  const difficultyMix = normalizeDifficultyMix(request.difficultyMix);
  const includeShortAnswers = request.includeShortAnswers === true;
  const includeLongAnswers = request.includeLongAnswers !== false; // default true for backward-compat
  const includeFormulaDrill = request.includeFormulaDrill === true;

  const fallbackMcqs = buildFallbackMcqs(chapter.id, questionCount);
  const fallbackShortAnswers = buildFallbackShortAnswers(chapter.id, includeShortAnswers);
  const fallbackLongAnswers = includeLongAnswers ? buildFallbackLongAnswers(chapter.id) : [];
  const fallbackFormulaDrill = buildFallbackFormulaDrill(chapter.id, includeFormulaDrill);
  const fallbackMistakes = await buildFallbackCommonMistakes(chapter.id);
  const fallbackEstimatedTime = Math.max(
    20,
    questionCount * 2 + (includeShortAnswers ? fallbackShortAnswers.length * 5 : 0)
  );

  const contextPack = await getContextPack({
    task: 'chapter-drill',
    classLevel: chapter.classLevel,
    subject: chapter.subject,
    chapterId: chapter.id,
    chapterTopics: chapter.topics,
    query: `teacher assignment pack ${chapter.title} ${difficultyMix}`,
    topK: 6,
  });
  const variation = buildVariationProfile({
    task: 'chapter-drill',
    contextHash: contextPack.contextHash,
    chapterId: chapter.id,
    difficulty: difficultyMix,
  });

  const pyq = (await getGroundedPYQData(chapter.id)) ?? getPYQData(chapter.id);
  const annotatedFallbackMcqs = annotateQuestionsWithRagMeta(fallbackMcqs, {
    chapterTitle: chapter.title,
    chapterTopics: chapter.topics,
    pyqTopics: pyq?.importantTopics ?? [],
    contextSnippets: contextPack.snippets,
  });
  const prompt = `Create a teacher-ready assignment pack for CBSE chapter practice.
Chapter: ${chapter.title} (${chapter.subject}, Class ${chapter.classLevel}, id ${chapter.id})
Requested MCQs: ${questionCount}
Difficulty mix: ${difficultyMix}
Include short answers: ${includeShortAnswers ? 'yes' : 'no'}
Include formula drill: ${includeFormulaDrill ? 'yes' : 'no'}
PYQ hints: ${pyq ? `avg marks ${pyq.avgMarks}, high-yield topics: ${pyq.importantTopics.join(', ')}` : 'No PYQ hints available'}

Return ONLY JSON:
{
  "title":"...",
  "mcqs":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}],
  "shortAnswers":["..."],
  "longAnswers":["..."],
  "formulaDrill":[{"name":"...","latex":"..."}],
  "commonMistakes":["..."],
  "estimatedTimeMinutes":45
}`;
  const promptWithVariation = `${prompt}
${buildVariationInstruction(variation)}`;

  try {
    const { data } = await generateTaskJson<AssignmentDraftModelResponse>({
      task: 'chapter-drill',
      contextHash: contextPack.contextHash,
      contextSnippets: contextPack.snippets,
      chapterId: chapter.id,
      difficulty: difficultyMix,
      diversityKey: variation.diversityKey,
      systemPrompt: `You are VidyaPath Teacher Worksheet Generator.
- Produce chapter-specific classroom-ready packs.
- Ensure MCQs are unambiguous and board-aligned.
- Keep short answers exam-oriented and measurable.
- Keep output strictly valid JSON.`,
      userPrompt: promptWithVariation,
      temperature: 0.22,
      maxOutputTokens: 3000,
      validate: isAssignmentDraftResponse,
    });

    const mcqs = annotateQuestionsWithRagMeta(
      withFallbackMcqs(data.mcqs, annotatedFallbackMcqs, chapter.id, questionCount),
      {
        chapterTitle: chapter.title,
        chapterTopics: chapter.topics,
        pyqTopics: pyq?.importantTopics ?? [],
        contextSnippets: contextPack.snippets,
      }
    );
    const shortAnswers = includeShortAnswers
      ? cleanTextList(data.shortAnswers, 12).length > 0
        ? cleanTextList(data.shortAnswers, 12)
        : fallbackShortAnswers
      : [];
    const longAnswers = cleanTextList(data.longAnswers, 8).length > 0
      ? cleanTextList(data.longAnswers, 8)
      : fallbackLongAnswers;
    const formulaDrill = includeFormulaDrill
      ? normalizeFormulaDrill(data.formulaDrill).length > 0
        ? normalizeFormulaDrill(data.formulaDrill)
        : fallbackFormulaDrill
      : [];
    const commonMistakes = cleanTextList(data.commonMistakes, 10).length > 0
      ? cleanTextList(data.commonMistakes, 10)
      : fallbackMistakes;
    const estimatedTimeMinutes = Math.max(15, Math.min(240, Number(data.estimatedTimeMinutes) || fallbackEstimatedTime));

    return {
      title: sanitizeText(data.title, 180) || `${chapter.title} Classroom Pack`,
      chapterId: chapter.id,
      classLevel: chapter.classLevel as 10 | 12,
      subject: chapter.subject,
      questionCount,
      difficultyMix,
      dueDate: request.dueDate ? sanitizeText(request.dueDate, 40) : undefined,
      includeShortAnswers,
      includeFormulaDrill,
      mcqs,
      shortAnswers,
      longAnswers,
      formulaDrill,
      commonMistakes,
      estimatedTimeMinutes,
    };
  } catch {
    return {
      title: `${chapter.title} Classroom Pack`,
      chapterId: chapter.id,
      classLevel: chapter.classLevel as 10 | 12,
      subject: chapter.subject,
      questionCount,
      difficultyMix,
      dueDate: request.dueDate ? sanitizeText(request.dueDate, 40) : undefined,
      includeShortAnswers,
      includeFormulaDrill,
      mcqs: annotatedFallbackMcqs,
      shortAnswers: fallbackShortAnswers,
      longAnswers: fallbackLongAnswers,
      formulaDrill: fallbackFormulaDrill,
      commonMistakes: fallbackMistakes,
      estimatedTimeMinutes: fallbackEstimatedTime,
    };
  }
}

export function evaluateTeacherAssignmentSubmission(
  pack: TeacherAssignmentPack,
  answers: TeacherSubmissionAnswer[]
): TeacherSubmissionResult {
  const sanitized = sanitizeAnswers(answers);
  const answerMap = new Map<string, string>();
  for (const answer of sanitized) {
    answerMap.set(answer.questionNo, answer.answerText);
  }

  const mcqTotal = pack.mcqs.length;
  let mcqPoints = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let partialCount = 0;
  let unansweredCount = 0;
  const mistakes: string[] = [];
  const weakTopicTokens: string[] = [];
  const questionResults: TeacherQuestionResult[] = [];

  for (let idx = 0; idx < pack.mcqs.length; idx++) {
    const questionNo = `Q${idx + 1}`;
    const studentAnswer = answerMap.get(questionNo);
    const question = pack.mcqs[idx];
    const prompt = sanitizeText(question.question, 320);
    const optionLabels = question.options.length >= 5 ? 'A/B/C/D/E' : 'A/B/C/D';
    const multiAnswerIndexes = Array.isArray(question.answers)
      ? Array.from(
          new Set(
            question.answers.filter(
              (entry) => Number.isInteger(entry) && entry >= 0 && entry < question.options.length
            )
          )
        ).sort((a, b) => a - b)
      : [];
    const isMultiple = question.answerMode === 'multiple' && multiAnswerIndexes.length >= 2;
    const singleIndex = Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length
      ? question.answer
      : 0;
    const correctIndexes = isMultiple ? multiAnswerIndexes : [singleIndex];
    const expectedAnswer = correctIndexes
      .map((correctIndex) => `${String.fromCharCode(65 + correctIndex)}. ${question.options[correctIndex] ?? ''}`)
      .join(' | ');
    if (!studentAnswer) {
      mistakes.push(`${questionNo}: left unanswered.`);
      weakTopicTokens.push(...(question.question.toLowerCase().match(/[a-z]{4,}/g) ?? []).slice(0, 2));
      unansweredCount += 1;
      questionResults.push({
        questionNo,
        kind: 'mcq',
        prompt,
        studentAnswer: '',
        expectedAnswer,
        verdict: 'unanswered',
        scoreAwarded: 0,
        maxScore: 1,
        feedback: 'No option selected.',
      });
      continue;
    }

    if (isMultiple) {
      const parsedIndexes = parseMultipleOptionIndexes(studentAnswer, question.options);
      const fallbackSingle = guessOptionIndex(studentAnswer, question.options);
      const selectedIndexes = parsedIndexes.length > 0
        ? parsedIndexes
        : (fallbackSingle !== null ? [fallbackSingle] : []);
      if (selectedIndexes.length === 0) {
        mistakes.push(`${questionNo}: answer format unclear; choose ${optionLabels} explicitly.`);
        weakTopicTokens.push(...(question.question.toLowerCase().match(/[a-z]{4,}/g) ?? []).slice(0, 2));
        wrongCount += 1;
        questionResults.push({
          questionNo,
          kind: 'mcq',
          prompt,
          studentAnswer,
          expectedAnswer,
          verdict: 'wrong',
          scoreAwarded: 0,
          maxScore: 1,
          feedback: `Answer format unclear. Use ${optionLabels} or option indexes.`,
        });
        continue;
      }
      const selectedSet = new Set(selectedIndexes);
      const correctSet = new Set(correctIndexes);
      const overlapCount = [...selectedSet].filter((entry) => correctSet.has(entry)).length;
      const isExact = selectedSet.size === correctSet.size && [...selectedSet].every((entry) => correctSet.has(entry));
      if (isExact) {
        mcqPoints += 1;
        correctCount += 1;
        questionResults.push({
          questionNo,
          kind: 'mcq',
          prompt,
          studentAnswer,
          expectedAnswer,
          verdict: 'correct',
          scoreAwarded: 1,
          maxScore: 1,
          feedback: 'All correct options selected.',
        });
        continue;
      }
      if (overlapCount > 0) {
        mcqPoints += 0.5;
        partialCount += 1;
        mistakes.push(`${questionNo}: partially correct multi-select answer. Review missed or extra options.`);
        weakTopicTokens.push(...(question.question.toLowerCase().match(/[a-z]{4,}/g) ?? []).slice(0, 2));
        questionResults.push({
          questionNo,
          kind: 'mcq',
          prompt,
          studentAnswer,
          expectedAnswer,
          verdict: 'partial',
          scoreAwarded: 0.5,
          maxScore: 1,
          feedback: 'Partially correct. You selected some correct options but missed or added others.',
        });
        continue;
      }
      mistakes.push(`${questionNo}: incorrect options selected. Recheck the core concept and condition.`);
      weakTopicTokens.push(...(question.question.toLowerCase().match(/[a-z]{4,}/g) ?? []).slice(0, 3));
      wrongCount += 1;
      questionResults.push({
        questionNo,
        kind: 'mcq',
        prompt,
        studentAnswer,
        expectedAnswer,
        verdict: 'wrong',
        scoreAwarded: 0,
        maxScore: 1,
        feedback: 'Incorrect options selected.',
      });
      continue;
    }

    const selected = guessOptionIndex(studentAnswer, question.options);
    if (selected === null) {
      mistakes.push(`${questionNo}: answer format unclear; choose ${optionLabels} explicitly.`);
      weakTopicTokens.push(...(question.question.toLowerCase().match(/[a-z]{4,}/g) ?? []).slice(0, 2));
      wrongCount += 1;
      questionResults.push({
        questionNo,
        kind: 'mcq',
        prompt,
        studentAnswer,
        expectedAnswer,
        verdict: 'wrong',
        scoreAwarded: 0,
        maxScore: 1,
        feedback: `Answer format unclear. Use ${optionLabels} or option index.`,
      });
      continue;
    }

    if (selected === singleIndex) {
      mcqPoints += 1;
      correctCount += 1;
      questionResults.push({
        questionNo,
        kind: 'mcq',
        prompt,
        studentAnswer,
        expectedAnswer,
        verdict: 'correct',
        scoreAwarded: 1,
        maxScore: 1,
        feedback: 'Correct option selected.',
      });
      continue;
    }

    mistakes.push(`${questionNo}: incorrect option. Recheck the core concept and condition.`);
    weakTopicTokens.push(...(question.question.toLowerCase().match(/[a-z]{4,}/g) ?? []).slice(0, 3));
    wrongCount += 1;
    questionResults.push({
      questionNo,
      kind: 'mcq',
      prompt,
      studentAnswer,
      expectedAnswer,
      verdict: 'wrong',
      scoreAwarded: 0,
      maxScore: 1,
      feedback: 'Incorrect option selected.',
    });
  }

  const shortAnswerTotal = pack.shortAnswers.length;
  let shortPoints = 0;
  for (let idx = 0; idx < shortAnswerTotal; idx++) {
    const questionNo = `S${idx + 1}`;
    const studentAnswer = answerMap.get(questionNo);
    const prompt = sanitizeText(pack.shortAnswers[idx], 320);
    if (!studentAnswer) {
      mistakes.push(`${questionNo}: short answer missing.`);
      unansweredCount += 1;
      questionResults.push({
        questionNo,
        kind: 'short',
        prompt,
        studentAnswer: '',
        verdict: 'unanswered',
        scoreAwarded: 0,
        maxScore: 1,
        feedback: 'No answer submitted.',
      });
      continue;
    }
    const words = studentAnswer.split(/\s+/).filter(Boolean).length;
    const keywords = prompt.toLowerCase().match(/[a-z]{5,}/g) ?? [];
    const keywordHits = keywords.filter((token, index, arr) => arr.indexOf(token) === index)
      .filter((token) => studentAnswer.toLowerCase().includes(token)).length;
    let verdict: TeacherQuestionVerdict = 'wrong';
    let scoreAwarded = 0;
    let feedback = 'Answer needs clearer stepwise structure and key terms.';

    if (words >= 45 || (words >= 28 && keywordHits >= 2)) {
      verdict = 'correct';
      scoreAwarded = 1;
      feedback = 'Good board-style answer with adequate depth.';
      correctCount += 1;
    } else if (words >= 16 || keywordHits >= 1) {
      verdict = 'partial';
      scoreAwarded = 0.5;
      feedback = 'Partially correct. Add missing key points and conclusion.';
      partialCount += 1;
      mistakes.push(`${questionNo}: partially correct; expand with key terms and final conclusion.`);
    } else {
      verdict = 'wrong';
      scoreAwarded = 0;
      feedback = 'Too brief/incomplete. Rewrite with structured points.';
      wrongCount += 1;
      mistakes.push(`${questionNo}: answer too brief; add structured points and final conclusion.`);
    }
    shortPoints += scoreAwarded;
    questionResults.push({
      questionNo,
      kind: 'short',
      prompt,
      studentAnswer,
      verdict,
      scoreAwarded,
      maxScore: 1,
      feedback,
    });
  }

  const longAnswerTotal = pack.longAnswers.length;
  let longPoints = 0;
  for (let idx = 0; idx < longAnswerTotal; idx++) {
    const questionNo = `L${idx + 1}`;
    const studentAnswer = answerMap.get(questionNo);
    const prompt = sanitizeText(pack.longAnswers[idx], 320);
    if (!studentAnswer) {
      mistakes.push(`${questionNo}: long answer missing.`);
      unansweredCount += 1;
      questionResults.push({
        questionNo,
        kind: 'long',
        prompt,
        studentAnswer: '',
        verdict: 'unanswered',
        scoreAwarded: 0,
        maxScore: 2,
        feedback: 'No answer submitted.',
      });
      continue;
    }

    const words = studentAnswer.split(/\s+/).filter(Boolean).length;
    const keywords = prompt.toLowerCase().match(/[a-z]{5,}/g) ?? [];
    const keywordHits = keywords
      .filter((token, index, arr) => arr.indexOf(token) === index)
      .filter((token) => studentAnswer.toLowerCase().includes(token)).length;

    let verdict: TeacherQuestionVerdict = 'wrong';
    let scoreAwarded = 0;
    let feedback = 'Needs better depth, structure, and key terms.';
    if (words >= 85 || (words >= 60 && keywordHits >= 3)) {
      verdict = 'correct';
      scoreAwarded = 2;
      feedback = 'Strong long answer with good structure and depth.';
      correctCount += 1;
    } else if (words >= 45 || keywordHits >= 2) {
      verdict = 'partial';
      scoreAwarded = 1;
      feedback = 'Partially correct. Add missing points and final conclusion.';
      partialCount += 1;
      mistakes.push(`${questionNo}: partially correct long answer; improve depth and keywords.`);
    } else {
      verdict = 'wrong';
      scoreAwarded = 0;
      feedback = 'Too brief for long-answer marking.';
      wrongCount += 1;
      mistakes.push(`${questionNo}: long answer too brief; expand with structured points.`);
    }
    longPoints += scoreAwarded;
    questionResults.push({
      questionNo,
      kind: 'long',
      prompt,
      studentAnswer,
      verdict,
      scoreAwarded,
      maxScore: 2,
      feedback,
    });
  }

  const totalPoints = Math.max(1, mcqTotal + shortAnswerTotal + longAnswerTotal * 2);
  const earnedPoints = mcqPoints + shortPoints + longPoints;
  const scoreEstimate = Math.round((earnedPoints / totalPoints) * 100);

  const weakTopics = cleanTextList(
    [
      ...pack.commonMistakes,
      ...weakTopicTokens.map((token) => token.replace(/[^a-z]/gi, ' ').trim()),
      ...pack.shortAnswers.slice(0, 4).map((item) => item.split(':').pop() ?? item),
      ...pack.longAnswers.slice(0, 3).map((item) => item.split(':').pop() ?? item),
    ],
    8
  );

  const nextActions = cleanTextList(
    [
      scoreEstimate < 60
        ? 'Re-attempt this pack after revising high-yield topics and formula conditions.'
        : 'Attempt a harder mixed chapter pack for progression.',
      'Review every wrong question and write one-line correction notes.',
      ...(pack.includeFormulaDrill ? ['Practice formula drill once without notes and check units/signs.'] : []),
      ...(pack.includeShortAnswers ? ['Rewrite short answers in board format: keyword points + conclusion.'] : []),
    ],
    6
  );

  const attemptDetail: TeacherSubmissionAttemptDetail = {
    questionResults,
    correctCount,
    wrongCount,
    partialCount,
    unansweredCount,
    attemptNo: 1,
    submittedAt: new Date().toISOString(),
  };

  return {
    scoreEstimate: Math.max(0, Math.min(100, scoreEstimate)),
    mistakes: cleanTextList(mistakes, 12),
    weakTopics,
    nextActions,
    attemptDetail,
  };
}

export function buildTeacherPackUrls(packId: string): { shareUrl: string; printUrl: string } {
  const normalizedPackId = sanitizeText(packId, 80);
  return {
    shareUrl: `/practice/assignment/${normalizedPackId}`,
    printUrl: `/practice/assignment/${normalizedPackId}?print=1`,
  };
}

export function toAnswerKey(mcqs: MCQItem[]): number[] {
  return mcqs.map((item) => item.answer);
}

export function sanitizePackTitle(chapterId: string, title: string): string {
  const chapter = getChapterById(chapterId);
  const normalized = sanitizeText(stripSourceTags(title), 180);
  if (normalized) return normalized;
  return chapter ? `${chapter.title} Classroom Pack` : 'Classroom Assignment Pack';
}
