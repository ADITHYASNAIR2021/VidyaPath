import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getPYQData } from '@/lib/pyq';
import { getChapterById } from '@/lib/data';
import { isUsableNvidiaApiKey, rerankWithNvidia } from '@/lib/ai/nvidia-client';
import { compressSnippetText, expandRetrievalQuery } from '@/lib/ai/retrieval-enhancements';
import { buildHyDEPassage, compressRetrievedSnippet } from '@/lib/ai/retrieval-llm';
import {
  buildRetrievalIndex,
  evaluateRetrievalConfidence,
  findTopicFocus,
  inferModalityHints,
  inferTopicHints,
  needsVisualRetrieval,
  reciprocalRankFusion,
  searchBm25Documents,
  tokenizeRetrievalText,
  type RetrievalDocument,
  type RetrievalIndex,
  type RetrievalSourceType,
} from '@/lib/ai/retrieval-index';
import { logger } from '@/lib/logger';

export type ContextTask =
  | 'chat'
  | 'flashcards'
  | 'mcq'
  | 'adaptive-test'
  | 'revision-plan'
  | 'paper-evaluate'
  | 'chapter-pack'
  | 'chapter-drill'
  | 'chapter-diagnose'
  | 'chapter-remediate';

type PaperType = 'board' | 'sample' | 'compartment';

interface ContextChunk {
  id: string;
  text: string;
  sourcePath: string;
  classLevel: number;
  subject: string;
  sourceType?: 'paper' | 'textbook' | 'image-ocr';
  hasImages?: boolean;
  medium?: string;
  language?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  chapterId?: string | null;
  year?: number;
  paperType?: PaperType;
  page?: number;
  chunkIndex?: number;
  totalChunks?: number;
}

interface RerankIndexCandidate {
  index: number;
  score?: number;
}

interface ChapterIndexPayload {
  version?: string;
  generatedAt?: string | null;
  datasetRoot?: string;
  chapters?: Record<string, string[]>;
  sourcesBySubjectClass?: Record<string, string[]>;
}

export interface ContextSnippet {
  id: string;
  text: string;
  sourcePath: string;
  classLevel: number;
  subject: string;
  sourceType?: 'paper' | 'textbook' | 'image-ocr';
  hasImages?: boolean;
  medium?: string;
  language?: string;
  chapterId?: string;
  year?: number;
  paperType?: PaperType;
  page?: number;
  chunkIndex?: number;
  modalityHints?: string[];
  topicHints?: string[];
  relevanceScore: number;
}

export interface ContextQuery {
  task: ContextTask;
  classLevel: number;
  subject: string;
  chapterId?: string;
  chapterTopics?: string[];
  query?: string;
  topK?: number;
}

export interface ContextPack {
  snippets: ContextSnippet[];
  contextHash: string;
  usedOnDemandFallback: boolean;
  usedPgvector: boolean;
  retrievalMeta?: {
    snippetCount: number;
    averageRelevance: number;
    sourceMix: Array<'paper' | 'textbook' | 'image-ocr'>;
    chapterMatchCount: number;
    confidence: number;
    confidenceLevel: 'low' | 'medium' | 'high';
    confidenceReasons: string[];
    correctiveActions: string[];
    topicFocus: string[];
    visualSnippetCount: number;
    strategies: string[];
  };
}

const CONTEXT_DIR = path.join(process.cwd(), 'lib', 'context');
const CHUNK_PATHS = [
  path.join(CONTEXT_DIR, 'chunks.jsonl'),
  path.join(CONTEXT_DIR, 'textbook_chunks.jsonl'),
];
const INDEX_PATHS = [
  path.join(CONTEXT_DIR, 'chapter_index.json'),
  path.join(CONTEXT_DIR, 'textbook_chapter_index.json'),
];
const DATASET_ROOT = path.join(process.cwd(), 'dataset', 'cbse_papers');
const INDEX_SCRIPT = path.join(process.cwd(), 'scripts', 'build_context_index.py');
const CACHE_TTL_MS = 10 * 60 * 1000;
const EMBEDDING_DIM = 192;
const DEFAULT_NVIDIA_EMBED_MODEL = 'nvidia/nemotron-3-embed-1b';
const DEFAULT_NVIDIA_RERANK_MODEL = 'nvidia/llama-nemotron-rerank-1b-v2';
const VECTOR_INDEX_PATH = path.join(CONTEXT_DIR, 'chunk_vectors.jsonl');
const RETRIEVAL_INDEX_PATH = path.join(CONTEXT_DIR, 'retrieval_index.json');
const PGVECTOR_UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_LOCAL_CANDIDATE_POOL = 48;
const DEFAULT_PGVECTOR_CANDIDATE_POOL = 36;

let cacheLoadedAt = 0;
let cachedChunks: ContextChunk[] = [];
let cachedIndex: ChapterIndexPayload = {};
let cachedRetrievalIndex: RetrievalIndex | null = null;
const chunkEmbeddingCache = new Map<string, Float32Array>();
const persistedEmbeddingCache = new Map<string, Float32Array>();
let persistedEmbeddingDim = EMBEDDING_DIM;
let persistedEmbeddingKind: 'hashed-bow' | 'nvidia-e5' | 'onnx-minilm' = 'hashed-bow';
let persistedEmbeddingModel = 'local-hashed-bow';
let pgvectorUnavailableUntilMs = 0;
let pgvectorMissingHintLogged = false;

function normalizeSubject(classLevel: number, subject: string): string {
  const s = subject.trim().toLowerCase();
  if (classLevel === 10 && (s === 'physics' || s === 'chemistry' || s === 'biology')) {
    return 'Science';
  }
  if (s.includes('account')) return 'Accountancy';
  if (s.includes('business')) return 'Business Studies';
  if (s.includes('econom')) return 'Economics';
  if (s.includes('english')) return 'English Core';
  if (s.includes('phy')) return 'Physics';
  if (s.includes('chem')) return 'Chemistry';
  if (s.includes('bio')) return 'Biology';
  if (s.includes('math')) return 'Math';
  if (s.includes('science') || s.includes('scince')) return 'Science';
  return subject;
}

function normalizeChemNotation(text: string): string {
  return text
    .replace(/[\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089]/g, (ch) => String('\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089'.indexOf(ch)))
    .replace(/[\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079\u207a\u207b]/g, (ch) => {
      const idx = '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079\u207a\u207b'.indexOf(ch);
      return idx >= 0 ? (idx < 10 ? String(idx) : idx === 10 ? '+' : '-') : ch;
    })
    .replace(/\u00b2/g, '2').replace(/\u00b3/g, '3');
}

function tokenize(text: string): string[] {
  const normalized = normalizeChemNotation(text);
  return (normalized.toLowerCase().match(/[a-z0-9]{2,}|[\u0900-\u097f]{2,}/g) ?? []).filter((token) => {
    if (/^[a-z]{3,}$/.test(token)) {
      return !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'board', 'class', 'paper'].includes(token);
    }
    return true;
  });
}

function buildHeuristicHyDEQuery(
  query: string,
  subject: string,
  classLevel: number,
  chapterTopics: string[],
  pyqTopics: string[]
): string {
  const allTopics = [...new Set([...pyqTopics.slice(0, 5), ...chapterTopics.slice(0, 5)])].filter(Boolean);
  if (allTopics.length === 0) return query;
  const topicStr = allTopics.slice(0, 6).join(', ');
  const hypothetical =
    `NCERT Class ${classLevel} ${subject} textbook explains ${topicStr}. ` +
    `Key concepts: definitions laws formulae reactions processes applications of ${topicStr}. ` +
    `Board exam questions on ${allTopics.slice(0, 3).join(' ')} test conceptual understanding numerical application.`;
  return `${query} ${hypothetical}`.trim();
}

async function buildHyDEQuery(
  query: string,
  subject: string,
  classLevel: number,
  chapterTopics: string[],
  pyqTopics: string[],
  chapterTitle?: string
): Promise<string> {
  const heuristic = buildHeuristicHyDEQuery(query, subject, classLevel, chapterTopics, pyqTopics);
  const generated = await buildHyDEPassage({
    query,
    subject,
    classLevel,
    chapterTitle,
    chapterTopics,
    pyqTopics,
  }).catch(() => null);
  return generated ? `${query} ${generated}`.trim() : heuristic;
}

