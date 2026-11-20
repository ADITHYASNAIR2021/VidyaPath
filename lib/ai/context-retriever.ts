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
import { sharedState } from '@/lib/runtime/shared-state';
import { inspectAiText, recordBoundaryBlock } from '@/lib/ai/boundary-policy';
import { readRetrievalReport } from '@/lib/ai/retrieval-report';
import { searchRemoteIndex, resolveRemoteHits } from '@/lib/ai/remote-retrieval';
import { isStudentAiProviderAllowed } from '@/lib/ai/provider-policy';

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
  /** Deterministic diagnostics: never call providers or run PDF extraction. */
  localOnly?: boolean;
  task: ContextTask;
  classLevel: number;
  subject: string;
  chapterId?: string;
  chapterTopics?: string[];
  query?: string;
  topK?: number;
}

export interface ContextPack {
  chapterCoverage?: { requested: string[]; retrieved: string[]; missing: string[] };
  snippets: ContextSnippet[];
  contextHash: string;
  usedOnDemandFallback: boolean;
  usedRemoteIndex: boolean;
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
// Artifacts never change while the server runs; only retry periodically if the load came back empty.
const EMPTY_RETRY_MS = 5 * 60 * 1000;
const EMBEDDING_DIM = 192;
const DEFAULT_NVIDIA_EMBED_MODEL = 'nvidia/nemotron-3-embed-1b';
const DEFAULT_NVIDIA_RERANK_MODEL = 'nvidia/llama-nemotron-rerank-1b-v2';
const VECTOR_INDEX_PATH = path.join(CONTEXT_DIR, 'chunk_vectors.jsonl');
const RETRIEVAL_INDEX_PATH = path.join(CONTEXT_DIR, 'retrieval_index.json');
const DEFAULT_LOCAL_CANDIDATE_POOL = 48;

// RAG artifacts are static for the lifetime of a deployment. Keep a single copy per server
// process (shared by every API route) instead of one copy per route bundle.
interface RagCache {
  loadedAt: number;
  loading: Promise<void> | null;
  chunks: ContextChunk[];
  index: ChapterIndexPayload;
  retrievalIndex: RetrievalIndex | null;
  chunkEmbeddings: Map<string, Float32Array>;
  persistedEmbeddings: Map<string, Float32Array>;
  embeddingDim: number;
  embeddingKind: 'hashed-bow' | 'nvidia-e5' | 'onnx-minilm';
  embeddingModel: string;
}

const rag = sharedState<RagCache>('rag-cache', () => ({
  loadedAt: 0,
  loading: null,
  chunks: [],
  index: {},
  retrievalIndex: null,
  chunkEmbeddings: new Map(),
  persistedEmbeddings: new Map(),
  embeddingDim: EMBEDDING_DIM,
  embeddingKind: 'hashed-bow',
  embeddingModel: 'local-hashed-bow',
}));

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
        !query.localOnly && index < 4
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
  return rag.embeddingKind === 'nvidia-e5' && rag.embeddingDim > 0;
}

let localEmbeddingPipeline: Promise<unknown> | null = null;

