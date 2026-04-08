export interface FlashcardItem {
  front: string;
  back: string;
}

export interface MCQItem {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface RevisionWeek {
  week: number;
  focusChapters: string[];
  tasks: string[];
  targetMarks: number;
  reviewSlots?: string[];
  miniTests?: string[];
}

export interface RevisionPlanResponse {
  planWeeks: RevisionWeek[];
}

export interface PaperEvaluateResponse {
  scoreEstimate: number;
  sectionBreakdown: Array<{ section: string; score: number; maxScore: number }>;
  mistakes: string[];
  improvementTasks: string[];
  weakTopics?: string[];
  recommendedChapters?: string[];
}

export interface AdaptiveTestResponse {
  questions: MCQItem[];
  answerKey: number[];
  topicCoverage: string[];
  predictedScoreBand: string;
}

export interface ChapterCitation {
  sourcePath: string;
  year?: number;
}

export interface ChapterPackResponse {
  chapterId: string;
  chapterTitle: string;
  classLevel: number;
  subject: string;
  highYieldTopics: string[];
  formulaFocus: string[];
  pyqTrend: {
    yearsAsked: number[];
    avgMarks: number;
    frequencyLabel: string;
  };
  commonMistakes: string[];
  examStrategy: string[];
  sourceCitations: ChapterCitation[];
}

export interface ChapterDrillResponse {
  chapterId: string;
  difficulty: string;
  questions: MCQItem[];
  answerKey: number[];
  topicCoverage: string[];
  sourceCitations: ChapterCitation[];
}

export interface ChapterDiagnoseResponse {
  chapterId: string;
  riskLevel: 'low' | 'medium' | 'high';
  weakTags: string[];
  diagnosis: string[];
  nextActions: string[];
  recommendedTaskTypes: string[];
}

export interface ChapterRemediateDay {
  day: number;
  focus: string;
  tasks: string[];
  targetOutcome: string;
}

export interface ChapterRemediateResponse {
  chapterId: string;
  dayPlan: ChapterRemediateDay[];
  checkpoints: string[];
  expectedScoreLift: string;
}

const SOURCE_TAG_RE = /\s*\[S\d+\]\s*/gi;
const MULTI_SPACE_RE = /\s{2,}/g;

export function stripSourceTags(text: string): string {
  return text.replace(SOURCE_TAG_RE, ' ').replace(MULTI_SPACE_RE, ' ').trim();
}

function canonicalizeSourcePath(sourcePath: string): string {
  return sourcePath
    .replace(/\\/g, '/')
    .replace(/\/[^/]+\.zip_extracted\//i, '/')
    .replace(/\/{2,}/g, '/')
    .trim();
}

export function cleanTextList(items: string[], maxItems = 10): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const cleaned = stripSourceTags(String(item || '').trim());
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
    if (output.length >= maxItems) break;
  }
  return output;
}

export function isFlashcardArray(value: unknown): value is FlashcardItem[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).front === 'string' &&
      typeof (item as Record<string, unknown>).back === 'string'
  );
}

export function isMCQArray(value: unknown): value is MCQItem[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    const options = Array.isArray(record.options)
      ? record.options.filter((option): option is string => typeof option === 'string')
      : [];
    const answer = typeof record.answer === 'number' ? record.answer : Number(record.answer);
    return (
      typeof record.question === 'string' &&
      options.length === 4 &&
      Number.isFinite(answer) &&
      answer >= 0 &&
      answer <= 3
    );
  });
}

export function isRevisionPlanResponse(value: unknown): value is RevisionPlanResponse {
  if (!value || typeof value !== 'object') return false;
  const weeks = (value as Record<string, unknown>).planWeeks;
  if (!Array.isArray(weeks)) return false;
  return weeks.every((week) => {
    if (!week || typeof week !== 'object') return false;
    const record = week as Record<string, unknown>;
    return (
      Number.isFinite(Number(record.week)) &&
      Array.isArray(record.focusChapters) &&
      Array.isArray(record.tasks) &&
      Number.isFinite(Number(record.targetMarks))
    );
  });
}

export function isPaperEvaluateResponse(value: unknown): value is PaperEvaluateResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isFinite(Number(record.scoreEstimate)) &&
    Array.isArray(record.sectionBreakdown) &&
    Array.isArray(record.mistakes) &&
    Array.isArray(record.improvementTasks)
  );
}

