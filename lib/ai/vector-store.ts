import path from 'node:path';
import type { ContextQuery, ContextSnippet } from '@/lib/ai/context-retriever';
import { createNvidiaEmbeddings, isUsableNvidiaApiKey } from '@/lib/ai/nvidia-client';
import { inspectAiText, recordBoundaryBlock } from '@/lib/ai/boundary-policy';
import { sharedState } from '@/lib/runtime/shared-state';

const status = sharedState('vector-store-status', () => ({ checkedAt: null as string | null, available: false, reason: 'not checked', model: null as string | null }));
export function getVectorStoreStatus() { return { configured: process.env.AI_VECTOR_BACKEND === 'supabase', corpusId: process.env.RAG_VECTOR_CORPUS_ID || null, ...status }; }
let localPipe: Promise<unknown> | null = null;
let localModel = '';

/** Optional, server-only backend. Never accepts a database URL, key or corpus ID from a student. */
export async function searchVectorStore(query: ContextQuery): Promise<ContextSnippet[]> {
  if (query.localOnly || process.env.AI_VECTOR_BACKEND !== 'supabase') return [];
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const corpusId = process.env.RAG_VECTOR_CORPUS_ID;
  if (!base || !key || !corpusId) { Object.assign(status, { available: false, reason: 'missing or invalid server configuration' }); return []; }
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  try {
    if (new URL(base).protocol !== 'https:') throw new Error('invalid-server-configuration');
    const metadataResponse = await fetch(`${base}/rest/v1/rag_corpora?id=eq.${encodeURIComponent(corpusId)}&select=embedding_model,embedding_kind,dimensions,ready`, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!metadataResponse.ok) throw new Error('metadata-unavailable');
    const rows = await metadataResponse.json() as Array<{ embedding_model: string; embedding_kind: string; dimensions: number; ready: boolean }>;
    const metadata = rows[0];
    if (!metadata?.ready) throw new Error('corpus-not-ready');
    let embedding: number[];
    if (metadata.embedding_kind === 'nvidia-e5' && metadata.dimensions === 2048 && isUsableNvidiaApiKey(process.env.NVIDIA_API_KEY)) {
      if (metadata.embedding_model !== (process.env.AI_EMBED_MODEL || 'nvidia/nemotron-3-embed-1b')) throw new Error('model-mismatch');
      [embedding] = await createNvidiaEmbeddings({ apiKey: process.env.NVIDIA_API_KEY, model: metadata.embedding_model, input: [query.query || ''], inputType: 'query' });
    } else if (metadata.embedding_kind === 'onnx-minilm' && metadata.dimensions === 384 && process.env.AI_ENABLE_LOCAL_EMBEDDINGS === '1' && !process.env.VERCEL) {
      if (!['Xenova/all-MiniLM-L6-v2', process.env.LOCAL_EMBED_MODEL || 'Xenova/multilingual-e5-small'].includes(metadata.embedding_model)) throw new Error('model-mismatch');
      if (localModel !== metadata.embedding_model) { localPipe = null; localModel = metadata.embedding_model; }
      localPipe ??= import('@huggingface/transformers').then(({ pipeline, env }) => { env.cacheDir = path.join(process.cwd(), '.cache/embeddings'); return pipeline('feature-extraction', localModel, { dtype: /e5/i.test(localModel) ? 'q8' : 'fp32' }); });
      const pipe = await localPipe as (text: string, options: Record<string, unknown>) => Promise<{ data: Float32Array }>;
      embedding = Array.from((await pipe(`${/e5/i.test(localModel) ? 'query: ' : ''}${query.query || ''}`, { pooling: 'mean', normalize: true })).data);
    } else throw new Error('query-encoder-unavailable');
    if (embedding.length !== metadata.dimensions || !embedding.every(Number.isFinite)) throw new Error('invalid-query-vector');
    const response = await fetch(`${base}/rest/v1/rpc/search_rag_chunks`, { method: 'POST', headers, signal: AbortSignal.timeout(8000), body: JSON.stringify({ p_corpus_id: corpusId, p_embedding: embedding, p_class: query.classLevel, p_subject: query.subject, p_chapter_id: query.chapterId || null, p_count: 24 }) });
    if (!response.ok) throw new Error('vector-search-unavailable');
    const results = await response.json() as Array<{ chunk_id: string; content: string; source_path: string; source_type: ContextSnippet['sourceType']; class_level: number; subject: string; chapter_id: string; page?: number; year?: number; similarity: number }>;
    if (!Array.isArray(results)) throw new Error('invalid-vector-result');
    const snippets: ContextSnippet[] = [];
    for (const row of results.slice(0, 48)) {
      const subject = row.class_level === 10 && ['Science', 'Physics', 'Chemistry', 'Biology'].includes(row.subject) ? 'Science' : row.subject;
      if (subject !== query.subject) continue;
      if (typeof row.content !== 'string' || typeof row.source_path !== 'string' || row.class_level !== query.classLevel || (query.chapterId && row.chapter_id !== query.chapterId) || !Number.isFinite(row.similarity)) continue;
      const issue = inspectAiText(`${row.source_path}\n${row.content}`, 'retrieval');
      if (issue) { recordBoundaryBlock('retrieval', issue); continue; }
      snippets.push({ id: row.chunk_id, text: row.content.slice(0, 1600), sourcePath: row.source_path, sourceType: row.source_type, classLevel: row.class_level, subject: row.subject, chapterId: row.chapter_id, page: row.page, year: row.year, relevanceScore: Math.max(0, row.similarity) * 40 });
    }
    Object.assign(status, { checkedAt: new Date().toISOString(), available: true, reason: 'ready', model: metadata.embedding_model });
    return snippets;
  } catch (error) {
    Object.assign(status, { checkedAt: new Date().toISOString(), available: false, reason: error instanceof Error && /^[a-z-]+$/.test(error.message) ? error.message : 'vector-backend-unavailable' });
    return []; // Deterministic local BM25 remains available; never substitute invented evidence.
  }
}