async function compressContextSnippets(
  snippets: ContextSnippet[],
  focusText: string,
  query: ContextQuery
): Promise<ContextSnippet[]> {
  return Promise.all(
    snippets.map(async (snippet, index) => {
      const compressed =
        index < 4
          ? await compressRetrievedSnippet({
              query: focusText,
              subject: query.subject,
              classLevel: query.classLevel,
              chapterTitle: query.chapterId ? getChapterById(query.chapterId)?.title : undefined,
              snippetText: snippet.text,
            }).catch(() => compressSnippetText(snippet.text, focusText))
          : compressSnippetText(snippet.text, focusText);
      return {
        ...snippet,
        text: compressed,
      };
    })
  );
}

function canonicalizeSourcePath(sourcePath: string): string {
  return sourcePath
    .replace(/\\/g, '/')
    .replace(/\/[^/]+\.zip_extracted\//i, '/')
    .replace(/\/{2,}/g, '/')
    .trim();
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function paperTypeWeight(type?: PaperType): number {
  if (type === 'board') return 5;
  if (type === 'sample') return 3;
  if (type === 'compartment') return 1;
  return 0;
}

function yearWeight(year?: number): number {
  if (!year) return 0;
  const currentYear = new Date().getFullYear();
  return Math.max(0, 10 - Math.max(0, currentYear - year));
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let idx = 0; idx < token.length; idx++) {
    hash ^= token.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildLocalEmbedding(text: string): Float32Array {
  const vec = new Float32Array(EMBEDDING_DIM);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;

  for (const token of tokens) {
    const hash = hashToken(token);
    const index = hash % EMBEDDING_DIM;
    vec[index] += 1;
  }

  let norm = 0;
  for (let idx = 0; idx < vec.length; idx++) norm += vec[idx] * vec[idx];
  if (norm <= 0) return vec;
  const invNorm = 1 / Math.sqrt(norm);
  for (let idx = 0; idx < vec.length; idx++) vec[idx] *= invNorm;
  return vec;
}

function supportsRemoteSemanticEmbeddings(): boolean {
  return persistedEmbeddingKind === 'nvidia-e5' && persistedEmbeddingDim > 0;
}

async function buildQueryEmbedding(text: string): Promise<Float32Array | null> {
  if (supportsRemoteSemanticEmbeddings()) {
    const nvidiaKey = process.env.NVIDIA_API_KEY?.trim();
    if (isUsableNvidiaApiKey(nvidiaKey)) {
      try {
        const { createNvidiaEmbeddings } = await import('@/lib/ai/nvidia-client');
        const [embedding] = await createNvidiaEmbeddings({
          apiKey: nvidiaKey,
          model: persistedEmbeddingModel || DEFAULT_NVIDIA_EMBED_MODEL,
          input: [text],
          inputType: 'query',
        });
        if (Array.isArray(embedding) && embedding.length === persistedEmbeddingDim) {
          return Float32Array.from(embedding);
        }
        logger.warn('[context-retriever] NVIDIA embedding returned unexpected shape; falling back');
      } catch (error) {
        logger.warn(
          { err: error },
          '[context-retriever] NVIDIA embedding failed — degrading to lexical hashed-BoW (quality reduced)'
        );
      }
    }
  }
  if (persistedEmbeddingKind === 'onnx-minilm') {
    // ONNX model execution is intentionally build-time only. Shipping the
    // transformer runtime in every serverless route adds hundreds of MB and
    // exceeds Vercel's function limit. Production semantic retrieval uses
    // pgvector/remote embeddings; BM25 remains the deterministic local fallback.
    return null;
  }
  // Hashed BoW fallback — lexical similarity only, no semantic understanding
  return buildLocalEmbedding(text);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let idx = 0; idx < len; idx++) dot += a[idx] * b[idx];
  return dot;
}

function sanitizeChunkText(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/Use this for board-style question framing[^.]*\./gi, '')
    .replace(/Use this for[^.]*\./gi, '')
    // Cap removal at 300 chars to avoid eating legitimate question content
    .replace(/(?:general instructions|time allowed|max(?:imum)? marks|question paper code)[^.!?\n]{0,300}/gi, ' ')
    .replace(/section\s+[a-e]\s+questions?\s+no\.\s*\d+\s+to\s+\d+[^.!?\n]{0,120}/gi, ' ')
    .replace(/there is no overall choice[^.!?\n]{0,220}/gi, ' ')
    .replace(/use of calculators? is not allowed[^.!?\n]{0,80}/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getEnglishRatio(text: string): number {
  const englishTokens = text.match(/[a-zA-Z]{2,}/g) ?? [];
  const allTokens = text.match(/[a-zA-Z0-9\u0900-\u097F]+/g) ?? [];
  if (allTokens.length === 0) return 0;
  return englishTokens.length / allTokens.length;
}

function getDevanagariRatio(text: string): number {
  const devanagariTokens = text.match(/[\u0900-\u097F]{2,}/g) ?? [];
  const allTokens = text.match(/[a-zA-Z0-9\u0900-\u097F]+/g) ?? [];
  if (allTokens.length === 0) return 0;
  return devanagariTokens.length / allTokens.length;
}

function looksLikeInstructionChunk(text: string): boolean {
  const lower = text.toLowerCase();
  const markers = [
    'general instructions',
    'time allowed',
    'maximum marks',
    'section a',
    'section b',
    'section c',
    'section d',
    'section e',
    'use of calculator is not allowed',
    'this question paper contains',
    'questions no.',
  ];
  let hits = 0;
  for (const marker of markers) {
    if (lower.includes(marker)) hits++;
  }
  const questionSignal = (lower.match(/\b(find|calculate|evaluate|derive|prove|write|state|which)\b/g) ?? []).length;
  return hits >= 2 && questionSignal < 3;
}

function isHighQualityChunk(text: string): boolean {
  if (!text || text.length < 180) return false;
  const englishRatio = getEnglishRatio(text);
  const devanagariRatio = getDevanagariRatio(text);
  // Aligned with Python extractor (MIN_ENGLISH_RATIO=0.52).
  // Devanagari content (Hindi medium) accepted at ≥0.40 ratio.
  if (englishRatio < 0.50 && devanagariRatio < 0.40) return false;
  if (looksLikeInstructionChunk(text)) return false;
  if (isCorruptedFontText(text)) return false;
  return true;
}

// CBSE PDFs with custom font encoding produce garbled Unicode in the
// private-use area (U+E000–U+F8FF) and symbol blocks. Detect and drop.
const FONT_CORRUPTION_RE = /[\uE000-\uF8FF\u2190-\u21FF\u2200-\u22FF\u2300-\u23FF\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\uFE00-\uFE0F]/g;
const MIN_LEGIT_CHAR_RATIO = 0.72;

function isCorruptedFontText(text: string): boolean {
  const stripped = text.replace(/\s+/g, '');
  if (stripped.length < 40) return false;
  const corruptionHits = (stripped.match(FONT_CORRUPTION_RE) ?? []).length;
  const legitRatio = (stripped.length - corruptionHits) / stripped.length;
  return legitRatio < MIN_LEGIT_CHAR_RATIO;
}

function inferChapterIdFromSource(sourcePath: string): string | undefined {
  const normalized = canonicalizeSourcePath(sourcePath);
  const chapters = cachedIndex.chapters ?? {};
  for (const [chapterId, sources] of Object.entries(chapters)) {
    if (sources.map((item) => canonicalizeSourcePath(item)).includes(normalized)) return chapterId;
  }
  return undefined;
}

function normalizeChapterSourceMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const out: Record<string, string[]> = {};

  for (const [chapterId, rawSources] of Object.entries(record)) {
    if (!chapterId) continue;
    if (Array.isArray(rawSources)) {
      out[chapterId] = rawSources
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => canonicalizeSourcePath(item));
      continue;
    }
    if (rawSources && typeof rawSources === 'object') {
      const payload = rawSources as Record<string, unknown>;
      const fromSources = Array.isArray(payload.sources)
        ? payload.sources
        : Array.isArray(payload.sourcePaths)
          ? payload.sourcePaths
          : [];
      out[chapterId] = fromSources
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => canonicalizeSourcePath(item));
    }
  }
  return out;
}

function normalizeSubjectSourceMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [key, rawSources] of Object.entries(record)) {
    if (!Array.isArray(rawSources)) continue;
    out[key] = rawSources
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => canonicalizeSourcePath(item));
  }
  return out;
}

function mergeIndexPayload(base: ChapterIndexPayload, incoming: ChapterIndexPayload): ChapterIndexPayload {
  const mergedChapters = normalizeChapterSourceMap(base.chapters);
  const incomingChapters = normalizeChapterSourceMap(incoming.chapters);
  for (const [chapterId, sources] of Object.entries(incomingChapters)) {
    const current = mergedChapters[chapterId] ?? [];
    const deduped = new Set(current);
    for (const source of sources) deduped.add(source);
    mergedChapters[chapterId] = Array.from(deduped);
  }

  const mergedSubjectSources = normalizeSubjectSourceMap(base.sourcesBySubjectClass);
  const incomingSubjectSources = normalizeSubjectSourceMap(incoming.sourcesBySubjectClass);
  for (const [key, sources] of Object.entries(incomingSubjectSources)) {
    const current = mergedSubjectSources[key] ?? [];
    const deduped = new Set(current);
    for (const source of sources) deduped.add(source);
    mergedSubjectSources[key] = Array.from(deduped);
  }

  return {
    ...base,
    ...incoming,
    chapters: mergedChapters,
    sourcesBySubjectClass: mergedSubjectSources,
  };
}

