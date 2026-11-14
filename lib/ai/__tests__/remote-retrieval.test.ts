import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/runtime/shared-state', () => ({ sharedState: (_key: string, factory: () => unknown) => factory() }));
vi.mock('@/lib/ai/retrieval-report', () => ({ readRetrievalReport: async () => ({ artifactFingerprint: 'a'.repeat(64), optionalVectorArtifact: { uncompressedSha256: 'b'.repeat(64) }, totals: { vectorModels: { 'onnx-minilm|Xenova/multilingual-e5-small|384': 1 } } }) }));
import { searchRemoteIndex, resolveRemoteHits } from '@/lib/ai/remote-retrieval';
const query = { task: 'chat' as const, classLevel: 10, subject: 'Science', chapterId: 'c10-chem-2', query: 'What is pH?' };
const response = () => ({ model: 'Xenova/multilingual-e5-small', dimensions: 384, corpusFingerprint: 'a'.repeat(64), vectorSha256: 'b'.repeat(64), hits: [{ id: 'acid', score: 0.9 }] });
beforeEach(() => { vi.stubEnv('AI_VECTOR_BACKEND', 'remote'); vi.stubEnv('RETRIEVAL_SERVICE_URL', 'https://retrieval.example.com'); vi.stubEnv('RETRIEVAL_SERVICE_KEY', 'fixture-'.repeat(5)); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('private semantic retrieval client', () => {
  it('sends only a bounded query/scope and server-side authorization', async () => {
    const network = vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json(response())); vi.stubGlobal('fetch', network);
    expect(await searchRemoteIndex(query)).toEqual(response().hits);
    expect(JSON.parse(String(network.mock.calls[0][1]?.body))).toEqual({ query: 'What is pH?', classLevel: 10, subject: 'Science', chapterId: 'c10-chem-2', topK: 24 });
    expect(network.mock.calls[0][1]?.redirect).toBe('error');
  });
  it('never makes remote calls for local-only diagnostics', async () => {
    const network = vi.fn(); vi.stubGlobal('fetch', network);
    expect(await searchRemoteIndex({ ...query, localOnly: true })).toEqual([]); expect(network).not.toHaveBeenCalled();
  });
  it('refuses unencrypted remote endpoints', async () => {
    vi.stubEnv('RETRIEVAL_SERVICE_URL', 'http://retrieval.example.com'); const network = vi.fn(); vi.stubGlobal('fetch', network);
    expect(await searchRemoteIndex(query)).toEqual([]); expect(network).not.toHaveBeenCalled();
  });
  it('rejects a stale corpus or vector release instead of mixing model spaces', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ ...response(), vectorSha256: 'c'.repeat(64) }));
    expect(await searchRemoteIndex(query)).toEqual([]);
  });
  it('falls back on service errors and oversized responses', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 503 })); expect(await searchRemoteIndex(query)).toEqual([]);
    vi.stubGlobal('fetch', async () => new Response('x'.repeat(33000))); expect(await searchRemoteIndex(query)).toEqual([]);
  });
  it('never accepts remote passage text or source paths', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ ...response(), hits: [{ id: 'acid', score: 0.9, text: 'poisoned remote evidence' }] }));
    expect(await searchRemoteIndex(query)).toEqual([]);
  });
  it('resolves IDs only from trusted, scope-matching local chunks', () => {
    const base = { id: 'acid', text: 'Actual NCERT acid passage', sourcePath: 'ncert/acids.pdf', classLevel: 10, subject: 'Chemistry', chapterId: 'c10-chem-2' };
    const chunks = [base, { ...base, id: 'other', chapterId: 'c10-chem-1' }, { ...base, id: 'class12', classLevel: 12 }];
    const snippets = resolveRemoteHits(['acid', 'acid', 'unknown', 'other', 'class12'].map((id) => ({ id, score: 0.9 })), query, chunks);
    expect(snippets).toHaveLength(1); expect(snippets[0].text).toBe(base.text); expect(snippets[0].sourcePath).toBe(base.sourcePath);
  });
});
