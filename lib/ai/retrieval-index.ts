import type { ContextTask } from '@/lib/ai/context-retriever';
import type { Chapter } from '@/lib/data';

export type RetrievalSourceType = 'paper' | 'textbook' | 'image-ocr';
export type RetrievalDocumentKind = 'chunk' | 'topic' | 'visual';
export type RetrievalSectionType = 'theory' | 'diagram' | 'equation' | 'table' | 'example' | 'process';

export interface RetrievalChunkInput {
  id: string;
  text: string;
  sourcePath: string;
  classLevel: number;
  subject: string;
  sourceType?: RetrievalSourceType;
  chapterId?: string | null;
  chapterTitle?: string;
  chapterNumber?: number;
  year?: number;
  page?: number;
  chunkIndex?: number;
  hasImages?: boolean;
  visualTags?: string[];
}

export interface RetrievalDocument {
  id: string;
  kind: RetrievalDocumentKind;
  chunkId: string | null;
  text: string;
  contextualText: string;
  sourcePath: string;
  classLevel: number;
  subject: string;
  sourceType: RetrievalSourceType;
  chapterId: string | null;
  chapterTitle?: string;
  page?: number;
  chunkIndex?: number;
  year?: number;
  modalityHints: string[];
  topicHints: string[];
  sectionType: RetrievalSectionType;
  hierarchyPath: string[];
  docLength: number;
  termFreq: Record<string, number>;
}

export interface RetrievalTopicNode {
  id: string;
  chapterId: string;
  classLevel: number;
  subject: string;
  topic: string;
  summaryText: string;
  chunkIds: string[];
  keywords: string[];
}

export interface RetrievalIndexChapter {
  chapterId: string;
  classLevel: number;
  subject: string;
  title: string;
  topics: string[];
  topicNodes: RetrievalTopicNode[];
}

export interface RetrievalIndex {
  version: string;
  generatedAt: string;
  averageDocLength: number;
  docs: RetrievalDocument[];
  idf: Record<string, number>;
  chapters: Record<string, RetrievalIndexChapter>;
}

export interface RankedRetrievalDocument {
  doc: RetrievalDocument;
  score: number;
}

export interface TopicFocusResult {
  topic: string;
  score: number;
  chunkIds: string[];
}

export interface RetrievalConfidenceInput {
  queryText: string;
  chapterId?: string;
  topicFocus?: string[];
  ranked: Array<{ relevanceScore: number; sourceType?: RetrievalSourceType; chapterId?: string }>;
}

export interface RetrievalConfidenceResult {
  confidence: number;
  level: 'low' | 'medium' | 'high';
  reasons: string[];
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'board',
  'class',
  'paper',
  'chapter',
  'marks',
  'question',
  'questions',
  'answer',
  'using',
  'used',
  'into',
  'their',
  'there',
  'which',
  'what',
  'when',
  'where',
  'your',
  'have',
  'will',
  'been',
  'than',
  'also',
]);

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeSubjectForRetrieval(classLevel: number, subject: string): string {
  const s = subject.trim().toLowerCase();
  if (classLevel === 10 && (s === 'physics' || s === 'chemistry' || s === 'biology')) return 'science';
  if (s.includes('account')) return 'accountancy';
  if (s.includes('business')) return 'business studies';
  if (s.includes('econom')) return 'economics';
  if (s.includes('english')) return 'english core';
  if (s.includes('phy')) return 'physics';
  if (s.includes('chem')) return 'chemistry';
  if (s.includes('bio')) return 'biology';
  if (s.includes('math')) return 'math';
  if (s.includes('science')) return 'science';
  return s;
}

export function tokenizeRetrievalText(text: string): string[] {
  return (String(text || '').toLowerCase().match(/[a-z]{2,}|[\u0900-\u097f]{2,}|[0-9]+(?:\.[0-9]+)?/g) ?? []).filter(
    (token) => !STOPWORDS.has(token)
  );
}

function buildTermFreq(tokens: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const token of tokens) {
    out[token] = (out[token] ?? 0) + 1;
  }
  return out;
}