async function loadContextArtifacts(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - cacheLoadedAt < CACHE_TTL_MS) return;
  cacheLoadedAt = now;

  const cdnBaseUrl = (process.env.CONTEXT_CDN_URL || '').trim().replace(/\/+$/, '');

  try {
    // ── Fetch context files from local disk or CDN ──
    const fetchFile = async (localPath: string, fileName: string): Promise<string> => {
      // Try local disk first
      try {
        return await fs.readFile(localPath, 'utf-8');
      } catch {
        // CI and production commits keep large context artifacts compressed.
        // Load the adjacent .gz file before considering a remote CDN fallback.
        try {
          const [{ gunzipSync }, compressed] = await Promise.all([
            import('node:zlib'),
            fs.readFile(`${localPath}.gz`),
          ]);
          return gunzipSync(compressed).toString('utf-8');
        } catch {
          // Local compressed artifact is unavailable — try the configured CDN.
        }

        // Fallback: fetch from CDN if configured (prefer .gz for smaller transfer)
        if (cdnBaseUrl) {
          try {
            const gzRes = await fetch(`${cdnBaseUrl}/${fileName}.gz`);
            if (gzRes.ok) {
              const { gunzipSync } = await import('node:zlib');
              const compressed = Buffer.from(await gzRes.arrayBuffer());
              return gunzipSync(compressed).toString('utf-8');
            }
          } catch { /* .gz not available — try raw */ }
          try {
            const res = await fetch(`${cdnBaseUrl}/${fileName}`);
            if (res.ok) return await res.text();
          } catch { /* CDN fetch failed — return empty */ }
        }
        return '';
      }
    };

    const [chunkPayloads, indexPayloads, vectorPayload, retrievalIndexPayload] = await Promise.all([
      Promise.all(CHUNK_PATHS.map((p) => fetchFile(p, path.basename(p)))),
      Promise.all(INDEX_PATHS.map((p) => fetchFile(p, path.basename(p)))),
      fetchFile(VECTOR_INDEX_PATH, path.basename(VECTOR_INDEX_PATH)),
      fetchFile(RETRIEVAL_INDEX_PATH, path.basename(RETRIEVAL_INDEX_PATH)),
    ]);

    const seen = new Set<string>();
    cachedChunks = chunkPayloads
      .flatMap((payload) => payload.split('\n'))
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as ContextChunk;
        } catch {
          return null;
        }
      })
      .filter(
        (entry): entry is ContextChunk =>
          !!entry &&
          typeof entry.text === 'string' &&
          typeof entry.sourcePath === 'string' &&
          typeof entry.classLevel === 'number' &&
          typeof entry.subject === 'string'
      )
      .map<ContextChunk>((entry) => {
        const cleanedText = sanitizeChunkText(entry.text);
        const chapterId = typeof entry.chapterId === 'string' && entry.chapterId.trim().length > 0
          ? entry.chapterId.trim()
          : null;
        const sourceType: 'paper' | 'textbook' | 'image-ocr' =
          entry.sourceType === 'textbook' ? 'textbook' :
          entry.sourceType === 'image-ocr' ? 'image-ocr' : 'paper';
        return {
          ...entry,
          chapterId,
          sourceType,
          sourcePath: canonicalizeSourcePath(entry.sourcePath),
          text: cleanedText,
        };
      })
      .filter((entry) => isHighQualityChunk(entry.text))
      .filter((entry) => {
        const dedupeKey = `${entry.chapterId ?? 'none'}|${entry.sourcePath}|${entry.text.slice(0, 260).toLowerCase()}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      });
    chunkEmbeddingCache.clear();
    persistedEmbeddingCache.clear();
    persistedEmbeddingDim = EMBEDDING_DIM;
    persistedEmbeddingKind = 'hashed-bow';
    persistedEmbeddingModel = 'local-hashed-bow';
    if (vectorPayload.trim().length > 0) {
      for (const rawLine of vectorPayload.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as {
            id?: string;
            embedding?: number[];
            embeddingKind?: 'hashed-bow' | 'nvidia-e5' | 'onnx-minilm';
            embeddingModel?: string;
          };
          if (!parsed.id || !Array.isArray(parsed.embedding)) continue;
          if (parsed.embedding.length === 0) continue;
          const vec = new Float32Array(parsed.embedding);
          persistedEmbeddingCache.set(parsed.id, vec);
          if (persistedEmbeddingCache.size === 1) {
            persistedEmbeddingDim = vec.length;
            persistedEmbeddingKind = parsed.embeddingKind === 'nvidia-e5' ? 'nvidia-e5' : parsed.embeddingKind === 'onnx-minilm' ? 'onnx-minilm' : 'hashed-bow';
            persistedEmbeddingModel = parsed.embeddingModel?.trim() || (persistedEmbeddingKind === 'nvidia-e5' ? DEFAULT_NVIDIA_EMBED_MODEL : persistedEmbeddingKind === 'onnx-minilm' ? 'Xenova/all-MiniLM-L6-v2' : 'local-hashed-bow');
          }
        } catch {
          continue;
        }
      }
    }

    cachedIndex = indexPayloads.reduce<ChapterIndexPayload>((acc, raw) => {
      try {
        const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as ChapterIndexPayload;
        return mergeIndexPayload(acc, parsed);
      } catch {
        return acc;
      }
    }, {});

    cachedRetrievalIndex = null;
    if (retrievalIndexPayload.trim().length > 0) {
      try {
        const parsed = JSON.parse(retrievalIndexPayload.replace(/^\uFEFF/, '')) as RetrievalIndex;
        if (Array.isArray(parsed.docs) && parsed.docs.length > 0) {
          cachedRetrievalIndex = parsed;
        }
      } catch {
        cachedRetrievalIndex = null;
      }
    }
    if (!cachedRetrievalIndex) {
      cachedRetrievalIndex = buildRetrievalIndex(cachedChunks, (chapterId) => getChapterById(chapterId));
    }
  } catch (error) {
    logger.error({ err: error }, '[context-retriever] Failed to load context artifacts');
    cachedChunks = [];
    cachedIndex = {};
    cachedRetrievalIndex = null;
  }

  // ── Degraded-mode warning: if no chunks loaded, log it clearly ──
  if (cachedChunks.length === 0) {
    logger.warn(
      '[context-retriever] No context chunks loaded — RAG retrieval is degraded. ' +
      'Run `npm run build:rag` to rebuild context files. ' +
      `Checked: ${CHUNK_PATHS.join(', ')}`,
    );
  }
}

// ── Public API for checking retrieval readiness ──

export function getRetrievalStats() {
  return {
    chunkCount: cachedChunks.length,
    chapterCount: Object.keys(cachedIndex).length,
    hasVectors: persistedEmbeddingCache.size > 0,
    hasRetrievalIndex: !!cachedRetrievalIndex,
    embeddingKind: persistedEmbeddingKind,
    embeddingDim: persistedEmbeddingDim,
    embeddingModel: persistedEmbeddingModel,
    degraded: cachedChunks.length === 0,
    lastLoadedAt: cacheLoadedAt,
  };
}

function computeScore(chunk: ContextChunk, query: ContextQuery, queryEmbedding: Float32Array | null): number {
  let score = 0;
  const normalizedSubject = normalizeSubject(query.classLevel, query.subject);
  const chapter = query.chapterId ? getChapterById(query.chapterId) : undefined;
  const pyq = query.chapterId ? getPYQData(query.chapterId) : null;

  if (chunk.classLevel === query.classLevel) score += 8;
  if (normalizeSubject(chunk.classLevel, chunk.subject) === normalizedSubject) score += 8;
  if (query.chapterId && chunk.chapterId === query.chapterId) score += 40;
  if (query.chapterId && !chunk.chapterId) score -= 3;
  if (query.chapterId && chunk.chapterId && chunk.chapterId !== query.chapterId) score -= 12;

  const queryTokens = unique(
    tokenize(
      [query.query ?? '', ...(query.chapterTopics ?? []), ...(chapter?.topics ?? []), ...(pyq?.importantTopics ?? [])]
        .join(' ')
    )
  );
  const chunkTokens = new Set(tokenize(chunk.text));
  for (const token of queryTokens) {
    if (chunkTokens.has(token)) score += 2;
  }

  if (pyq && pyq.importantTopics.length > 0) {
    const pyqTokenHits = pyq.importantTopics
      .flatMap((topic) => tokenize(topic))
      .filter((token) => chunkTokens.has(token)).length;
    score += Math.min(12, pyqTokenHits);
  }

  if (queryEmbedding !== null) {
    let chunkEmbedding = chunkEmbeddingCache.get(chunk.id);
    if (!chunkEmbedding) {
      chunkEmbedding = persistedEmbeddingCache.get(chunk.id) ?? buildLocalEmbedding(chunk.text);
      chunkEmbeddingCache.set(chunk.id, chunkEmbedding);
    }
    if (chunkEmbedding.length !== queryEmbedding.length) {
      chunkEmbedding = buildLocalEmbedding(chunk.text);
      chunkEmbeddingCache.set(chunk.id, chunkEmbedding);
    }
    const semantic = cosineSimilarity(chunkEmbedding, queryEmbedding);
    const semanticWeight = persistedEmbeddingKind === 'nvidia-e5' ? 24 : persistedEmbeddingKind === 'onnx-minilm' ? 20 : 12;
    score += Math.max(0, semantic) * semanticWeight;
  }

  if (chunk.sourceType === 'textbook') {
    score += 2;
    if (query.chapterId && chunk.chapterId === query.chapterId) score += 6;
    if (['chapter-pack', 'chapter-drill', 'chapter-diagnose', 'chapter-remediate', 'chat'].includes(query.task)) {
      score += 2;
    }
  }
  if (chunk.sourceType === 'image-ocr') {
    // OCR'd image content: valuable for diagram/equation-heavy questions
    score += 3;
    if (query.chapterId && chunk.chapterId === query.chapterId) score += 5;
  }

  score += paperTypeWeight(chunk.paperType);
  score += yearWeight(chunk.year);
  return score;
}

function applyMMR(
  scored: Array<{ chunk: ContextChunk; score: number }>,
  topK: number,
  lambda = 0.6
): Array<{ chunk: ContextChunk; score: number }> {
  if (scored.length <= topK) return scored;
  const maxScore = scored[0]?.score ?? 1;
  const minScore = scored[scored.length - 1]?.score ?? 0;
  const scoreRange = Math.max(1, maxScore - minScore);
  const selected: typeof scored = [];
  const remaining = [...scored];
  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0;
    let bestMMR = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const normScore = (remaining[i].score - minScore) / scoreRange;
      let maxSim = 0;
      if (selected.length > 0) {
        let candEmb = chunkEmbeddingCache.get(remaining[i].chunk.id) ?? persistedEmbeddingCache.get(remaining[i].chunk.id);
        if (!candEmb) {
          candEmb = buildLocalEmbedding(remaining[i].chunk.text);
          chunkEmbeddingCache.set(remaining[i].chunk.id, candEmb);
        }
        for (const sel of selected) {
          let selEmb = chunkEmbeddingCache.get(sel.chunk.id) ?? persistedEmbeddingCache.get(sel.chunk.id) ?? buildLocalEmbedding(sel.chunk.text);
          if (candEmb.length !== selEmb.length) {
            candEmb = buildLocalEmbedding(remaining[i].chunk.text);
            selEmb = buildLocalEmbedding(sel.chunk.text);
            chunkEmbeddingCache.set(remaining[i].chunk.id, candEmb);
            chunkEmbeddingCache.set(sel.chunk.id, selEmb);
          }
          const sim = cosineSimilarity(candEmb, selEmb);
          if (sim > maxSim) maxSim = sim;
        }
      }
      const mmr = lambda * normScore - (1 - lambda) * maxSim;
      if (mmr > bestMMR) { bestMMR = mmr; bestIdx = i; }
    }
    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }
  return selected;
}

function shouldUseNvidiaRerank(query: ContextQuery): boolean {
  if (process.env.AI_ENABLE_NVIDIA_RERANK === '0') return false;
  if (!query.query || !query.query.trim()) return false;
  return isUsableNvidiaApiKey(process.env.NVIDIA_API_KEY);
}

function isPgvectorEnabled(): boolean {
  return process.env.AI_ENABLE_PGVECTOR_RAG === '1'
    && process.env.AI_PGVECTOR_RUNTIME_READY !== '0';
}

function isPgvectorMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /match_document_embeddings|document_embeddings|42P01|does not exist|PGRST|HTTP 404/i.test(message);
}

function markPgvectorTemporarilyUnavailable(reason: string): void {
  pgvectorUnavailableUntilMs = Date.now() + PGVECTOR_UNAVAILABLE_COOLDOWN_MS;
  if (pgvectorMissingHintLogged) return;
  pgvectorMissingHintLogged = true;
  logger.warn(
    { reason, retryAfterMinutes: Math.round(PGVECTOR_UNAVAILABLE_COOLDOWN_MS / 60000) },
    '[context-retriever] pgvector unavailable',
  );
}

function coerceRerankCandidates(value: unknown): RerankIndexCandidate[] {
  if (!Array.isArray(value)) return [];
  const out: RerankIndexCandidate[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const indexCandidates = [record.index, record.passage_index, record.passage_idx, record.idx];
    let idx = Number.NaN;
    for (const candidate of indexCandidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        idx = parsed;
        break;
      }
    }
    if (!Number.isFinite(idx)) continue;
    const score = Number(record.score ?? record.relevance_score ?? record.relevanceScore);
    out.push({
      index: Math.max(0, Math.floor(idx)),
      score: Number.isFinite(score) ? score : undefined,
    });
  }
  return out;
}

function extractRerankOrder(payload: unknown, passageCount: number): number[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const candidates = [
    coerceRerankCandidates(record.rankings),
    coerceRerankCandidates(record.results),
    coerceRerankCandidates(record.data),
  ].find((items) => items.length > 0) ?? [];
  const seen = new Set<number>();
  const order: number[] = [];
  for (const item of candidates) {
    if (item.index < 0 || item.index >= passageCount) continue;
    if (seen.has(item.index)) continue;
    seen.add(item.index);
    order.push(item.index);
  }
  return order;
}

async function rerankContextSnippets(query: ContextQuery, snippets: ContextSnippet[]): Promise<ContextSnippet[]> {
  const apiKey = process.env.NVIDIA_API_KEY;
  const queryText = query.query?.trim() || '';
  if (!queryText || snippets.length < 2) return snippets;

  if (isUsableNvidiaApiKey(apiKey)) {
    const model = (process.env.AI_RERANK_MODEL || DEFAULT_NVIDIA_RERANK_MODEL).trim() || DEFAULT_NVIDIA_RERANK_MODEL;
    try {
      const payload = await rerankWithNvidia({
        apiKey,
        model,
        query: queryText,
        passages: snippets.map((snippet) => snippet.text),
      });
      const order = extractRerankOrder(payload, snippets.length);
      if (order.length > 0) {
        return applyRerankOrder(snippets, order);
      }
    } catch (error) {
      logger.warn({ err: error }, '[context-retriever] NVIDIA reranker failed, falling back to keyword-overlap ordering');
    }
  }

  // Fallback: lightweight keyword-overlap reranker — sorts snippets by shared
  // token count with the query so the best lexical match appears first.
  const queryTokens = new Set(tokenizeRetrievalText(queryText));
  return [...snippets].sort((a, b) => {
    const aTokens = new Set(tokenizeRetrievalText(a.text));
    const bTokens = new Set(tokenizeRetrievalText(b.text));
    let aOverlap = 0, bOverlap = 0;
    for (const t of queryTokens) {
      if (aTokens.has(t)) aOverlap++;
      if (bTokens.has(t)) bOverlap++;
    }
    return bOverlap - aOverlap;
  });
}

function applyRerankOrder(snippets: ContextSnippet[], order: number[]): ContextSnippet[] {
  const used = new Set<number>();
  const reranked: ContextSnippet[] = [];
  for (const idx of order) {
    if (idx < 0 || idx >= snippets.length) continue;
    used.add(idx);
    reranked.push(snippets[idx]);
  }
  for (let idx = 0; idx < snippets.length; idx++) {
    if (used.has(idx)) continue;
    reranked.push(snippets[idx]);
  }
  return reranked;
}

function buildContextHash(snippets: ContextSnippet[]): string {
  const digest = createHash('sha1');
  for (const snippet of snippets) {
    digest.update(snippet.sourceType ?? 'paper');
    digest.update('|');
    digest.update(snippet.sourcePath);
    digest.update('|');
    digest.update(snippet.text.slice(0, 120));
    digest.update('|');
    digest.update(String(snippet.year ?? 0));
    digest.update('|');
  }
  return digest.digest('hex');
}

function normalizeSnippetSourceType(sourceType?: RetrievalSourceType): 'paper' | 'textbook' | 'image-ocr' {
  if (sourceType === 'textbook') return 'textbook';
  if (sourceType === 'image-ocr') return 'image-ocr';
  return 'paper';
}

function getRetrievalIndex(): RetrievalIndex {
  if (cachedRetrievalIndex) return cachedRetrievalIndex;
  cachedRetrievalIndex = buildRetrievalIndex(cachedChunks, (chapterId) => getChapterById(chapterId));
  return cachedRetrievalIndex;
}

function resolveCandidatePoolSize(topK: number, ceiling = 72): number {
  return Math.max(topK * 4, Math.min(ceiling, Math.max(DEFAULT_LOCAL_CANDIDATE_POOL, topK * 6)));
}

function normalizeSnippetFingerprintText(text: string): string {
  return (text.toLowerCase().match(/[a-z0-9\u0900-\u097f]{2,}/g) ?? []).join(' ');
}

function buildSnippetDedupeKey(snippet: ContextSnippet): string {
  const normalized = normalizeSnippetFingerprintText(snippet.text);
  const digest = createHash('sha1').update(normalized).digest('hex').slice(0, 16);
  return `${canonicalizeSourcePath(snippet.sourcePath)}|${digest}`;
}

function getChunkById(chunkId: string): ContextChunk | undefined {
  return cachedChunks.find((chunk) => chunk.id === chunkId);
}

function retrievalDocumentToSnippet(doc: RetrievalDocument): ContextSnippet {
  const sourceType = normalizeSnippetSourceType(doc.sourceType);
  if (doc.chunkId) {
    const chunk = getChunkById(doc.chunkId);
    if (chunk) {
      return {
        ...chunk,
        sourcePath: canonicalizeSourcePath(chunk.sourcePath),
        text: sanitizeChunkText(chunk.text).slice(0, 1600),
        sourceType,
        chapterId: chunk.chapterId ?? undefined,
        page: chunk.page,
        chunkIndex: chunk.chunkIndex,
        modalityHints: inferModalityHints(chunk.text, sourceType, chunk.hasImages),
        topicHints: doc.topicHints,
        relevanceScore: 0,
      };
    }
  }
  return {
    id: doc.id,
    text: sanitizeChunkText(doc.text).slice(0, 1600),
    sourcePath: doc.sourcePath,
    classLevel: doc.classLevel,
    subject: doc.subject,
    sourceType,
    chapterId: doc.chapterId ?? undefined,
    year: doc.year,
    page: doc.page,
    chunkIndex: doc.chunkIndex,
    modalityHints: doc.modalityHints,
    topicHints: doc.topicHints,
    relevanceScore: 0,
  };
}

function buildRetrievalMeta(
  snippets: ContextSnippet[],
  chapterId?: string,
  options?: {
    correctiveActions?: string[];
    topicFocus?: string[];
    strategies?: string[];
    queryText?: string;
  }
): ContextPack['retrievalMeta'] {
  const snippetCount = snippets.length;
  const averageRelevance = snippetCount > 0
    ? Number((snippets.reduce((sum, snippet) => sum + Number(snippet.relevanceScore || 0), 0) / snippetCount).toFixed(2))
    : 0;
  const sourceMix = Array.from(
    new Set(snippets.map((snippet) => normalizeSnippetSourceType(snippet.sourceType)))
  ) as Array<'paper' | 'textbook' | 'image-ocr'>;
  const chapterMatchCount = chapterId
    ? snippets.filter((snippet) => snippet.chapterId === chapterId).length
    : 0;
  const topicFocus = unique((options?.topicFocus ?? []).filter(Boolean)).slice(0, 6);
  const confidenceResult = evaluateRetrievalConfidence({
    queryText: options?.queryText ?? topicFocus.join(' '),
    chapterId,
    topicFocus,
    ranked: snippets.map((snippet) => ({
      relevanceScore: Number(snippet.relevanceScore || 0),
      sourceType: normalizeSnippetSourceType(snippet.sourceType),
      chapterId: snippet.chapterId,
    })),
  });
  return {
    snippetCount,
    averageRelevance,
    sourceMix,
    chapterMatchCount,
    confidence: confidenceResult.confidence,
    confidenceLevel: confidenceResult.level,
    confidenceReasons: confidenceResult.reasons,
    correctiveActions: unique(options?.correctiveActions ?? []),
    topicFocus,
    visualSnippetCount: snippets.filter((snippet) => (snippet.modalityHints ?? []).includes('diagram') || snippet.sourceType === 'image-ocr').length,
    strategies: unique(options?.strategies ?? []),
  };
}

function buildCorrectiveQueries(query: ContextQuery, expandedQuery: string, topicFocus: string[]): string[] {
  const chapter = query.chapterId ? getChapterById(query.chapterId) : undefined;
  const chapterTitle = chapter?.title ?? '';
  const chapterTopics = chapter?.topics ?? query.chapterTopics ?? [];
  return unique([
    expandedQuery,
    [query.query ?? '', chapterTitle, ...topicFocus].filter(Boolean).join(' '),
    [query.query ?? '', ...chapterTopics.slice(0, 6)].filter(Boolean).join(' '),
    [expandedQuery, ...chapterTopics.slice(0, 4)].filter(Boolean).join(' '),
  ]).filter((item) => item.trim().length > 0);
}

function selectFallbackSource(query: ContextQuery): string | null {
  const sourcePriority = (sourcePath: string): number => {
    if (/^\d{4}(?:-COMPTT)?\/Class_(10|12)\//.test(sourcePath)) return 0; // CBSE paper dataset
    if (/^dataset\/cbse_papers\//.test(sourcePath)) return 0;
    if (/ncert_textbooks/i.test(sourcePath)) return 2;
    return 1;
  };

  const chapterSources = query.chapterId ? cachedIndex.chapters?.[query.chapterId] ?? [] : [];
  const normalizedChapterSources = Array.from(new Set(chapterSources.map((item) => canonicalizeSourcePath(item))))
    .sort((a, b) => sourcePriority(a) - sourcePriority(b));
  if (normalizedChapterSources.length > 0) return normalizedChapterSources[0];

  const normalizedSubject = normalizeSubject(query.classLevel, query.subject);
  const key = `${query.classLevel}|${normalizedSubject}`;
  const subjectSources = cachedIndex.sourcesBySubjectClass?.[key] ?? [];
  const normalizedSubjectSources = Array.from(new Set(subjectSources.map((item) => canonicalizeSourcePath(item))))
    .sort((a, b) => sourcePriority(a) - sourcePriority(b));
  if (normalizedSubjectSources.length > 0) return normalizedSubjectSources[0];
  return null;
}

async function appendChunkToCache(chunk: ContextChunk): Promise<void> {
  const normalizedChunk: ContextChunk = {
    ...chunk,
    sourceType: chunk.sourceType === 'textbook' ? 'textbook' : chunk.sourceType === 'image-ocr' ? 'image-ocr' : 'paper',
    chapterId: typeof chunk.chapterId === 'string' && chunk.chapterId.trim().length > 0 ? chunk.chapterId.trim() : null,
    sourcePath: canonicalizeSourcePath(chunk.sourcePath),
    text: sanitizeChunkText(chunk.text),
  };
  if (!isHighQualityChunk(normalizedChunk.text)) return;
  const line = `${JSON.stringify(normalizedChunk)}\n`;
  try {
    await fs.mkdir(CONTEXT_DIR, { recursive: true });
    await fs.appendFile(CHUNK_PATHS[0], line, 'utf-8');
    cachedChunks.push(normalizedChunk);

    if (normalizedChunk.chapterId) {
      const chapters = (cachedIndex.chapters ??= {});
      const current = chapters[normalizedChunk.chapterId] ?? [];
      if (!current.map((item) => canonicalizeSourcePath(item)).includes(normalizedChunk.sourcePath)) {
        chapters[normalizedChunk.chapterId] = [...current, normalizedChunk.sourcePath].slice(0, 12);
      }
    }

    const sources = (cachedIndex.sourcesBySubjectClass ??= {});
    const key = `${normalizedChunk.classLevel}|${normalizeSubject(normalizedChunk.classLevel, normalizedChunk.subject)}`;
    const existing = sources[key] ?? [];
    if (!existing.map((item) => canonicalizeSourcePath(item)).includes(normalizedChunk.sourcePath)) {
      sources[key] = [...existing, normalizedChunk.sourcePath].slice(0, 40);
    }

    await fs.writeFile(INDEX_PATHS[0], JSON.stringify(cachedIndex, null, 2), 'utf-8');
  } catch (error) {
    logger.error({ err: error }, '[context-retriever] Failed to write-through chunk cache');
  }
}

async function runOnDemandExtraction(relativePath: string): Promise<string> {
  // Subprocess spawning fails in serverless/edge runtimes and when Python is not on PATH.
  // Disabled by default — set ENABLE_ON_DEMAND_PDF_EXTRACTION=1 in a long-running Node server only.
  if (process.env.ENABLE_ON_DEMAND_PDF_EXTRACTION !== '1') return '';
  if (process.env.NEXT_RUNTIME === 'edge') return '';

  const baseArgs = [
    INDEX_SCRIPT,
    '--single-file',
    relativePath,
    '--dataset-root',
    DATASET_ROOT,
    '--max-pages',
    '4',
    '--json-stdout',
  ];

  const candidates: Array<{ cmd: string; args: string[] }> = [];
  if (process.env.PYTHON_BIN?.trim()) {
    candidates.push({ cmd: process.env.PYTHON_BIN.trim(), args: baseArgs });
  }
  candidates.push({ cmd: 'python', args: baseArgs });
  candidates.push({ cmd: 'python3', args: baseArgs });
  if (process.platform === 'win32') {
    candidates.push({ cmd: 'py', args: ['-3', ...baseArgs] });
  }

  for (const candidate of candidates) {
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const proc = spawn(candidate.cmd, candidate.args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
          proc.kill('SIGKILL');
          reject(new Error('timeout'));
        }, 10_000);
        proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8'); });
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8'); });
        proc.on('close', (code) => {
          clearTimeout(timer);
          if (code !== 0) { reject(new Error(`exit ${code}: ${stderr.slice(0, 200)}`)); return; }
          resolve(stdout);
        });
        proc.on('error', (err) => { clearTimeout(timer); reject(err); });
      });
      const parsed = JSON.parse(text || '{}') as { text?: string };
      return typeof parsed.text === 'string' ? parsed.text.trim() : '';
    } catch {
      continue;
    }
  }
  return '';
}

async function getOnDemandSnippet(query: ContextQuery): Promise<ContextSnippet | null> {
  const sourcePath = selectFallbackSource(query);
  if (!sourcePath) return null;

  const extracted = await runOnDemandExtraction(sourcePath);
  const chapter = query.chapterId ? getChapterById(query.chapterId) : undefined;
  const fallbackText =
    extracted ||
    `Source paper: ${sourcePath}. Focus chapter: ${chapter?.title ?? query.chapterId ?? 'N/A'}. Topics: ${(
      query.chapterTopics ?? chapter?.topics ?? []
    ).join(', ')}.`;

  if (!fallbackText.trim()) return null;
  const cleaned = sanitizeChunkText(fallbackText.slice(0, 3500));
  if (!cleaned) return null;

  const resolvedChapterId = query.chapterId ?? inferChapterIdFromSource(sourcePath);
  const chunk: ContextChunk = {
    id: `ctx-ondemand-${createHash('md5').update(`${sourcePath}|${query.chapterId ?? ''}`).digest('hex').slice(0, 12)}`,
    sourceType: 'paper',
    text: cleaned,
    sourcePath: canonicalizeSourcePath(sourcePath),
    classLevel: query.classLevel,
    subject: normalizeSubject(query.classLevel, query.subject),
    chapterId: resolvedChapterId,
    year: Number(sourcePath.slice(0, 4)) || undefined,
    paperType: sourcePath.includes('COMPTT') ? 'compartment' : 'board',
  };

  await appendChunkToCache(chunk);
  return {
    ...chunk,
    chapterId: chunk.chapterId ?? undefined,
    relevanceScore: 0,
  };
}

// ── pgvector retrieval (when document_embeddings table is populated) ──────────

interface PgvectorRow {
  id: string;
  text: string;
  source_path: string;
  class_level: number;
  subject: string;
  source_type: string;
  chapter_id: string | null;
  year: number | null;
  paper_type: string | null;
  similarity: number;
}

async function getPgvectorSnippets(query: ContextQuery): Promise<ContextSnippet[] | null> {
  if (!isPgvectorEnabled()) return null;
  if (Date.now() < pgvectorUnavailableUntilMs) return null;

  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  try {
    const [
      { isSupabaseServiceConfigured, supabaseRpc },
      { createGeminiRetrievalEmbeddings, isUsableGeminiApiKey },
    ] = await Promise.all([
      import('@/lib/supabase-rest'),
      import('@/lib/ai/gemini-embeddings'),
    ]);
    if (!isSupabaseServiceConfigured() || !isUsableGeminiApiKey(geminiKey)) return null;

    const pyqForHyDE = query.chapterId ? getPYQData(query.chapterId) : null;
    const expandedQuery = expandRetrievalQuery({
      query: query.query ?? '',
      subject: query.subject,
      classLevel: query.classLevel,
      chapterTitle: query.chapterId ? getChapterById(query.chapterId)?.title : undefined,
      chapterTopics: query.chapterTopics ?? [],
      pyqTopics: pyqForHyDE?.importantTopics ?? [],
    });
    const queryText = (
      await buildHyDEQuery(
        expandedQuery,
        query.subject,
        query.classLevel,
        query.chapterTopics ?? [],
        pyqForHyDE?.importantTopics ?? [],
        query.chapterId ? getChapterById(query.chapterId)?.title : undefined
      )
    ).slice(0, 2048);

    const [embedding] = await createGeminiRetrievalEmbeddings({
      apiKey: geminiKey,
      input: [queryText],
      taskType: 'RETRIEVAL_QUERY',
      dimensions: 1024,
    });
    if (!embedding || embedding.length !== 1024) return null;

    const topK = Math.max(1, Math.min(14, query.topK ?? 4));
    const candidatePoolSize = resolveCandidatePoolSize(topK, 64);
    const rows = await supabaseRpc<PgvectorRow[]>('match_document_embeddings', {
      query_embedding: `[${embedding.join(',')}]`,
      match_count: candidatePoolSize,
      filter_class: query.classLevel,
      filter_subject: normalizeSubject(query.classLevel, query.subject),
      filter_chapter: query.chapterId ?? null,
    });

    if (!Array.isArray(rows) || rows.length === 0) return null;

    const pgSnippets: ContextSnippet[] = [];
    const seenKeys = new Set<string>();
    for (const row of rows) {
      const text = sanitizeChunkText(row.text).slice(0, 1600);
      if (!isHighQualityChunk(text)) continue;
      const dedupeKey = `${row.source_path}|${text.slice(0, 260).toLowerCase()}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);
      pgSnippets.push({
        id: row.id,
        text,
        sourcePath: canonicalizeSourcePath(row.source_path),
        classLevel: row.class_level,
        subject: row.subject,
        sourceType: normalizeSnippetSourceType(row.source_type as RetrievalSourceType),
        chapterId: row.chapter_id ?? undefined,
        year: row.year ?? undefined,
        paperType: row.paper_type as PaperType | undefined,
        modalityHints: inferModalityHints(text, normalizeSnippetSourceType(row.source_type as RetrievalSourceType)),
        relevanceScore: Number((row.similarity * 100).toFixed(2)),
      });
    }
    if (pgSnippets.length > 0) {
      await loadContextArtifacts();
      const retrievalIndex = getRetrievalIndex();
      const topicFocus = findTopicFocus(retrievalIndex, {
        classLevel: query.classLevel,
        subject: normalizeSubject(query.classLevel, query.subject),
        chapterId: query.chapterId,
        queryText,
        maxTopics: 4,
      }).map((entry) => entry.topic);
      const sparseDocs = searchBm25Documents(retrievalIndex, `${queryText} ${topicFocus.join(' ')}`.trim(), {
        classLevel: query.classLevel,
        subject: normalizeSubject(query.classLevel, query.subject),
        chapterId: query.chapterId,
        includeKinds: ['chunk'],
        maxResults: candidatePoolSize,
      });
      const wantsVisual = needsVisualRetrieval(query.query ?? queryText, query.task, query.chapterTopics ?? []);
      const visualDocs = wantsVisual
        ? searchBm25Documents(retrievalIndex, `${queryText} ${topicFocus.join(' ')}`.trim(), {
            classLevel: query.classLevel,
            subject: normalizeSubject(query.classLevel, query.subject),
            chapterId: query.chapterId,
            includeKinds: ['visual', 'chunk'],
            maxResults: Math.max(6, topK * 2),
          }).filter((entry) => entry.doc.kind === 'visual' || entry.doc.modalityHints.includes('diagram'))
        : [];

      const fused = reciprocalRankFusion<ContextSnippet>([
        pgSnippets.map((snippet) => ({ item: snippet, score: snippet.relevanceScore })),
        sparseDocs.map((entry) => ({
          item: retrievalDocumentToSnippet(entry.doc),
          score: entry.score * 10,
        })),
        visualDocs.map((entry) => ({
          item: retrievalDocumentToSnippet(entry.doc),
          score: entry.score * 12,
        })),
      ]);

      const fusedSnippets: ContextSnippet[] = [];
      const fusedSeen = new Set<string>();
      for (const entry of fused) {
        const snippet = {
          ...entry.item,
          relevanceScore: Number((Math.max(entry.item.relevanceScore || 0, entry.score * 1000)).toFixed(2)),
        };
        const dedupeKey = buildSnippetDedupeKey(snippet);
        if (fusedSeen.has(dedupeKey)) continue;
        fusedSeen.add(dedupeKey);
        fusedSnippets.push(snippet);
        if (fusedSnippets.length >= Math.max(topK * 2, 12)) break;
      }

      pgvectorUnavailableUntilMs = 0;
      pgvectorMissingHintLogged = false;
      return fusedSnippets;
    }
    return null;
  } catch (error) {
    if (isPgvectorMissingError(error)) {
      markPgvectorTemporarilyUnavailable('missing table or RPC function');
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getContextPack(query: ContextQuery): Promise<ContextPack> {
  await loadContextArtifacts();

  const QUESTION_TASKS = new Set<ContextTask>([
    'mcq',
    'adaptive-test',
    'chapter-drill',
    'flashcards',
    'chapter-diagnose',
    'chapter-remediate',
    'chapter-pack',
  ]);
  const needsDiversity = QUESTION_TASKS.has(query.task);
  const topK = needsDiversity
    ? Math.max(8, Math.min(14, query.topK ?? 10))
    : Math.max(1, Math.min(8, query.topK ?? 4));

  const normalizedSubject = normalizeSubject(query.classLevel, query.subject);
  const chapter = query.chapterId ? getChapterById(query.chapterId) : undefined;
  const localPyq = query.chapterId ? getPYQData(query.chapterId) : null;
  const chapterTopics = unique([...(query.chapterTopics ?? []), ...(chapter?.topics ?? [])]);
  const retrievalIndex = getRetrievalIndex();
  const expandedQuery = expandRetrievalQuery({
    query: query.query ?? '',
    subject: query.subject,
    classLevel: query.classLevel,
    chapterTitle: chapter?.title,
    chapterTopics,
    pyqTopics: localPyq?.importantTopics ?? [],
  });
  const hydeQuery = await buildHyDEQuery(
    expandedQuery,
    query.subject,
    query.classLevel,
    chapterTopics,
    localPyq?.importantTopics ?? [],
    chapter?.title
  );
  const topicFocusResults = findTopicFocus(retrievalIndex, {
    classLevel: query.classLevel,
    subject: normalizedSubject,
    chapterId: query.chapterId,
    queryText: `${expandedQuery} ${hydeQuery}`.trim(),
    maxTopics: 4,
  });
  const topicFocus = topicFocusResults.map((entry) => entry.topic);
  const topicChunkIds = new Set(topicFocusResults.flatMap((entry) => entry.chunkIds));
  const wantsVisual = needsVisualRetrieval(query.query ?? expandedQuery, query.task, chapterTopics);
  const focusText = unique([expandedQuery, hydeQuery, ...topicFocus]).join(' ').trim();

  const selectDiversifiedSnippets = (rankedCandidates: Array<{ snippet: ContextSnippet; score: number }>): ContextSnippet[] => {
    const uniqueCandidates: Array<{ snippet: ContextSnippet; score: number }> = [];
    const seen = new Set<string>();
    for (const entry of rankedCandidates.sort((a, b) => b.score - a.score)) {
      const key = buildSnippetDedupeKey(entry.snippet);
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueCandidates.push(entry);
    }
    if (!needsDiversity) return uniqueCandidates.slice(0, topK).map((entry) => entry.snippet);

    const selected: ContextSnippet[] = [];
    const used = new Set<string>();
    const textbookQuota = Math.min(Math.max(3, Math.floor(topK * 0.35)), uniqueCandidates.filter((item) => item.snippet.sourceType === 'textbook').length);
    const visualQuota = wantsVisual ? Math.min(2, uniqueCandidates.filter((item) => item.snippet.sourceType === 'image-ocr' || (item.snippet.modalityHints ?? []).includes('diagram')).length) : 0;

    const pull = (predicate: (entry: { snippet: ContextSnippet; score: number }) => boolean, quota: number) => {
      for (const entry of uniqueCandidates) {
        if (selected.length >= topK || quota <= 0) break;
        const key = buildSnippetDedupeKey(entry.snippet);
        if (used.has(key) || !predicate(entry)) continue;
        used.add(key);
        selected.push(entry.snippet);
        quota--;
      }
    };

    pull((entry) => entry.snippet.sourceType === 'textbook', textbookQuota);
    pull((entry) => entry.snippet.sourceType === 'image-ocr' || (entry.snippet.modalityHints ?? []).includes('diagram'), visualQuota);
    pull(() => true, topK - selected.length);
    return selected.slice(0, topK);
  };

  const buildLocalHybridPack = async (
    queryVariants: string[],
    broadenSubjectScope: boolean,
    correctiveActions: string[] = []
  ): Promise<ContextPack> => {
    const localDenseStrategy = supportsRemoteSemanticEmbeddings() ? 'local-dense-nvidia' : 'local-lexical-hash';
    const subjectScoped = cachedChunks.filter((chunk) => {
      if (chunk.classLevel !== query.classLevel) return false;
      if (normalizeSubject(chunk.classLevel, chunk.subject) !== normalizedSubject) return false;
      return isHighQualityChunk(chunk.text);
    });
    const chapterScoped = query.chapterId ? subjectScoped.filter((chunk) => chunk.chapterId === query.chapterId) : subjectScoped;
    const densePool = !broadenSubjectScope && chapterScoped.length >= Math.min(topK, 2) ? chapterScoped : subjectScoped;
    const candidatePoolSize = resolveCandidatePoolSize(topK, broadenSubjectScope ? 96 : 72);

    const denseLists: Array<Array<{ item: ContextSnippet; score: number }>> = [];
    for (const variant of unique(queryVariants).slice(0, 4)) {
      const queryEmbedding = await buildQueryEmbedding(variant);
      const denseRanked = densePool
        .map((chunk) => ({ chunk, score: computeScore(chunk, query, queryEmbedding) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, candidatePoolSize);
      denseLists.push(
        denseRanked.map((entry) => ({
          item: {
            ...entry.chunk,
            sourcePath: canonicalizeSourcePath(entry.chunk.sourcePath),
            text: sanitizeChunkText(entry.chunk.text).slice(0, 1600),
            sourceType: normalizeSnippetSourceType(entry.chunk.sourceType),
            chapterId: entry.chunk.chapterId ?? undefined,
            page: entry.chunk.page,
            chunkIndex: entry.chunk.chunkIndex,
            modalityHints: inferModalityHints(entry.chunk.text, normalizeSnippetSourceType(entry.chunk.sourceType), entry.chunk.hasImages),
            topicHints: inferTopicHints(entry.chunk.text, chapter),
            relevanceScore: Number(entry.score.toFixed(2)),
          },
          score: entry.score,
        }))
      );
    }

    const sparseLists = unique(queryVariants).slice(0, 4).map((variant) =>
      searchBm25Documents(retrievalIndex, `${variant} ${topicFocus.join(' ')}`.trim(), {
        classLevel: query.classLevel,
        subject: normalizedSubject,
        chapterId: broadenSubjectScope ? undefined : query.chapterId,
        includeKinds: ['chunk', 'topic'],
        maxResults: candidatePoolSize,
      }).map((entry) => ({
        item: retrievalDocumentToSnippet(entry.doc),
        score: entry.score * 10,
      }))
    );

    const visualList = wantsVisual
      ? searchBm25Documents(retrievalIndex, `${focusText} ${topicFocus.join(' ')}`.trim(), {
          classLevel: query.classLevel,
          subject: normalizedSubject,
          chapterId: broadenSubjectScope ? undefined : query.chapterId,
          includeKinds: ['visual', 'chunk'],
          maxResults: Math.max(8, topK * 2),
        })
          .filter((entry) => entry.doc.kind === 'visual' || entry.doc.modalityHints.includes('diagram'))
          .map((entry) => ({
            item: retrievalDocumentToSnippet(entry.doc),
            score: entry.score * 12,
          }))
      : [];

    const fused = reciprocalRankFusion<ContextSnippet>([...denseLists, ...sparseLists, visualList]);
    const rankedCandidates: Array<{ snippet: ContextSnippet; score: number }> = [];
    for (const entry of fused) {
      const snippet = {
        ...entry.item,
        sourcePath: canonicalizeSourcePath(entry.item.sourcePath),
        modalityHints: entry.item.modalityHints ?? inferModalityHints(entry.item.text, normalizeSnippetSourceType(entry.item.sourceType)),
        topicHints: entry.item.topicHints ?? [],
      };
      let score = Math.max(entry.item.relevanceScore || 0, entry.score * 1000);
      if (topicChunkIds.has(snippet.id)) score += 8;
      if (wantsVisual && (snippet.sourceType === 'image-ocr' || (snippet.modalityHints ?? []).includes('diagram'))) score += 6;
      rankedCandidates.push({
        snippet: {
          ...snippet,
          relevanceScore: Number(score.toFixed(2)),
        },
        score,
      });
    }

    let selected = selectDiversifiedSnippets(rankedCandidates);
    let usedOnDemandFallback = false;
    let meta = buildRetrievalMeta(selected, query.chapterId, {
      queryText: focusText,
        topicFocus,
        correctiveActions,
        strategies: unique([
          localDenseStrategy,
          'contextual-bm25',
          'rank-fusion',
        'topic-hierarchy',
        wantsVisual ? 'visual-retrieval' : '',
        broadenSubjectScope ? 'corrective-retrieval' : '',
      ]).filter(Boolean),
    })!;
    if (selected.length === 0 || meta.confidenceLevel === 'low') {
      const onDemand = await getOnDemandSnippet(query);
      if (onDemand) {
        onDemand.relevanceScore = Math.max(12, onDemand.relevanceScore);
        selected = [onDemand, ...selected].slice(0, topK);
        usedOnDemandFallback = true;
        meta = buildRetrievalMeta(selected, query.chapterId, {
          queryText: focusText,
          topicFocus,
          correctiveActions: unique([...correctiveActions, 'on-demand-extraction']),
          strategies: unique([...(meta?.strategies ?? []), 'on-demand-extraction']),
        })!;
      }
    }

    const rerankPool = selected.slice(0, Math.max(topK * 2, topK));
    const reranked = shouldUseNvidiaRerank(query)
      ? await rerankContextSnippets(query, rerankPool).catch(() => rerankPool)
      : rerankPool;
    const finalSnippets = reranked.slice(0, topK);
    const compressed = await compressContextSnippets(finalSnippets, focusText, query);
    return {
      snippets: compressed,
      contextHash: buildContextHash(compressed),
      usedOnDemandFallback,
      usedPgvector: false,
      retrievalMeta: buildRetrievalMeta(compressed, query.chapterId, {
        queryText: focusText,
        topicFocus,
        correctiveActions: meta?.correctiveActions ?? correctiveActions,
        strategies: meta?.strategies ?? [localDenseStrategy, 'contextual-bm25', 'rank-fusion', 'topic-hierarchy'],
      }),
    };
  };

  const localPrimary = await buildLocalHybridPack([focusText], false);
  const localCorrective =
    localPrimary.retrievalMeta?.confidenceLevel === 'low'
      ? await buildLocalHybridPack(buildCorrectiveQueries(query, expandedQuery, topicFocus), true, [
          'alternate-query-expansion',
          'broadened-subject-scope',
        ])
      : null;
  const bestLocal =
    localCorrective && (localCorrective.retrievalMeta?.confidence ?? 0) > (localPrimary.retrievalMeta?.confidence ?? 0)
      ? localCorrective
      : localPrimary;

  const pgSnippets = await getPgvectorSnippets({ ...query, topK });
  if (pgSnippets && pgSnippets.length > 0) {
    const rerankPool = pgSnippets.slice(0, Math.max(topK * 2, 12));
    const reranked = shouldUseNvidiaRerank(query)
      ? await rerankContextSnippets(query, rerankPool).catch(() => rerankPool)
      : rerankPool;
    const selected = reranked.slice(0, topK);
    const compressed = await compressContextSnippets(selected, focusText, query);
    const pgPack: ContextPack = {
      snippets: compressed,
      contextHash: buildContextHash(compressed),
      usedOnDemandFallback: false,
      usedPgvector: true,
      retrievalMeta: buildRetrievalMeta(compressed, query.chapterId, {
        queryText: focusText,
        topicFocus,
        correctiveActions: [],
        strategies: unique([
          'pgvector-dense',
          'contextual-bm25',
          'rank-fusion',
          'topic-hierarchy',
          wantsVisual ? 'visual-retrieval' : '',
        ]).filter(Boolean),
      }),
    };
    if ((pgPack.retrievalMeta?.confidence ?? 0) >= (bestLocal.retrievalMeta?.confidence ?? 0)) {
      return pgPack;
    }
  }

  return bestLocal;
}
