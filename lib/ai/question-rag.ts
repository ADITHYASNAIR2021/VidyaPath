import type { ContextSnippet } from '@/lib/ai/context-retriever';
import type { MCQItem, MCQPyqTag, MCQQualityBand } from '@/lib/ai/validators';

interface AnnotateOptions {
  chapterTitle?: string;
  chapterTopics?: string[];
  pyqTopics?: string[];
  contextSnippets?: ContextSnippet[];
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'which', 'what',
  'following', 'correct', 'statement', 'about', 'into', 'than', 'when',
  'where', 'while', 'have', 'has', 'had', 'then', 'there', 'their', 'your',
  'will', 'would', 'could', 'should', 'been', 'being', 'also', 'only',
  'each', 'most', 'more', 'less', 'very', 'much', 'many', 'such', 'these',
  'those', 'during', 'board', 'exam', 'chapter', 'class',
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((token) => !STOP_WORDS.has(token));
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function inferYearFromSourcePath(sourcePath: string): number | undefined {
  const matches = sourcePath.match(/(?:19|20)\d{2}/g);
  if (!matches || matches.length === 0) return undefined;
  const years = matches
    .map((value) => Number(value))
    .filter((year) => Number.isInteger(year) && year >= 1980 && year <= 2100);
  if (years.length === 0) return undefined;
  return Math.max(...years);
}

function getSnippetYear(snippet: ContextSnippet): number | undefined {
  const direct = Number(snippet.year);
  if (Number.isInteger(direct) && direct >= 1980 && direct <= 2100) return direct;
  return inferYearFromSourcePath(snippet.sourcePath || '');
}

function buildQualityBand(score: number): MCQQualityBand {
  if (score >= 78) return 'high';
  if (score >= 58) return 'medium';
  return 'baseline';
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getPyqTopicHit(questionTokens: Set<string>, pyqTopics: string[]): boolean {
  if (pyqTopics.length === 0) return false;
  const pyqTokens = new Set(tokenize(pyqTopics.join(' ')));
  if (pyqTokens.size === 0) return false;
  return countOverlap(questionTokens, pyqTokens) >= 1;
}

function getSourceType(snippet: ContextSnippet): 'paper' | 'textbook' {
  return snippet.sourceType === 'textbook' ? 'textbook' : 'paper';
}

function buildPyqTag(input: {
  paperEvidenceCount: number;
  years: number[];
  pyqTopicHit: boolean;
}): MCQPyqTag {
  if (input.paperEvidenceCount > 0 && input.years.length > 0) return 'asked-before';
  if (input.paperEvidenceCount > 0 || input.pyqTopicHit) return 'pyq-inspired';
  return 'new';
}

function scoreQuestionQuality(input: {
  item: MCQItem;
  topicTokenSet: Set<string>;
  matchedSnippetCount: number;
  paperEvidenceCount: number;
}): number {
  const { item, topicTokenSet, matchedSnippetCount, paperEvidenceCount } = input;
  const question = item.question || '';
  const explanation = item.explanation || '';
  const questionTokens = new Set(tokenize(question));
  const topicOverlap = countOverlap(questionTokens, topicTokenSet);
  const optionTexts = (item.options ?? []).map((option) => String(option || '').trim()).filter(Boolean);
  const uniqueOptions = unique(optionTexts.map((option) => option.toLowerCase()));
  const optionLengths = optionTexts.map((option) => option.length);

  let score = 42;

  if (question.length >= 24 && question.length <= 240) score += 10;
  else if (question.length >= 12) score += 4;
  else score -= 8;

  if (optionTexts.length >= 4 && optionTexts.length <= 5) score += 12;
  else score -= 20;

  if (uniqueOptions.length === optionTexts.length) score += 8;
  else score -= 12;

  if (optionLengths.length > 0) {
    const shortOptions = optionLengths.filter((length) => length < 6).length;
    if (shortOptions === 0) score += 5;
    else if (shortOptions <= 1) score += 2;
    else score -= 4;
  }

  if (explanation.length >= 24) score += 6;
  else if (explanation.length > 0) score += 2;

  if (topicOverlap >= 2) score += 12;
  else if (topicOverlap === 1) score += 6;
  else score -= 8;

  if (matchedSnippetCount > 0) score += Math.min(16, matchedSnippetCount * 4);
  if (paperEvidenceCount > 0) score += 4;

  if (item.answerMode === 'multiple' && Array.isArray(item.answers) && item.answers.length >= 2) {
    score += 3;
  }

  return clampScore(score);
}

export function annotateQuestionsWithRagMeta(
  items: MCQItem[],
  options: AnnotateOptions
): MCQItem[] {
  const chapterTitle = options.chapterTitle || '';
  const chapterTopics = Array.isArray(options.chapterTopics) ? options.chapterTopics : [];
  const pyqTopics = Array.isArray(options.pyqTopics) ? options.pyqTopics : [];
  const snippets = Array.isArray(options.contextSnippets) ? options.contextSnippets : [];
  const topicTokenSet = new Set(tokenize([chapterTitle, ...chapterTopics, ...pyqTopics].join(' ')));

  if (items.length === 0) return [];

  return items.map((item) => {
    const questionTokens = new Set(tokenize(item.question || ''));
    const matchedSnippets = snippets.filter((snippet) => {
      const snippetTokens = new Set(tokenize(snippet.text || ''));
      return countOverlap(questionTokens, snippetTokens) >= 2;
    });
    const paperEvidence = matchedSnippets.filter((snippet) => getSourceType(snippet) === 'paper');
    const textbookEvidence = matchedSnippets.filter((snippet) => getSourceType(snippet) === 'textbook');
    const years = unique(
      paperEvidence
        .map((snippet) => getSnippetYear(snippet))
        .filter((year): year is number => Number.isInteger(year))
    )
      .sort((a, b) => b - a)
      .slice(0, 8);
    const pyqTopicHit = getPyqTopicHit(questionTokens, pyqTopics);
    const pyqTag = buildPyqTag({
      paperEvidenceCount: paperEvidence.length,
      years,
      pyqTopicHit,
    });
    const qualityScore = scoreQuestionQuality({
      item,
      topicTokenSet,
      matchedSnippetCount: matchedSnippets.length,
      paperEvidenceCount: paperEvidence.length,
    });
    const sourceMix = unique([
      ...(paperEvidence.length > 0 ? ['paper' as const] : []),
      ...(textbookEvidence.length > 0 ? ['textbook' as const] : []),
    ]);

    return {
      ...item,
      ragMeta: {
        askedInPastExam: pyqTag === 'asked-before',
        pyqTag,
        years: years.length > 0 ? years : undefined,
        sourceMix: sourceMix.length > 0 ? sourceMix : undefined,
        qualityScore,
        qualityBand: buildQualityBand(qualityScore),
      },
    };
  });
}