function detectSectionType(text: string, modalityHints: string[]): RetrievalSectionType {
  const lower = text.toLowerCase();
  if (modalityHints.includes('diagram') || /figure|ray diagram|circuit|labelled|label the/i.test(lower)) return 'diagram';
  if (/table|tabulate|column|row/i.test(lower)) return 'table';
  if (/equation|formula|reaction|impedance|derivation|balanced/i.test(lower)) return 'equation';
  if (/example|solution|worked/i.test(lower)) return 'example';
  if (/steps|sequence|process|stage|cycle|mechanism/i.test(lower)) return 'process';
  return 'theory';
}

export function inferModalityHints(
  text: string,
  sourceType?: RetrievalSourceType,
  hasImages?: boolean,
  visualTags: string[] = []
): string[] {
  const lower = String(text || '').toLowerCase();
  const hints: string[] = [...visualTags];
  if (sourceType === 'image-ocr' || hasImages) hints.push('visual');
  if (/diagram|figure|labelled|label the|ray diagram|circuit|graph|flow chart|map/i.test(lower)) hints.push('diagram');
  if (/table|tabular|column|row/i.test(lower)) hints.push('table');
  if (/equation|formula|reaction|=|ohm|volt|ampere|mole|deriv/i.test(lower)) hints.push('equation');
  if (/example|worked|solution/i.test(lower)) hints.push('example');
  if (/steps|sequence|process|cycle|mechanism|anaphase|mitosis|meiosis/i.test(lower)) hints.push('process');
  return unique(hints);
}

function flattenMermaidLabels(mermaidDiagram: string): string[] {
  const labels: string[] = [];
  const pattern = /(?:\[[^\]]+\]|\([^)]+\)|\{[^}]+\})/g;
  const matches = mermaidDiagram.match(pattern) ?? [];
  for (const match of matches) {
    const cleaned = match.slice(1, -1).trim();
    if (cleaned) labels.push(cleaned.replace(/\s+/g, ' '));
  }
  return unique(labels);
}

export function inferTopicHints(text: string, chapter?: Chapter): string[] {
  if (!chapter?.topics?.length) return [];
  const textTokens = new Set(tokenizeRetrievalText(text));
  const hints = chapter.topics.filter((topic) => {
    const tokens = tokenizeRetrievalText(topic);
    const hits = tokens.filter((token) => textTokens.has(token)).length;
    return hits >= Math.max(1, Math.ceil(tokens.length / 3));
  });
  return unique(hints).slice(0, 6);
}

function buildContextualText(chunk: RetrievalChunkInput, chapter?: Chapter, topicHints?: string[], modalityHints?: string[]): string {
  const contextParts = [
    `Class ${chunk.classLevel} ${chunk.subject}`,
    chapter?.title ? `Chapter ${chapter.title}` : chunk.chapterTitle ? `Chapter ${chunk.chapterTitle}` : '',
    chapter?.topics?.length ? `Chapter topics: ${chapter.topics.slice(0, 8).join(', ')}` : '',
    topicHints?.length ? `Matched subtopics: ${topicHints.slice(0, 5).join(', ')}` : '',
    modalityHints?.length ? `Content type: ${modalityHints.join(', ')}` : '',
    chunk.visualTags?.length ? `Visual tags: ${chunk.visualTags.join(', ')}` : '',
    chunk.sourceType === 'textbook'
      ? 'NCERT textbook grounding'
      : chunk.sourceType === 'image-ocr'
        ? 'Diagram or OCR visual grounding'
        : 'Board paper or exam-style grounding',
    chunk.page ? `Page ${chunk.page}` : '',
    Number.isFinite(chunk.chunkIndex) ? `Chunk ${chunk.chunkIndex}` : '',
    chunk.text,
  ].filter(Boolean);
  return contextParts.join('. ').replace(/\s+/g, ' ').trim();
}

