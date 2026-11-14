import { z } from 'zod';
import { sharedState } from '@/lib/runtime/shared-state';
import { readRetrievalReport } from '@/lib/ai/retrieval-report';
import type { ContextQuery, ContextSnippet } from '@/lib/ai/context-retriever';

const state = sharedState('remote-retrieval-status', () => ({ checkedAt: null as string | null, available: false, reason: 'not checked', latencyMs: null as number | null }));
export function getRemoteRetrievalStatus() { return { configured: process.env.AI_VECTOR_BACKEND === 'remote', ...state }; }
const schema = z.object({ model: z.literal('Xenova/multilingual-e5-small'), dimensions: z.literal(384), corpusFingerprint: z.string().regex(/^[a-f0-9]{64}$/), vectorSha256: z.string().regex(/^[a-f0-9]{64}$/), hits: z.array(z.object({ id: z.string().min(1).max(240), score: z.number().finite().min(-1.01).max(1.01) }).strict()).max(48) }).strict();
export type RemoteHit = { id: string; score: number };

export async function searchRemoteIndex(query: ContextQuery): Promise<RemoteHit[]> {
  if (query.localOnly || process.env.AI_VECTOR_BACKEND !== 'remote') return [];
  const started = Date.now();
  try {
    const endpoint = new URL(process.env.RETRIEVAL_SERVICE_URL || '');
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/' || (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)))) throw new Error('invalid-endpoint');
    const key = process.env.RETRIEVAL_SERVICE_KEY || '';
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(key) || /replace|placeholder|your-key/i.test(key)) throw new Error('missing-service-key');
    const manifest = await readRetrievalReport();
    if (!manifest?.optionalVectorArtifact || Object.keys(manifest.totals.vectorModels).join() !== 'onnx-minilm|Xenova/multilingual-e5-small|384') throw new Error('incompatible-local-corpus');
    const response = await fetch(new URL('/search', endpoint), { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(6000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ query: (query.query || '').slice(0, 2000), classLevel: query.classLevel, subject: query.subject, ...(query.chapterId ? { chapterId: query.chapterId } : {}), topK: 24 }) });
    if (!response.ok || !response.body) throw new Error('service-unavailable');
    const reader = response.body.getReader(); const parts: Uint8Array[] = []; let bytes = 0;
    while (true) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; if (bytes > 32768) { await reader.cancel(); throw new Error('oversized-response'); } parts.push(item.value); }
    const result = schema.parse(JSON.parse(Buffer.concat(parts).toString('utf8')));
    if (result.corpusFingerprint !== manifest.artifactFingerprint || result.vectorSha256 !== manifest.optionalVectorArtifact.uncompressedSha256) throw new Error('release-mismatch');
    Object.assign(state, { checkedAt: new Date().toISOString(), available: true, reason: 'ready', latencyMs: Date.now() - started });
    return result.hits;
  } catch (error) {
    Object.assign(state, { checkedAt: new Date().toISOString(), available: false, reason: error instanceof Error && /^[a-z-]+$/.test(error.message) ? error.message : 'remote-retrieval-unavailable', latencyMs: Date.now() - started });
    return [];
  }
}

type TrustedChunk = Omit<ContextSnippet, 'relevanceScore' | 'chapterId'> & { chapterId?: string | null };
/** A remote service selects IDs only. Text, source paths and scope come from pinned local artifacts. */
export function resolveRemoteHits(hits: RemoteHit[], query: ContextQuery, chunks: ReadonlyArray<TrustedChunk>): ContextSnippet[] {
  const ids = new Map(chunks.map((chunk) => [chunk.id, chunk])); const seen = new Set<string>(); const result: ContextSnippet[] = [];
  const subject = (level: number, value: string) => level === 10 && ['Science', 'Chemistry', 'Physics', 'Biology'].includes(value) ? 'Science' : value;
  for (const hit of hits) {
    const chunk = ids.get(hit.id);
    if (!chunk || seen.has(hit.id) || chunk.classLevel !== query.classLevel || subject(chunk.classLevel, chunk.subject) !== subject(query.classLevel, query.subject) || (query.chapterId && chunk.chapterId !== query.chapterId)) continue;
    seen.add(hit.id);
    result.push({ ...chunk, chapterId: chunk.chapterId || undefined, relevanceScore: Math.max(0, hit.score) * 40 });
  }
  return result;
}
