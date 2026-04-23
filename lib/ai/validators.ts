export interface FlashcardItem {
  front: string;
  back: string;
}

export type MCQPyqTag = 'asked-before' | 'pyq-inspired' | 'new';
export type MCQQualityBand = 'high' | 'medium' | 'baseline';

export interface MCQRagMeta {
  askedInPastExam: boolean;
  pyqTag: MCQPyqTag;
  years?: number[];
  sourceMix?: Array<'paper' | 'textbook'>;
  qualityBand?: MCQQualityBand;
  qualityScore?: number;
}

export interface MCQItem {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  answerMode?: 'single' | 'multiple';
  answers?: number[];
  ragMeta?: MCQRagMeta;
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
    const answerMode = record.answerMode === 'multiple' ? 'multiple' : 'single';
    const answers = Array.isArray(record.answers)
      ? record.answers.filter((entry): entry is number => Number.isFinite(Number(entry))).map((entry) => Number(entry))
      : [];
    const validSingle = Number.isFinite(answer) && answer >= 0 && answer < options.length;
    const validMultiple = answerMode === 'multiple'
      ? answers.length >= 2 && answers.every((entry) => Number.isInteger(entry) && entry >= 0 && entry < options.length)
      : true;
    return (
      typeof record.question === 'string' &&
      options.length >= 4 &&
      options.length <= 5 &&
      validSingle &&
      validMultiple
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

function normalizeQuestionRagMeta(value: unknown): MCQRagMeta | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const askedInPastExam = record.askedInPastExam === true;
  const pyqTag: MCQPyqTag = record.pyqTag === 'asked-before' || record.pyqTag === 'pyq-inspired' || record.pyqTag === 'new'
    ? record.pyqTag
    : (askedInPastExam ? 'asked-before' : 'new');
  const years = Array.isArray(record.years)
    ? Array.from(
        new Set(
          record.years
            .map((entry) => Number(entry))
            .filter((entry) => Number.isInteger(entry) && entry >= 1980 && entry <= 2100)
        )
      ).sort((a, b) => b - a).slice(0, 8)
    : [];
  const sourceMix = Array.isArray(record.sourceMix)
    ? Array.from(
        new Set(
          record.sourceMix
            .filter((entry): entry is 'paper' | 'textbook' => entry === 'paper' || entry === 'textbook')
        )
      ).slice(0, 2)
    : [];
  const qualityScoreValue = Number(record.qualityScore);
  const qualityScore = Number.isFinite(qualityScoreValue)
    ? Math.max(0, Math.min(100, Math.round(qualityScoreValue)))
    : undefined;
  const qualityBand: MCQQualityBand | undefined =
    record.qualityBand === 'high' || record.qualityBand === 'medium' || record.qualityBand === 'baseline'
      ? record.qualityBand
      : (qualityScore !== undefined ? (qualityScore >= 78 ? 'high' : qualityScore >= 58 ? 'medium' : 'baseline') : undefined);

  if (!askedInPastExam && pyqTag === 'new' && years.length === 0 && sourceMix.length === 0 && qualityBand === undefined && qualityScore === undefined) {
    return undefined;
  }

  return {
    askedInPastExam,
    pyqTag,
    years: years.length > 0 ? years : undefined,
    sourceMix: sourceMix.length > 0 ? sourceMix : undefined,
    qualityBand,
    qualityScore,
  };
}

export function normalizeMCQs(items: MCQItem[]): MCQItem[] {
  return items
    .map((item) => {
      const options = item.options.map((option) => stripSourceTags(option.trim())).filter(Boolean).slice(0, 5);
      const fallbackAnswer = Number(item.answer);
      const mode: 'single' | 'multiple' = item.answerMode === 'multiple' ? 'multiple' : 'single';
      const uniqueAnswers = Array.from(
        new Set(
          (Array.isArray(item.answers) ? item.answers : [])
            .map((entry) => Number(entry))
            .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry < options.length)
        )
      ).sort((a, b) => a - b);
      const effectiveAnswers = uniqueAnswers.length > 0
        ? uniqueAnswers
        : (Number.isInteger(fallbackAnswer) && fallbackAnswer >= 0 && fallbackAnswer < options.length ? [fallbackAnswer] : [0]);
      const answer = effectiveAnswers[0] ?? 0;
      const answerMode: 'single' | 'multiple' = mode === 'multiple' && effectiveAnswers.length >= 2 ? 'multiple' : 'single';
      return {
        question: stripSourceTags(item.question.trim()),
        options,
        answer,
        answers: answerMode === 'multiple' ? effectiveAnswers : undefined,
        answerMode,
        explanation: stripSourceTags((item.explanation || '').trim()) || 'Revise this concept from NCERT and PYQ context.',
        ragMeta: normalizeQuestionRagMeta(item.ragMeta),
      };
    })
    .filter((item) => item.question && item.options.length >= 4 && item.options.length <= 5 && item.answer >= 0 && item.answer < item.options.length);
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