function buildTopicNodes(chapter: Chapter, chapterDocs: RetrievalDocument[]): RetrievalTopicNode[] {
  return chapter.topics.map((topic, topicIndex) => {
    const topicTokens = tokenizeRetrievalText(topic);
    const ranked = chapterDocs
      .map((doc) => {
        const tf = doc.termFreq;
        const overlap = topicTokens.reduce((sum, token) => sum + (tf[token] ?? 0), 0);
        return { doc, overlap };
      })
      .filter((entry) => entry.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 5);
    const summaryText = [
      `Class ${chapter.classLevel} ${chapter.subject} chapter ${chapter.title}.`,
      `Topic focus: ${topic}.`,
      ranked.length > 0
        ? `Key evidence: ${ranked.map((entry) => entry.doc.text.slice(0, 140)).join(' ')}`
        : `Key NCERT wording and board phrasing should mention ${topic}.`,
    ].join(' ');
    return {
      id: `${chapter.id}::topic::${topicIndex}`,
      chapterId: chapter.id,
      classLevel: chapter.classLevel,
      subject: chapter.subject,
      topic,
      summaryText,
      chunkIds: ranked.map((entry) => entry.doc.chunkId).filter((item): item is string => !!item),
      keywords: topicTokens,
    };
  });
}

export function buildRetrievalIndex(
  chunks: RetrievalChunkInput[],
  resolveChapter: (chapterId: string) => Chapter | undefined
): RetrievalIndex {
  const docFrequency = new Map<string, number>();
  const docs: RetrievalDocument[] = [];
  const chapters: Record<string, RetrievalIndexChapter> = {};

  for (const chunk of chunks) {
    const chapter = chunk.chapterId ? resolveChapter(chunk.chapterId) : undefined;
    const modalityHints = inferModalityHints(chunk.text, chunk.sourceType, chunk.hasImages, chunk.visualTags);
    const topicHints = inferTopicHints(chunk.text, chapter);
    const contextualText = buildContextualText(chunk, chapter, topicHints, modalityHints);
    const tokens = tokenizeRetrievalText(contextualText);
    const termFreq = buildTermFreq(tokens);
    const uniqueTerms = Object.keys(termFreq);
    for (const term of uniqueTerms) {
      docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
    }
    const sourceType = chunk.sourceType === 'textbook' ? 'textbook' : chunk.sourceType === 'image-ocr' ? 'image-ocr' : 'paper';
    docs.push({
      id: chunk.id,
      kind: 'chunk',
      chunkId: chunk.id,
      text: chunk.text,
      contextualText,
      sourcePath: chunk.sourcePath,
      classLevel: chunk.classLevel,
      subject: chunk.subject,
      sourceType,
      chapterId: chunk.chapterId ?? null,
      chapterTitle: chapter?.title ?? chunk.chapterTitle,
      page: chunk.page,
      chunkIndex: chunk.chunkIndex,
      year: chunk.year,
      modalityHints,
      topicHints,
      sectionType: detectSectionType(chunk.text, modalityHints),
      hierarchyPath: [String(chunk.classLevel), chunk.subject, chunk.chapterId ?? 'general'],
      docLength: tokens.length,
      termFreq,
    });

    if (chapter && !chapters[chapter.id]) {
      chapters[chapter.id] = {
        chapterId: chapter.id,
        classLevel: chapter.classLevel,
        subject: chapter.subject,
        title: chapter.title,
        topics: chapter.topics,
        topicNodes: [],
      };
    }
  }

  for (const chapterId of Object.keys(chapters)) {
    const chapter = resolveChapter(chapterId);
    if (!chapter) continue;
    const chapterDocs = docs.filter((doc) => doc.chapterId === chapterId);
    chapters[chapterId].topicNodes = buildTopicNodes(chapter, chapterDocs);
    for (const topicNode of chapters[chapterId].topicNodes) {
      const contextualText = topicNode.summaryText.replace(/\s+/g, ' ').trim();
      const termFreq = buildTermFreq(tokenizeRetrievalText(contextualText));
      for (const term of Object.keys(termFreq)) {
        docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
      }
      docs.push({
        id: topicNode.id,
        kind: 'topic',
        chunkId: null,
        text: topicNode.summaryText,
        contextualText,
        sourcePath: `chapter:${chapterId}#topic`,
        classLevel: topicNode.classLevel,
        subject: topicNode.subject,
        sourceType: 'textbook',
        chapterId,
        chapterTitle: chapter.title,
        modalityHints: [],
        topicHints: [topicNode.topic],
        sectionType: 'process',
        hierarchyPath: [String(topicNode.classLevel), topicNode.subject, chapterId, topicNode.topic],
        docLength: tokenizeRetrievalText(contextualText).length,
        termFreq,
      });
    }

    const diagramLabels = chapter.mermaidDiagram ? flattenMermaidLabels(chapter.mermaidDiagram) : [];
    if (diagramLabels.length > 0) {
      const visualText = [
        `Class ${chapter.classLevel} ${chapter.subject} chapter ${chapter.title}.`,
        `Diagram labels and visual structure: ${diagramLabels.join(', ')}.`,
        `Relevant topics: ${chapter.topics.slice(0, 8).join(', ')}.`,
      ].join(' ');
      const termFreq = buildTermFreq(tokenizeRetrievalText(visualText));
      for (const term of Object.keys(termFreq)) {
        docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
      }
      docs.push({
        id: `${chapterId}::visual::mermaid`,
        kind: 'visual',
        chunkId: null,
        text: visualText,
        contextualText: visualText,
        sourcePath: `chapter:${chapterId}#diagram`,
        classLevel: chapter.classLevel,
        subject: chapter.subject,
        sourceType: 'image-ocr',
        chapterId,
        chapterTitle: chapter.title,
        modalityHints: ['visual', 'diagram'],
        topicHints: chapter.topics.slice(0, 6),
        sectionType: 'diagram',
        hierarchyPath: [String(chapter.classLevel), chapter.subject, chapterId, 'diagram'],
        docLength: tokenizeRetrievalText(visualText).length,
        termFreq,
      });
    }
  }

  const averageDocLength = docs.length > 0 ? docs.reduce((sum, doc) => sum + doc.docLength, 0) / docs.length : 0;
  const totalDocs = docs.length || 1;
  const idf: Record<string, number> = {};
  for (const [term, df] of docFrequency.entries()) {
    idf[term] = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
  }

  return {
    version: '2',
    generatedAt: new Date().toISOString(),
    averageDocLength: Number(averageDocLength.toFixed(2)),
    docs,
    idf,
    chapters,
  };
}