export function isAdaptiveTestResponse(value: unknown): value is AdaptiveTestResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    isMCQArray(record.questions) &&
    Array.isArray(record.answerKey) &&
    Array.isArray(record.topicCoverage) &&
    typeof record.predictedScoreBand === 'string'
  );
}

export function isChapterCitationArray(value: unknown): value is ChapterCitation[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    return typeof record.sourcePath === 'string';
  });
}

export function isChapterPackResponse(value: unknown): value is ChapterPackResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const pyqTrend = record.pyqTrend as Record<string, unknown> | undefined;
  return (
    typeof record.chapterId === 'string' &&
    typeof record.chapterTitle === 'string' &&
    Number.isFinite(Number(record.classLevel)) &&
    typeof record.subject === 'string' &&
    Array.isArray(record.highYieldTopics) &&
    Array.isArray(record.formulaFocus) &&
    !!pyqTrend &&
    Array.isArray(pyqTrend.yearsAsked) &&
    Number.isFinite(Number(pyqTrend.avgMarks)) &&
    typeof pyqTrend.frequencyLabel === 'string' &&
    Array.isArray(record.commonMistakes) &&
    Array.isArray(record.examStrategy) &&
    isChapterCitationArray(record.sourceCitations)
  );
}

export function isChapterDrillResponse(value: unknown): value is ChapterDrillResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.chapterId === 'string' &&
    typeof record.difficulty === 'string' &&
    isMCQArray(record.questions) &&
    Array.isArray(record.answerKey) &&
    Array.isArray(record.topicCoverage) &&
    isChapterCitationArray(record.sourceCitations)
  );
}

export function isChapterDiagnoseResponse(value: unknown): value is ChapterDiagnoseResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.chapterId === 'string' &&
    (record.riskLevel === 'low' || record.riskLevel === 'medium' || record.riskLevel === 'high') &&
    Array.isArray(record.weakTags) &&
    Array.isArray(record.diagnosis) &&
    Array.isArray(record.nextActions) &&
    Array.isArray(record.recommendedTaskTypes)
  );
}

export function isChapterRemediateResponse(value: unknown): value is ChapterRemediateResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (typeof record.chapterId !== 'string' || !Array.isArray(record.dayPlan) || !Array.isArray(record.checkpoints)) {
    return false;
  }
  const validDayPlan = record.dayPlan.every((dayItem) => {
    if (!dayItem || typeof dayItem !== 'object') return false;
    const day = dayItem as Record<string, unknown>;
    return (
      Number.isFinite(Number(day.day)) &&
      typeof day.focus === 'string' &&
      Array.isArray(day.tasks) &&
      typeof day.targetOutcome === 'string'
    );
  });
  return validDayPlan && typeof record.expectedScoreLift === 'string';
}

export function normalizeFlashcards(cards: FlashcardItem[]): FlashcardItem[] {
  return cards
    .map((card) => ({
      front: stripSourceTags(card.front.trim()),
      back: stripSourceTags(card.back.trim()),
    }))
    .filter((card) => card.front.length > 0 && card.back.length > 0);
}

export function normalizeMCQs(items: MCQItem[]): MCQItem[] {
  return items
    .map((item) => ({
      question: stripSourceTags(item.question.trim()),
      options: item.options.map((option) => stripSourceTags(option.trim())).slice(0, 4),
      answer: Number(item.answer),
      explanation: stripSourceTags((item.explanation || '').trim()) || 'Revise this concept from NCERT and PYQ context.',
    }))
    .filter((item) => item.question && item.options.length === 4 && item.answer >= 0 && item.answer <= 3);
}

export function normalizeChapterCitations(citations: ChapterCitation[]): ChapterCitation[] {
  const seen = new Set<string>();
  const output: ChapterCitation[] = [];
  for (const citation of citations) {
    const sourcePath = canonicalizeSourcePath(citation.sourcePath || '');
    if (!sourcePath) continue;
    if (seen.has(sourcePath)) continue;
    seen.add(sourcePath);
    output.push({
      sourcePath,
      year: Number.isFinite(Number(citation.year)) ? Number(citation.year) : undefined,
    });
    if (output.length >= 8) break;
  }
  return output;
}
