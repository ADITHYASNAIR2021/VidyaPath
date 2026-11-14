import 'server-only';

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { ALL_CHAPTERS, getChapterById } from '@/lib/data';
import { getPYQData, type PYQEntry } from '@/lib/pyq';

interface ContextChunkLike {
  id?: string;
  text?: string;
  sourceType?: 'paper' | 'textbook' | string;
  sourcePath?: string;
  chapterId?: string | null;
  classLevel?: number;
  subject?: string;
  year?: number;
}

interface GroundedPYQMeta {
  source: 'grounded' | 'fallback';
  paperEvidenceCount: number;
  textbookEvidenceCount: number;
  confidence: number;
}

export interface GroundedPYQEntry extends PYQEntry {
  meta: GroundedPYQMeta;
}

const CONTEXT_DIR = path.join(process.cwd(), 'lib', 'context');
const CONTEXT_FILES = ['chunks.jsonl.gz', 'textbook_chunks.jsonl.gz'];
const CACHE_TTL_MS = 5 * 60 * 1000;
const VECTOR_DIM = 192;

let cachedAt = 0;
let cacheByChapter = new Map<string, GroundedPYQEntry>();
let cachedPaperYearsByChapter = new Map<string, number[]>();
let cachedGlobalPaperYears: number[] = [];
let cacheBuild: Promise<void> | null = null;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'which', 'what',
  'following', 'correct', 'statement', 'about', 'into', 'than', 'when',
  'where', 'while', 'have', 'has', 'had', 'then', 'there', 'their', 'your',
  'will', 'would', 'could', 'should', 'been', 'being', 'also', 'only',
  'each', 'most', 'more', 'less', 'very', 'much', 'many', 'such', 'these',
  'those', 'during', 'board', 'exam', 'chapter', 'class', 'question',
  'paper', 'marks', 'answer', 'section',
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((token) => !STOP_WORDS.has(token));
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let idx = 0; idx < token.length; idx++) {
    hash ^= token.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildVector(text: string): Float32Array {
  const vec = new Float32Array(VECTOR_DIM);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;
  for (const token of tokens) {
    const index = hashToken(token) % VECTOR_DIM;
    vec[index] += 1;
  }
  let norm = 0;
  for (let idx = 0; idx < vec.length; idx++) norm += vec[idx] * vec[idx];
  if (norm <= 0) return vec;
  const inv = 1 / Math.sqrt(norm);
  for (let idx = 0; idx < vec.length; idx++) vec[idx] *= inv;
  return vec;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let idx = 0; idx < length; idx++) dot += a[idx] * b[idx];
  return dot;
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

function getChunkYear(chunk: ContextChunkLike): number | undefined {
  const direct = Number(chunk.year);
  if (Number.isInteger(direct) && direct >= 1980 && direct <= 2100) return direct;
  if (!chunk.sourcePath) return undefined;
  return inferYearFromSourcePath(chunk.sourcePath);
}

function parseChunkLine(line: string): ContextChunkLike | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line) as ContextChunkLike;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.text !== 'string' || typeof parsed.sourcePath !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeYears(years: number[]): number[] {
  return unique(
    years
      .filter((year) => Number.isInteger(year) && year >= 1980 && year <= 2100)
      .sort((a, b) => b - a)
  );
}

function buildFrequencyLabelFromCount(count: number): { label: string; color: string } {
  if (count >= 9) return { label: 'Very High Frequency', color: 'text-red-600 bg-red-50 border-red-200' };
  if (count >= 7) return { label: 'High Frequency', color: 'text-orange-600 bg-orange-50 border-orange-200' };
  if (count >= 4) return { label: 'Regular', color: 'text-amber-600 bg-amber-50 border-amber-200' };
  return { label: 'Occasional', color: 'text-blue-600 bg-blue-50 border-blue-200' };
}

function estimateAvgMarks(paperEvidenceCount: number, yearsCount: number, fallbackAvg: number): number {
  if (paperEvidenceCount <= 0 || yearsCount <= 0) return fallbackAvg;
  const evidenceDensity = paperEvidenceCount / Math.max(1, yearsCount);
  const estimate = 2 + Math.log2(1 + evidenceDensity * 2) + yearsCount * 0.35;
  return clamp(Math.round(estimate), 3, 15);
}

type TopicEvidence = { weight: number; vector: Float32Array; tokens: Set<string> };

function scoreTopicAgainstChunks(topic: string, chunkTexts: TopicEvidence[]): number {
  if (!topic.trim() || chunkTexts.length === 0) return 0;
  const topicVector = buildVector(topic);
  const topicTokens = new Set(tokenize(topic));
  if (topicTokens.size === 0) return 0;

  let score = 0;
  for (const chunk of chunkTexts) {
    const sim = cosineSimilarity(topicVector, chunk.vector);
    if (sim < 0.12) continue;
    let overlap = 0;
    for (const token of topicTokens) {
      if (chunk.tokens.has(token)) overlap += 1;
    }
    if (overlap === 0) continue;
    score += (sim * 100) * (1 + overlap * 0.35) * chunk.weight;
  }
  return score;
}

