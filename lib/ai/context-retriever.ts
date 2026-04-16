import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getPYQData } from '@/lib/pyq';
import { getChapterById } from '@/lib/data';
import { isUsableNvidiaApiKey, rerankWithNvidia } from '@/lib/ai/nvidia-client';

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
  chapterId?: string | null;
  year?: number;
  paperType?: PaperType;
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
  chapterId?: string;
  year?: number;
  paperType?: PaperType;
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
}

const CONTEXT_DIR = path.join(process.cwd(), 'lib', 'context');
const CHUNKS_PATH = path.join(CONTEXT_DIR, 'chunks.jsonl');
const INDEX_PATH = path.join(CONTEXT_DIR, 'chapter_index.json');
const DATASET_ROOT = path.join(process.cwd(), 'dataset', 'cbse_papers');
const INDEX_SCRIPT = path.join(process.cwd(), 'scripts', 'build_context_index.py');
const CACHE_TTL_MS = 45_000;
const EMBEDDING_DIM = 192;
const DEFAULT_NVIDIA_RERANK_MODEL = 'nvidia/llama-nemotron-rerank-1b-v2';

let cacheLoadedAt = 0;
let cachedChunks: ContextChunk[] = [];
let cachedIndex: ChapterIndexPayload = {};
const chunkEmbeddingCache = new Map<string, Float32Array>();

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

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(
    (token) => !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'board', 'class', 'paper'].includes(token)
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

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let idx = 0; idx < len; idx++) dot += a[idx] * b[idx];
  return dot;
}