async function buildQueryEmbedding(text: string): Promise<Float32Array | null> {
  if (supportsRemoteSemanticEmbeddings()) {
    const nvidiaKey = process.env.NVIDIA_API_KEY?.trim();
    if (isStudentAiProviderAllowed('nvidia') && isUsableNvidiaApiKey(nvidiaKey)) {
      try {
        const { createNvidiaEmbeddings } = await import('@/lib/ai/nvidia-client');
        const [embedding] = await createNvidiaEmbeddings({
          apiKey: nvidiaKey,
          model: rag.embeddingModel || DEFAULT_NVIDIA_EMBED_MODEL,
          input: [text],
          inputType: 'query',
        });
        if (Array.isArray(embedding) && embedding.length === rag.embeddingDim) {
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
  if (rag.embeddingKind === 'onnx-minilm') {
    if (process.env.AI_ENABLE_LOCAL_EMBEDDINGS === '1' && !process.env.VERCEL) {
      try {
        localEmbeddingPipeline ??= import('@huggingface/transformers').then(({ pipeline, env }) => {
          env.cacheDir = path.join(process.cwd(), '.cache', 'embeddings');
          return pipeline('feature-extraction', rag.embeddingModel, { dtype: /e5/i.test(rag.embeddingModel) ? 'q8' : 'fp32' });
        });
        const pipe = await localEmbeddingPipeline as (text: string, options: Record<string, unknown>) => Promise<{ data: Float32Array }>;
        const input = /e5/i.test(rag.embeddingModel) ? `query: ${text}` : text;
        const output = await pipe(input, { pooling: 'mean', normalize: true });
        if (output.data.length === rag.embeddingDim) return Float32Array.from(output.data);
      } catch (error) {
        logger.warn({ err: error }, '[context-retriever] Local semantic query failed; using BM25');
      }
    }
    // Local ONNX execution is opt-in on long-running servers. Shipping the
    // transformer runtime in every serverless route adds hundreds of MB and
    // exceeds Vercel's function limit. Production semantic retrieval uses
    // Optional remote embeddings; BM25 remains the deterministic local fallback.
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
  const chapters = rag.index.chapters ?? {};
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
  const fresh = rag.loadedAt > 0 && (rag.chunks.length > 0 ? true : now - rag.loadedAt < EMPTY_RETRY_MS);
  if (!force && fresh) return;
  // Concurrent first requests share one load instead of each parsing ~100 MB of JSON.
  if (rag.loading) return rag.loading;
  rag.loading = loadContextArtifactsNow(now).finally(() => {
    rag.loading = null;
  });
  return rag.loading;
}

async function loadContextArtifactsNow(now: number): Promise<void> {
  rag.loadedAt = now;

  const cdnBaseUrl = (process.env.CONTEXT_CDN_URL || '').trim().replace(/\/+$/, '');
  const manifest = await readRetrievalReport();
  const expectedHashes = new Map((manifest?.artifacts ?? []).map((file) => [file.file.replace(/\.gz$/, ''), file.uncompressedSha256]));
  if (manifest?.optionalVectorArtifact) expectedHashes.set('chunk_vectors.jsonl', manifest.optionalVectorArtifact.uncompressedSha256);
  const validateArtifact = (fileName: string, text: string): string => {
    const expected = expectedHashes.get(fileName);
    if (expected && createHash('sha256').update(text).digest('hex') !== expected) throw new Error(`RAG artifact integrity mismatch: ${fileName}`);
    return text;
  };

  try {
    // ── Fetch context files from local disk or CDN ──
    const fetchFile = async (localPath: string, fileName: string): Promise<string> => {
      // Try local disk first
      try {
        return validateArtifact(fileName, await fs.readFile(localPath, 'utf-8'));
      } catch {
        // CI and production commits keep large context artifacts compressed.
        // Load the adjacent .gz file before considering a remote CDN fallback.
        try {
          const [{ gunzipSync }, compressed] = await Promise.all([
            import('node:zlib'),
            fs.readFile(`${localPath}.gz`),
          ]);
          return validateArtifact(fileName, gunzipSync(compressed, { maxOutputLength: 256 * 1024 * 1024 }).toString('utf-8'));
        } catch {
          // Local compressed artifact is unavailable — try the configured CDN.
        }

        // Fallback: fetch from CDN if configured (prefer .gz for smaller transfer)
        if (cdnBaseUrl) {
          // Remote content must match the manifest pinned by this deployment.
          if (!expectedHashes.get(fileName)) return '';
          try {
            const gzRes = await fetch(`${cdnBaseUrl}/${fileName}.gz`, { signal: AbortSignal.timeout(8000) });
            if (gzRes.ok) {
              const { gunzipSync } = await import('node:zlib');
              const compressed = Buffer.from(await gzRes.arrayBuffer());
              return validateArtifact(fileName, gunzipSync(compressed, { maxOutputLength: 256 * 1024 * 1024 }).toString('utf-8'));
            }
          } catch { /* .gz not available — try raw */ }
          try {
            const res = await fetch(`${cdnBaseUrl}/${fileName}`, { signal: AbortSignal.timeout(8000) });
            if (res.ok) return validateArtifact(fileName, await res.text());
          } catch { /* CDN fetch failed — return empty */ }
        }
        return '';
      }
    };

    const [chunkPayloads, indexPayloads, vectorPayload, retrievalIndexPayload] = await Promise.all([
      Promise.all(CHUNK_PATHS.map((p) => fetchFile(p, path.basename(p)))),
      Promise.all(INDEX_PATHS.map((p) => fetchFile(p, path.basename(p)))),
      // Local vectors are unnecessary for BM25/remote diagnostics. Avoid reading
      // hundreds of MB unless a matching local/hosted query encoder is enabled.
      !process.env.VERCEL && (process.env.AI_ENABLE_LOCAL_EMBEDDINGS === '1' || (Object.keys(manifest?.totals.vectorModels ?? {}).some((key) => key.startsWith('nvidia-e5|')) && isUsableNvidiaApiKey(process.env.NVIDIA_API_KEY)))
        ? fetchFile(VECTOR_INDEX_PATH, path.basename(VECTOR_INDEX_PATH)) : Promise.resolve(''),
      fetchFile(RETRIEVAL_INDEX_PATH, path.basename(RETRIEVAL_INDEX_PATH)),
    ]);

    const seen = new Set<string>();
    rag.chunks = chunkPayloads
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
        const issue = inspectAiText(`${entry.sourcePath}\n${entry.text}`, 'retrieval');
        if (issue) recordBoundaryBlock('retrieval', issue);
        return !issue;
      })
      .filter((entry) => {
        const dedupeKey = `${entry.chapterId ?? 'none'}|${entry.sourcePath}|${entry.text.slice(0, 260).toLowerCase()}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      });
    rag.chunkEmbeddings.clear();
    rag.persistedEmbeddings.clear();
    rag.embeddingDim = EMBEDDING_DIM;
    rag.embeddingKind = 'hashed-bow';
    rag.embeddingModel = 'local-hashed-bow';
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
          if (parsed.embedding.length === 0 || !parsed.embedding.every((value) => typeof value === 'number' && Number.isFinite(value))) continue;
          const kind = parsed.embeddingKind ?? 'hashed-bow';
          if (rag.persistedEmbeddings.size > 0 && (
            parsed.embedding.length !== rag.embeddingDim || kind !== rag.embeddingKind ||
            (parsed.embeddingModel && parsed.embeddingModel !== rag.embeddingModel)
          )) continue;
          const vec = new Float32Array(parsed.embedding);
          rag.persistedEmbeddings.set(parsed.id, vec);
          if (rag.persistedEmbeddings.size === 1) {
            rag.embeddingDim = vec.length;
            rag.embeddingKind = parsed.embeddingKind === 'nvidia-e5' ? 'nvidia-e5' : parsed.embeddingKind === 'onnx-minilm' ? 'onnx-minilm' : 'hashed-bow';
            rag.embeddingModel = parsed.embeddingModel?.trim() || (rag.embeddingKind === 'nvidia-e5' ? DEFAULT_NVIDIA_EMBED_MODEL : rag.embeddingKind === 'onnx-minilm' ? 'Xenova/all-MiniLM-L6-v2' : 'local-hashed-bow');
          }
        } catch {
          continue;
        }
      }
    }

    rag.index = indexPayloads.reduce<ChapterIndexPayload>((acc, raw) => {
      try {
        const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as ChapterIndexPayload;
        return mergeIndexPayload(acc, parsed);
      } catch {
        return acc;
      }
    }, {});

    rag.retrievalIndex = null;
    if (retrievalIndexPayload.trim().length > 0) {
      try {
        const parsed = JSON.parse(retrievalIndexPayload.replace(/^\uFEFF/, '')) as RetrievalIndex;
        if (Array.isArray(parsed.docs) && parsed.docs.length > 0) {
          rag.retrievalIndex = parsed;
        }
      } catch {
        rag.retrievalIndex = null;
      }
    }
    if (!rag.retrievalIndex) {
      rag.retrievalIndex = buildRetrievalIndex(rag.chunks, (chapterId) => getChapterById(chapterId));
    }
  } catch (error) {
    logger.error({ err: error }, '[context-retriever] Failed to load context artifacts');
    rag.chunks = [];
    rag.index = {};
    rag.retrievalIndex = null;
  }

  // ── Degraded-mode warning: if no chunks loaded, log it clearly ──
  if (rag.chunks.length === 0) {
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
    chunkCount: rag.chunks.length,
    chapterCount: Object.keys(rag.index.chapters ?? {}).length,
    hasVectors: rag.persistedEmbeddings.size > 0,
    hasRetrievalIndex: !!rag.retrievalIndex,
    embeddingKind: rag.embeddingKind,
    embeddingDim: rag.embeddingDim,
    embeddingModel: rag.embeddingModel,
    semanticEnabled: rag.persistedEmbeddings.size > 0 && (
      (rag.embeddingKind === 'nvidia-e5' && isUsableNvidiaApiKey(process.env.NVIDIA_API_KEY)) ||
      (rag.embeddingKind === 'onnx-minilm' && process.env.AI_ENABLE_LOCAL_EMBEDDINGS === '1' && !process.env.VERCEL)
    ),
    degraded: rag.chunks.length === 0,
    lastLoadedAt: rag.loadedAt,
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
    let chunkEmbedding = rag.chunkEmbeddings.get(chunk.id);
    if (!chunkEmbedding) {
      chunkEmbedding = rag.persistedEmbeddings.get(chunk.id);
      if (!chunkEmbedding && rag.embeddingKind === 'hashed-bow') chunkEmbedding = buildLocalEmbedding(chunk.text);
      if (chunkEmbedding) rag.chunkEmbeddings.set(chunk.id, chunkEmbedding);
    }
    // Missing/stale vectors must not be compared to a different model space.
    if (chunkEmbedding?.length === queryEmbedding.length) {
      const semantic = cosineSimilarity(chunkEmbedding, queryEmbedding);
      const semanticWeight = rag.embeddingKind === 'nvidia-e5' ? 24 : rag.embeddingKind === 'onnx-minilm' ? 20 : 12;
      score += Math.max(0, semantic) * semanticWeight;
    }
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
        let candEmb = rag.chunkEmbeddings.get(remaining[i].chunk.id) ?? rag.persistedEmbeddings.get(remaining[i].chunk.id);
        if (!candEmb) {
          candEmb = buildLocalEmbedding(remaining[i].chunk.text);
          rag.chunkEmbeddings.set(remaining[i].chunk.id, candEmb);
        }
        for (const sel of selected) {
          let selEmb = rag.chunkEmbeddings.get(sel.chunk.id) ?? rag.persistedEmbeddings.get(sel.chunk.id) ?? buildLocalEmbedding(sel.chunk.text);
          if (candEmb.length !== selEmb.length) {
            candEmb = buildLocalEmbedding(remaining[i].chunk.text);
            selEmb = buildLocalEmbedding(sel.chunk.text);
            rag.chunkEmbeddings.set(remaining[i].chunk.id, candEmb);
            rag.chunkEmbeddings.set(sel.chunk.id, selEmb);
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

function shouldUseNvidiaRerankByConfig(): boolean {
  if (!isStudentAiProviderAllowed('nvidia')) return false;
  if (process.env.AI_ENABLE_NVIDIA_RERANK === '0') return false;
  return isUsableNvidiaApiKey(process.env.NVIDIA_API_KEY);
}

function shouldUseNvidiaRerank(query: ContextQuery): boolean {
  if (query.localOnly) return false;
  if (!query.query || !query.query.trim()) return false;
  return shouldUseNvidiaRerankByConfig();
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

const RERANK_DISABLE_MS = 6 * 60 * 60 * 1000;
const rerankBreaker = sharedState('rerank-breaker', () => ({ until: 0, reason: '' }));

/** Reranker state for the developer console. */
export function getRerankStatus(): { enabled: boolean; model: string; pausedUntil: string | null; reason: string | null } {
  const enabledByConfig = shouldUseNvidiaRerankByConfig();
  const paused = Date.now() < rerankBreaker.until;
  return {
    enabled: enabledByConfig && !paused,
    model: (process.env.AI_RERANK_MODEL || DEFAULT_NVIDIA_RERANK_MODEL).trim() || DEFAULT_NVIDIA_RERANK_MODEL,
    pausedUntil: paused ? new Date(rerankBreaker.until).toISOString() : null,
    reason: paused ? rerankBreaker.reason : null,
  };
}

async function rerankContextSnippets(query: ContextQuery, snippets: ContextSnippet[]): Promise<ContextSnippet[]> {
  const apiKey = process.env.NVIDIA_API_KEY;
  const queryText = query.query?.trim() || '';
  if (!queryText || snippets.length < 2) return snippets;

  if (isStudentAiProviderAllowed('nvidia') && isUsableNvidiaApiKey(apiKey) && Date.now() >= rerankBreaker.until) {
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
      // A retired/unknown rerank model (404/410) or bad key (401/403) will keep failing;
      // pause reranking instead of paying for the failed call on every request.
      const status = Number(String(error).match(/failed: (\d{3})/)?.[1] || 0);
      if ([401, 403, 404, 410].includes(status)) {
        rerankBreaker.until = Date.now() + RERANK_DISABLE_MS;
        rerankBreaker.reason = `${model}: HTTP ${status}`;
      }
      logger.warn({ err: String(error).slice(0, 300), status }, '[context-retriever] NVIDIA reranker failed, falling back to keyword-overlap ordering');
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
  if (rag.retrievalIndex) return rag.retrievalIndex;
  rag.retrievalIndex = buildRetrievalIndex(rag.chunks, (chapterId) => getChapterById(chapterId));
  return rag.retrievalIndex;
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
  return rag.chunks.find((chunk) => chunk.id === chunkId);
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

  const chapterSources = query.chapterId ? rag.index.chapters?.[query.chapterId] ?? [] : [];
  const normalizedChapterSources = Array.from(new Set(chapterSources.map((item) => canonicalizeSourcePath(item))))
    .sort((a, b) => sourcePriority(a) - sourcePriority(b));
  if (normalizedChapterSources.length > 0) return normalizedChapterSources[0];

  const normalizedSubject = normalizeSubject(query.classLevel, query.subject);
  const key = `${query.classLevel}|${normalizedSubject}`;
  const subjectSources = rag.index.sourcesBySubjectClass?.[key] ?? [];
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
    rag.chunks.push(normalizedChunk);

    if (normalizedChunk.chapterId) {
      const chapters = (rag.index.chapters ??= {});
      const current = chapters[normalizedChunk.chapterId] ?? [];
      if (!current.map((item) => canonicalizeSourcePath(item)).includes(normalizedChunk.sourcePath)) {
        chapters[normalizedChunk.chapterId] = [...current, normalizedChunk.sourcePath].slice(0, 12);
      }
    }

    const sources = (rag.index.sourcesBySubjectClass ??= {});
    const key = `${normalizedChunk.classLevel}|${normalizeSubject(normalizedChunk.classLevel, normalizedChunk.subject)}`;
    const existing = sources[key] ?? [];
    if (!existing.map((item) => canonicalizeSourcePath(item)).includes(normalizedChunk.sourcePath)) {
      sources[key] = [...existing, normalizedChunk.sourcePath].slice(0, 40);
    }

    await fs.writeFile(INDEX_PATHS[0], JSON.stringify(rag.index, null, 2), 'utf-8');
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
  if (query.localOnly) return null;
  const sourcePath = selectFallbackSource(query);
  if (!sourcePath) return null;

  const extracted = await runOnDemandExtraction(sourcePath);
  // A file path and topic list are metadata, not grounded source material.
  if (!extracted || !isHighQualityChunk(extracted)) return null;
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
  const hydeQuery = query.localOnly ? expandedQuery : await buildHyDEQuery(
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
  const normalizeTerm = (term: string) => term.length > 4 && term.endsWith('s') && !term.endsWith('ss') ? term.slice(0, -1) : term;
  const questionTerms = unique(tokenizeRetrievalText(query.query || '').filter((term) => !['explain', 'describe', 'please', 'give', 'create', 'generate', 'how', 'why', 'does'].includes(term)).map(normalizeTerm));
  const contentMatch = (snippet: ContextSnippet): number => {
    if (!questionTerms.length) return 0;
    const contentTerms = new Set(tokenizeRetrievalText(snippet.text).map(normalizeTerm));
    let matched = 0, total = 0;
    for (const term of questionTerms) {
      const weight = Math.max(1, Math.min(8, retrievalIndex.idf[term] || 1));
      total += weight;
      if (contentTerms.has(term)) matched += weight;
    }
    return total ? matched / total : 0;
  };
  const semanticQuery = { ...query, subject: normalizedSubject, query: query.query?.trim() || expandedQuery };
  const vectorCandidates = process.env.AI_VECTOR_BACKEND === 'remote'
    ? resolveRemoteHits(await searchRemoteIndex(semanticQuery), semanticQuery, rag.chunks)
    : [];

  const selectDiversifiedSnippets = (rankedCandidates: Array<{ snippet: ContextSnippet; score: number }>): ContextSnippet[] => {
    const uniqueCandidates: Array<{ snippet: ContextSnippet; score: number }> = [];
    const seen = new Set<string>();
    for (const entry of rankedCandidates.sort((a, b) => b.score - a.score)) {
      if (!isHighQualityChunk(entry.snippet.text)) continue;
      if (query.chapterId && entry.snippet.chapterId && entry.snippet.chapterId !== query.chapterId) continue;
      const issue = inspectAiText(`${entry.snippet.sourcePath}\n${entry.snippet.text}`, 'retrieval');
      if (issue) { recordBoundaryBlock('retrieval', issue); continue; }
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
    const subjectScoped = rag.chunks.filter((chunk) => {
      if (chunk.classLevel !== query.classLevel) return false;
      if (normalizeSubject(chunk.classLevel, chunk.subject) !== normalizedSubject) return false;
      return isHighQualityChunk(chunk.text);
    });
    const chapterScoped = query.chapterId ? subjectScoped.filter((chunk) => chunk.chapterId === query.chapterId) : subjectScoped;
    const densePool = !broadenSubjectScope && chapterScoped.length >= Math.min(topK, 2) ? chapterScoped : subjectScoped;
    const candidatePoolSize = resolveCandidatePoolSize(topK, broadenSubjectScope ? 96 : 72);

    const denseLists: Array<Array<{ item: ContextSnippet; score: number }>> = vectorCandidates.length
      ? [vectorCandidates.map((item) => ({ item, score: item.relevanceScore }))] : [];
    for (const variant of unique(queryVariants).slice(0, 4)) {
      const queryEmbedding = query.localOnly ? null : await buildQueryEmbedding(variant);
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
      searchBm25Documents(retrievalIndex, variant, {
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
      // Metadata/topic labels aid recall but must not substitute for words in
      // the actual passage. Keep scale-independent fusion bounded beside the
      // student's specific question, evaluated against excerpt text only.
      let score = Math.min(35, entry.score * 500) + contentMatch(snippet) * 65;
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
          vectorCandidates.length ? 'remote-e5-index' : '',
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

    // Rerank the candidate pool before truncating to the requested result count.
    const rerankPool: ContextSnippet[] = [];
    const rerankKeys = new Set<string>();
    for (const snippet of [...selected, ...rankedCandidates.map((entry) => entry.snippet)]) {
      if (!isHighQualityChunk(snippet.text)) continue;
      if (query.chapterId && snippet.chapterId && snippet.chapterId !== query.chapterId) continue;
      if (inspectAiText(`${snippet.sourcePath}\n${snippet.text}`, 'retrieval')) continue;
      const key = buildSnippetDedupeKey(snippet);
      if (rerankKeys.has(key)) continue;
      rerankKeys.add(key);
      rerankPool.push(snippet);
      if (rerankPool.length >= topK * 3) break;
    }
    const reranked = shouldUseNvidiaRerank(query)
      ? await rerankContextSnippets(query, rerankPool).catch(() => rerankPool)
      : rerankPool;
    const finalSnippets = reranked.slice(0, topK);
    const compressed = await compressContextSnippets(finalSnippets, query.query?.trim() || focusText, query);
    return {
      snippets: compressed,
      contextHash: buildContextHash(compressed),
      usedOnDemandFallback,
      usedRemoteIndex: vectorCandidates.length > 0,
      retrievalMeta: buildRetrievalMeta(compressed, query.chapterId, {
        queryText: focusText,
        topicFocus,
        correctiveActions: meta?.correctiveActions ?? correctiveActions,
        strategies: meta?.strategies ?? [localDenseStrategy, 'contextual-bm25', 'rank-fusion', 'topic-hierarchy'],
      }),
    };
  };

  // Preserve the student's specific question as an independent search. Mixing
  // every chapter topic into it can bury the relevant subsection in broad hits.
  const localPrimary = await buildLocalHybridPack([query.query?.trim() || expandedQuery, focusText], false);
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

  // Broad subject chunks supplement a verified chapter; they cannot establish
  // that an otherwise missing chapter (for example an absent story) is covered.
  if (chapter && query.chapterId && !bestLocal.snippets.some((snippet) => snippet.chapterId === query.chapterId)) {
    return { ...bestLocal, snippets: [], contextHash: buildContextHash([]), retrievalMeta: buildRetrievalMeta([], query.chapterId, { queryText: query.query || '', correctiveActions: ['missing-direct-chapter-evidence'], strategies: ['chapter-coverage-required'] }) };
  }
  return bestLocal;
}

/** Interleave evidence so a multi-chapter request cannot silently use only its first chapter. */
export async function getMultiChapterContextPack(input: { task: ContextTask; chapterIds: string[]; query: string; topK?: number; localOnly?: boolean }): Promise<ContextPack> {
  const ids = unique(input.chapterIds).slice(0, 16);
  const packs: Array<{ chapterId: string; pack: ContextPack }> = [];
  for (let start = 0; start < ids.length; start += 4) {
    const batch = await Promise.all(ids.slice(start, start + 4).map(async (id) => {
      const chapter = getChapterById(id);
      if (!chapter) throw new Error('Unknown chapter in multi-chapter retrieval');
      const pack = await getContextPack({ task: input.task, classLevel: chapter.classLevel, subject: chapter.subject, chapterId: id, chapterTopics: chapter.topics, query: `${input.query} ${chapter.title}`, topK: 2, localOnly: input.localOnly });
      return { chapterId: id, pack };
    }));
    packs.push(...batch);
  }
  const snippets: ContextSnippet[] = [];
  const seen = new Set<string>();
  for (let rank = 0; rank < 4; rank++) {
    for (const { pack } of packs) {
      const snippet = pack.snippets[rank];
      if (snippet && !seen.has(snippet.id)) { seen.add(snippet.id); snippets.push(snippet); }
    }
  }
  const selected = snippets.slice(0, Math.max(ids.length, Math.min(32, input.topK ?? 16)));
  const retrieved = packs.filter(({ pack }) => pack.snippets.length > 0).map(({ chapterId }) => chapterId);
  return {
    snippets: selected, contextHash: buildContextHash(selected), usedOnDemandFallback: packs.some(({ pack }) => pack.usedOnDemandFallback), usedRemoteIndex: packs.some(({ pack }) => pack.usedRemoteIndex),
    retrievalMeta: buildRetrievalMeta(selected, undefined, { queryText: input.query, strategies: ['multi-chapter-interleaved'] }),
    chapterCoverage: { requested: ids, retrieved, missing: ids.filter((id) => !retrieved.includes(id)) },
  };
}