function scoreBm25ForDocument(doc: RetrievalDocument, queryTokens: string[], idf: Record<string, number>, avgDocLength: number): number {
  if (queryTokens.length === 0) return 0;
  const k1 = 1.5;
  const b = 0.75;
  let score = 0;
  for (const token of queryTokens) {
    const tf = doc.termFreq[token] ?? 0;
    if (tf <= 0) continue;
    const tokenIdf = idf[token] ?? 0;
    const denom = tf + k1 * (1 - b + b * (doc.docLength / Math.max(1, avgDocLength)));
    score += tokenIdf * ((tf * (k1 + 1)) / denom);
  }
  return score;
}

export function searchBm25Documents(
  index: RetrievalIndex,
  queryText: string,
  options: {
    classLevel?: number;
    subject?: string;
    chapterId?: string;
    includeKinds?: RetrievalDocumentKind[];
    maxResults?: number;
  } = {}
): RankedRetrievalDocument[] {
  const queryTokens = unique(tokenizeRetrievalText(queryText));
  const allowedKinds = new Set(options.includeKinds ?? ['chunk', 'topic', 'visual']);
  const filtered = index.docs.filter((doc) => {
    if (!allowedKinds.has(doc.kind)) return false;
    if (typeof options.classLevel === 'number' && doc.classLevel !== options.classLevel) return false;
    if (
      options.subject &&
      normalizeSubjectForRetrieval(doc.classLevel, doc.subject) !== normalizeSubjectForRetrieval(doc.classLevel, options.subject)
    ) return false;
    if (options.chapterId && doc.chapterId && doc.chapterId !== options.chapterId) return false;
    return true;
  });
  const ranked = filtered
    .map((doc) => ({ doc, score: scoreBm25ForDocument(doc, queryTokens, index.idf, index.averageDocLength || 1) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, Math.max(1, options.maxResults ?? 20));
}

export function findTopicFocus(
  index: RetrievalIndex,
  options: {
    classLevel: number;
    subject: string;
    chapterId?: string;
    queryText: string;
    maxTopics?: number;
  }
): TopicFocusResult[] {
  const queryTokens = new Set(tokenizeRetrievalText(options.queryText));
  const topicNodes = Object.values(index.chapters)
    .filter(
      (chapter) =>
        chapter.classLevel === options.classLevel &&
        normalizeSubjectForRetrieval(chapter.classLevel, chapter.subject) ===
          normalizeSubjectForRetrieval(chapter.classLevel, options.subject)
    )
    .flatMap((chapter) =>
      chapter.topicNodes.filter((node) => !options.chapterId || node.chapterId === options.chapterId)
    );
  const ranked = topicNodes
    .map((node) => {
      const overlap = node.keywords.reduce((sum, token) => sum + (queryTokens.has(token) ? 1 : 0), 0);
      return {
        topic: node.topic,
        score: overlap / Math.max(1, node.keywords.length),
        chunkIds: node.chunkIds,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, Math.max(1, options.maxTopics ?? 4));
}

export function reciprocalRankFusion<T extends { id: string }>(
  rankedLists: Array<Array<{ item: T; score?: number }>>,
  k = 60
): Array<{ item: T; score: number }> {
  const scoreMap = new Map<string, { item: T; score: number }>();
  for (const ranked of rankedLists) {
    for (let index = 0; index < ranked.length; index++) {
      const entry = ranked[index];
      const current = scoreMap.get(entry.item.id) ?? { item: entry.item, score: 0 };
      current.score += 1 / (k + index + 1);
      if (typeof entry.score === 'number' && Number.isFinite(entry.score)) {
        current.score += Math.max(0, entry.score) / 1000;
      }
      scoreMap.set(entry.item.id, current);
    }
  }
  return Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);
}

export function needsVisualRetrieval(queryText: string, task: ContextTask, chapterTopics: string[] = []): boolean {
  const signalText = `${queryText} ${chapterTopics.join(' ')}`.toLowerCase();
  if (/(diagram|figure|label|circuit|graph|ray|optics|table|flow chart|map)/i.test(signalText)) return true;
  return ['chapter-drill', 'chapter-diagnose', 'chapter-remediate', 'mcq', 'adaptive-test'].includes(task);
}

export function evaluateRetrievalConfidence(input: RetrievalConfidenceInput): RetrievalConfidenceResult {
  const ranked = input.ranked.slice(0, 8);
  const reasons: string[] = [];
  if (ranked.length === 0) {
    return { confidence: 0, level: 'low', reasons: ['no snippets retrieved'] };
  }

  const averageRelevance = ranked.reduce((sum, item) => sum + item.relevanceScore, 0) / ranked.length;
  const chapterMatches = input.chapterId ? ranked.filter((item) => item.chapterId === input.chapterId).length : 0;
  const sourceMix = new Set(ranked.map((item) => item.sourceType ?? 'paper')).size;
  const topScore = ranked[0]?.relevanceScore ?? 0;
  const bottomScore = ranked[ranked.length - 1]?.relevanceScore ?? 0;
  const scoreSpread = Math.max(0, topScore - bottomScore);
  const topicCoverage = (input.topicFocus ?? []).length;

  let confidence = 0;
  confidence += Math.min(45, averageRelevance * 0.7);
  confidence += Math.min(18, chapterMatches * 4);
  confidence += Math.min(12, sourceMix * 4);
  confidence += Math.min(12, scoreSpread * 0.4);
  confidence += Math.min(13, topicCoverage * 4);

  if (averageRelevance < 16) reasons.push('low average relevance');
  if (input.chapterId && chapterMatches === 0) reasons.push('no direct chapter matches');
  if (sourceMix <= 1) reasons.push('limited source diversity');
  if (scoreSpread < 6) reasons.push('weak score separation');
  if (topicCoverage === 0 && input.queryText.trim().length > 0) reasons.push('topic hierarchy did not engage');

  const bounded = Math.max(0, Math.min(100, Number(confidence.toFixed(1))));
  return {
    confidence: bounded,
    level: bounded >= 72 ? 'high' : bounded >= 45 ? 'medium' : 'low',
    reasons: reasons.slice(0, 4),
  };
}