function sanitizeChunkText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/Use this for board-style question framing[^.]*\./gi, '')
    .replace(/Use this for[^.]*\./gi, '')
    .replace(/(?:general instructions|time allowed|max(?:imum)? marks|question paper code)[^.!?]{0,220}/gi, ' ')
    .replace(/section\s+[a-e]\s+questions?\s+no\.\s*\d+\s+to\s+\d+[^.!?]{0,220}/gi, ' ')
    .replace(/there is no overall choice[^.!?]{0,220}/gi, ' ')
    .replace(/use of calculators? is not allowed[^.!?]{0,80}/gi, ' ')
    .replace(/[\u0900-\u097F]+/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getEnglishRatio(text: string): number {
  const englishTokens = text.match(/[a-zA-Z]{2,}/g) ?? [];
  const allTokens = text.match(/[a-zA-Z0-9]+/g) ?? [];
  if (allTokens.length === 0) return 0;
  return englishTokens.length / allTokens.length;
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
  if (!text || text.length < 220) return false;
  if (getEnglishRatio(text) < 0.72) return false;
  if (looksLikeInstructionChunk(text)) return false;
  return true;
}

function inferChapterIdFromSource(sourcePath: string): string | undefined {
  const normalized = canonicalizeSourcePath(sourcePath);
  const chapters = cachedIndex.chapters ?? {};
  for (const [chapterId, sources] of Object.entries(chapters)) {
    if (sources.map((item) => canonicalizeSourcePath(item)).includes(normalized)) return chapterId;
  }
  return undefined;
}

async function loadContextArtifacts(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - cacheLoadedAt < CACHE_TTL_MS) return;
  cacheLoadedAt = now;

  try {
    const [chunksRaw, indexRaw] = await Promise.all([
      fs.readFile(CHUNKS_PATH, 'utf-8').catch(() => ''),
      fs.readFile(INDEX_PATH, 'utf-8').catch(() => '{}'),
    ]);

    const seen = new Set<string>();
    cachedChunks = chunksRaw
      .split('\n')
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
          !!entry.sourcePath &&
          typeof entry.chapterId === 'string' &&
          entry.chapterId.trim().length > 0
      )
      .map((entry) => {
        const cleanedText = sanitizeChunkText(entry.text);
        return {
          ...entry,
          sourcePath: canonicalizeSourcePath(entry.sourcePath),
          text: cleanedText,
        };
      })
      .filter((entry) => isHighQualityChunk(entry.text))
      .filter((entry) => {
        const dedupeKey = `${entry.chapterId}|${entry.sourcePath}|${entry.text.slice(0, 260).toLowerCase()}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      });
    chunkEmbeddingCache.clear();

    cachedIndex = JSON.parse(indexRaw.replace(/^\uFEFF/, '')) as ChapterIndexPayload;
  } catch (error) {
    console.error('[context-retriever] Failed to load context artifacts', error);
    cachedChunks = [];
    cachedIndex = {};
  }
}

function computeScore(chunk: ContextChunk, query: ContextQuery, queryEmbedding: Float32Array): number {
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

  let chunkEmbedding = chunkEmbeddingCache.get(chunk.id);
  if (!chunkEmbedding) {
    chunkEmbedding = buildLocalEmbedding(chunk.text);
    chunkEmbeddingCache.set(chunk.id, chunkEmbedding);
  }
  const semantic = cosineSimilarity(chunkEmbedding, queryEmbedding);
  score += Math.max(0, semantic) * 24;

  score += paperTypeWeight(chunk.paperType);
  score += yearWeight(chunk.year);
  return score;
}

function shouldUseNvidiaRerank(query: ContextQuery): boolean {
  if (process.env.AI_ENABLE_NVIDIA_RERANK !== '1') return false;
  if (!query.query || !query.query.trim()) return false;
  return isUsableNvidiaApiKey(process.env.NVIDIA_API_KEY);
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
  if (!isUsableNvidiaApiKey(apiKey)) return snippets;
  const model = (process.env.AI_RERANK_MODEL || DEFAULT_NVIDIA_RERANK_MODEL).trim() || DEFAULT_NVIDIA_RERANK_MODEL;
  const queryText = query.query?.trim() || '';
  if (!queryText || snippets.length < 2) return snippets;

  const payload = await rerankWithNvidia({
    apiKey,
    model,
    query: queryText,
    passages: snippets.map((snippet) => snippet.text),
  });
  const order = extractRerankOrder(payload, snippets.length);
  if (order.length === 0) return snippets;

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
    digest.update(snippet.sourcePath);
    digest.update('|');
    digest.update(snippet.text.slice(0, 120));
    digest.update('|');
    digest.update(String(snippet.year ?? 0));
    digest.update('|');
  }
  return digest.digest('hex');
}

function selectFallbackSource(query: ContextQuery): string | null {
  const chapterSources = query.chapterId ? cachedIndex.chapters?.[query.chapterId] ?? [] : [];
  const normalizedChapterSources = Array.from(new Set(chapterSources.map((item) => canonicalizeSourcePath(item))));
  if (normalizedChapterSources.length > 0) return normalizedChapterSources[0];

  const normalizedSubject = normalizeSubject(query.classLevel, query.subject);
  const key = `${query.classLevel}|${normalizedSubject}`;
  const subjectSources = cachedIndex.sourcesBySubjectClass?.[key] ?? [];
  const normalizedSubjectSources = Array.from(new Set(subjectSources.map((item) => canonicalizeSourcePath(item))));
  if (normalizedSubjectSources.length > 0) return normalizedSubjectSources[0];
  return null;
}

async function appendChunkToCache(chunk: ContextChunk): Promise<void> {
  if (!chunk.chapterId || typeof chunk.chapterId !== 'string' || !chunk.chapterId.trim()) return;
  const normalizedChunk: ContextChunk = {
    ...chunk,
    sourcePath: canonicalizeSourcePath(chunk.sourcePath),
    text: sanitizeChunkText(chunk.text),
  };
  if (!isHighQualityChunk(normalizedChunk.text)) return;
  const line = `${JSON.stringify(normalizedChunk)}\n`;
  try {
    await fs.mkdir(CONTEXT_DIR, { recursive: true });
    await fs.appendFile(CHUNKS_PATH, line, 'utf-8');
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

    await fs.writeFile(INDEX_PATH, JSON.stringify(cachedIndex, null, 2), 'utf-8');
  } catch (error) {
    console.error('[context-retriever] Failed to write-through chunk cache', error);
  }
}

async function runOnDemandExtraction(relativePath: string): Promise<string> {
  const baseArgs = [
    INDEX_SCRIPT,
    '--single-file',
    relativePath,
    '--dataset-root',
    DATASET_ROOT,
    '--max-pages',
    '2',
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

export async function getContextPack(query: ContextQuery): Promise<ContextPack> {
  await loadContextArtifacts();
  const topK = Math.max(1, Math.min(8, query.topK ?? 4));
  const normalizedSubject = normalizeSubject(query.classLevel, query.subject);
  const chapter = query.chapterId ? getChapterById(query.chapterId) : undefined;
  const queryEmbedding = buildLocalEmbedding(
    [query.query ?? '', ...(query.chapterTopics ?? []), ...(chapter?.topics ?? [])].join(' ')
  );

  const subjectScoped = cachedChunks
    .filter((chunk) => {
      if (chunk.classLevel !== query.classLevel) return false;
      if (normalizeSubject(chunk.classLevel, chunk.subject) !== normalizedSubject) return false;
      return isHighQualityChunk(chunk.text);
    });

  const chapterScoped = query.chapterId
    ? subjectScoped.filter((chunk) => chunk.chapterId === query.chapterId)
    : subjectScoped;
  const candidatePool = chapterScoped.length >= Math.min(topK, 2) ? chapterScoped : subjectScoped;

  const ranked = candidatePool
    .map((chunk) => ({
      chunk,
      score: computeScore(chunk, query, queryEmbedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((entry) => entry.score > 0);

  const dedupeSet = new Set<string>();
  const snippets: ContextSnippet[] = [];
  for (const entry of ranked) {
    const sourcePath = canonicalizeSourcePath(entry.chunk.sourcePath);
    const text = sanitizeChunkText(entry.chunk.text).slice(0, 1600);
    if (!isHighQualityChunk(text)) continue;
    const dedupeKey = `${sourcePath}|${text.slice(0, 260).toLowerCase()}`;
    if (dedupeSet.has(dedupeKey)) continue;
    dedupeSet.add(dedupeKey);
    snippets.push({
      ...entry.chunk,
      sourcePath,
      text,
      chapterId: entry.chunk.chapterId ?? undefined,
      relevanceScore: Number(entry.score.toFixed(2)),
    });
    if (snippets.length >= topK) break;
  }

  let usedOnDemandFallback = false;
  if (snippets.length === 0 || snippets.every((s) => s.relevanceScore < 8)) {
    const onDemand = await getOnDemandSnippet(query);
    if (onDemand) {
      onDemand.relevanceScore = Math.max(10, onDemand.relevanceScore);
      snippets.unshift(onDemand);
      usedOnDemandFallback = true;
    }
  }

  const clipped = snippets.slice(0, topK);
  const reranked = shouldUseNvidiaRerank(query)
    ? await rerankContextSnippets(query, clipped).catch(() => clipped)
    : clipped;

  return {
    snippets: reranked,
    contextHash: buildContextHash(reranked),
    usedOnDemandFallback,
  };
}