function deriveGroundedEntryForChapter(chapterId: string, chunks: ContextChunkLike[]): GroundedPYQEntry | null {
  const chapter = getChapterById(chapterId);
  if (!chapter) return null;

  const chapterChunks = chunks;
  const paperChunks = chapterChunks.filter((chunk) => (chunk.sourceType === 'paper'));
  const textbookChunks = chapterChunks.filter((chunk) => (chunk.sourceType === 'textbook'));
  const yearsAsked = normalizeYears(
    paperChunks
      .map((chunk) => getChunkYear(chunk))
      .filter((year): year is number => Number.isInteger(year))
  );

  const fallback = getPYQData(chapterId);
  const candidateTopics = unique([
    ...chapter.topics,
    ...(fallback?.importantTopics ?? []),
  ]).slice(0, 22);

  const weightedChunks: TopicEvidence[] = [
    ...paperChunks
      .map((chunk) => String(chunk.text || '').trim())
      .filter((text) => text.length > 50)
      .map((text) => ({ text, weight: 1.35 })),
    ...textbookChunks
      .map((chunk) => String(chunk.text || '').trim())
      .filter((text) => text.length > 50)
      .map((text) => ({ text, weight: 1 })),
  ].map(({ text, weight }) => ({ weight, vector: buildVector(text), tokens: new Set(tokenize(text)) }));

  const topicScores = candidateTopics
    .map((topic) => ({ topic, score: scoreTopicAgainstChunks(topic, weightedChunks) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const importantTopics = topicScores.length > 0
    ? topicScores.slice(0, 8).map((entry) => entry.topic)
    : (fallback?.importantTopics ?? chapter.topics.slice(0, 8));

  const avgMarks = estimateAvgMarks(paperChunks.length, yearsAsked.length, fallback?.avgMarks ?? 5);

  if (yearsAsked.length === 0) {
    return {
      chapterId,
      yearsAsked: [],
      importantTopics,
      avgMarks,
      meta: {
        source: 'grounded',
        paperEvidenceCount: paperChunks.length,
        textbookEvidenceCount: textbookChunks.length,
        confidence: 0.35,
      },
    };
  }

  return {
    chapterId,
    yearsAsked,
    importantTopics,
    avgMarks,
    meta: {
      source: 'grounded',
      paperEvidenceCount: paperChunks.length,
      textbookEvidenceCount: textbookChunks.length,
      confidence: clamp(0.45 + Math.min(0.5, paperChunks.length / 45), 0, 0.95),
    },
  };
}

async function loadContextChunks(): Promise<ContextChunkLike[]> {
  const manifest = JSON.parse(await fs.readFile(path.join(CONTEXT_DIR, 'retrieval_manifest.json'), 'utf8')) as { artifacts: Array<{ file: string; sha256: string }> };
  const payloads = await Promise.all(
    CONTEXT_FILES.map(async (file) => {
      const bytes = await fs.readFile(path.join(CONTEXT_DIR, file));
      if (createHash('sha256').update(bytes).digest('hex') !== manifest.artifacts.find((row) => row.file === file)?.sha256) throw new Error('PYQ corpus integrity mismatch');
      return gunzipSync(bytes, { maxOutputLength: 256 * 1024 * 1024 }).toString('utf8');
    })
  );
  const chunks: ContextChunkLike[] = [];
  const seen = new Set<string>();
  for (const payload of payloads) {
    for (const line of payload.split('\n')) {
      const parsed = parseChunkLine(line);
      if (!parsed?.id || seen.has(parsed.id)) continue;
      seen.add(parsed.id);
      chunks.push({ ...parsed, sourceType: parsed.sourceType || 'paper' });
    }
  }
  return chunks;
}

async function ensureGroundedCache(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - cachedAt < CACHE_TTL_MS && cacheByChapter.size > 0) return;
  if (!cacheBuild) cacheBuild = rebuildGroundedCache().finally(() => { cacheBuild = null; });
  await cacheBuild;
}

async function rebuildGroundedCache(): Promise<void> {
  const chunks = await loadContextChunks();
  const chunksByChapter = new Map<string, ContextChunkLike[]>();
  for (const chunk of chunks) {
    if (!chunk.chapterId) continue;
    const group = chunksByChapter.get(chunk.chapterId) ?? [];
    group.push(chunk);
    chunksByChapter.set(chunk.chapterId, group);
  }
  const next = new Map<string, GroundedPYQEntry>();
  const nextPaperYearsByChapter = new Map<string, number[]>();
  const globalYearSet = new Set<number>();
  for (const chunk of chunks) {
    if (chunk.sourceType !== 'paper') continue;
    const year = getChunkYear(chunk);
    if (Number.isInteger(year)) {
      globalYearSet.add(year as number);
    }
  }
  for (const chapter of ALL_CHAPTERS) {
    const entry = deriveGroundedEntryForChapter(chapter.id, chunksByChapter.get(chapter.id) ?? []);
    if (!entry) continue;
    next.set(chapter.id, entry);
    nextPaperYearsByChapter.set(chapter.id, entry.yearsAsked);
    for (const year of entry.yearsAsked) {
      globalYearSet.add(year);
    }
  }

  cacheByChapter = next;
  cachedPaperYearsByChapter = nextPaperYearsByChapter;
  cachedGlobalPaperYears = normalizeYears(Array.from(globalYearSet));
  cachedAt = Date.now();
}

export async function getGroundedPYQData(chapterId: string): Promise<GroundedPYQEntry | null> {
  await ensureGroundedCache();
  return cacheByChapter.get(chapterId) ?? null;
}

export async function getGroundedFrequencyLabel(chapterId: string): Promise<{ label: string; color: string } | null> {
  const entry = await getGroundedPYQData(chapterId);
  if (!entry || entry.yearsAsked.length === 0) return null;
  return buildFrequencyLabelFromCount(entry.yearsAsked.length);
}

export async function getGroundedPaperYearUniverse(chapterId?: string): Promise<number[]> {
  await ensureGroundedCache();
  if (chapterId) return cachedPaperYearsByChapter.get(chapterId) ?? [];
  return cachedGlobalPaperYears;
}
