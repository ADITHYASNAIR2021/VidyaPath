import { getChapterById } from '@/lib/data';
import type { ContextPack, ContextSnippet } from '@/lib/ai/context-retriever';

function compactText(value: string, max = 260): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function toPercent(value: number | null | undefined): number | null {
  if (!Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(value) * 100)));
}

function buildLocatorHint(snippet: ContextSnippet): string | undefined {
  const parts: string[] = [];
  if (typeof snippet.page === 'number' && Number.isFinite(snippet.page)) {
    parts.push(`Page ${snippet.page}`);
  }
  if (typeof snippet.chunkIndex === 'number' && Number.isFinite(snippet.chunkIndex)) {
    parts.push(`Chunk ${snippet.chunkIndex + 1}`);
  }
  if (typeof snippet.year === 'number' && Number.isFinite(snippet.year)) {
    parts.push(String(snippet.year));
  }
  if (snippet.paperType) {
    parts.push(snippet.paperType);
  }
  return parts.length > 0 ? parts.join(' | ') : undefined;
}

function buildSourceLabel(snippet: ContextSnippet): string {
  const parts: string[] = [];
  if (snippet.sourceType === 'textbook') parts.push('Textbook');
  if (snippet.sourceType === 'paper') parts.push('PYQ');
  if (snippet.sourceType === 'image-ocr') parts.push('Diagram OCR');
  if (parts.length === 0) parts.push('Source');
  if (snippet.year) parts.push(String(snippet.year));
  if (snippet.paperType) parts.push(snippet.paperType);
  return parts.join(' ');
}

export interface AiEvidenceSource {
  sourceLabel: string;
  sourcePath: string;
  chapterId?: string;
  chapterTitle?: string;
  page?: number;
  locatorHint?: string;
  sourceType?: 'paper' | 'textbook' | 'image-ocr';
  relevanceScore?: number;
  snippet: string;
}

export interface AiEvidenceBundle {
  chapterUsed?: {
    id?: string;
    title: string;
    subject: string;
    classLevel: number;
  };
  textbookSnippets: AiEvidenceSource[];
  confidence: {
    score: number;
    level: 'low' | 'medium' | 'high';
    reasons: string[];
    correctiveActions: string[];
    averageRelevance: number;
    strategies: string[];
  };
}

export interface StudentPracticeSignal {
  attempted: number;
  accuracyPercent: number | null;
  weakQuestionCount: number;
  reviewUrgency: 'low' | 'medium' | 'high';
  performanceBand: 'foundation' | 'standard' | 'challenge';
  summary: string;
}

export function buildEvidenceBundle(input: {
  contextPack: ContextPack;
  chapterContext?: {
    chapterId?: string;
    title: string;
    subject: string;
    classLevel: number;
  };
}): AiEvidenceBundle {
  const chapterUsed = input.chapterContext
    ? {
        id: input.chapterContext.chapterId,
        title: input.chapterContext.title,
        subject: input.chapterContext.subject,
        classLevel: input.chapterContext.classLevel,
      }
    : undefined;

  const textbookSnippets = input.contextPack.snippets.slice(0, 3).map((snippet) => {
    const snippetChapter = snippet.chapterId ? getChapterById(snippet.chapterId) : null;
    return {
      sourceLabel: buildSourceLabel(snippet),
      sourcePath: snippet.sourcePath,
      chapterId: snippet.chapterId,
      chapterTitle: snippetChapter?.title,
      page: snippet.page,
      locatorHint: buildLocatorHint(snippet),
      sourceType: snippet.sourceType,
      relevanceScore: snippet.relevanceScore,
      snippet: compactText(snippet.text),
    } satisfies AiEvidenceSource;
  });

  const retrievalMeta = input.contextPack.retrievalMeta;
  return {
    chapterUsed,
    textbookSnippets,
    confidence: {
      score: retrievalMeta?.confidence ?? 0,
      level: retrievalMeta?.confidenceLevel ?? 'low',
      reasons: retrievalMeta?.confidenceReasons ?? [],
      correctiveActions: retrievalMeta?.correctiveActions ?? [],
      averageRelevance: retrievalMeta?.averageRelevance ?? 0,
      strategies: retrievalMeta?.strategies ?? [],
    },
  };
}

export function buildStudentPracticeSignal(input: {
  attempted: number;
  accuracyRate: number | null;
  weakQuestions: string[];
}): StudentPracticeSignal {
  const accuracyPercent = toPercent(input.accuracyRate);
  const weakQuestionCount = input.weakQuestions.length;
  const performanceBand =
    accuracyPercent === null ? 'standard' : accuracyPercent < 50 ? 'foundation' : accuracyPercent >= 78 ? 'challenge' : 'standard';
  const reviewUrgency =
    accuracyPercent !== null && accuracyPercent < 45
      ? 'high'
      : weakQuestionCount >= 3 || (accuracyPercent !== null && accuracyPercent < 65)
        ? 'medium'
        : 'low';

  let summary = 'No recent answer history for this chapter yet, so the tutor should keep the first follow-up diagnostic and lightweight.';
  if (accuracyPercent !== null) {
    summary = `Recent chapter accuracy is ${accuracyPercent}%. ${weakQuestionCount > 0 ? `There are ${weakQuestionCount} weak-question signals to revisit.` : 'There are no repeated weak-question signals yet.'}`;
  }

  return {
    attempted: input.attempted,
    accuracyPercent,
    weakQuestionCount,
    reviewUrgency,
    performanceBand,
    summary,
  };
}
