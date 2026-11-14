import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getContextPack, getRetrievalStats } from '@/lib/ai/context-retriever';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('deployed retrieval corpus', () => {
  it('retrieves the reported chemistry chapter from shipped files without calling any AI provider', async () => {
    const original = fs.readFile.bind(fs);
    vi.spyOn(fs, 'readFile').mockImplementation((async (file: Parameters<typeof fs.readFile>[0], ...args: unknown[]) => {
      const name = String(file).replaceAll('\\', '/');
      if (/\/(chunks\.jsonl|textbook_chunks\.jsonl|retrieval_index\.json|chunk_vectors\.jsonl(?:\.gz)?)$/.test(name)) {
        throw Object.assign(new Error('Not shipped'), { code: 'ENOENT' });
      }
      return Reflect.apply(original, fs, [file, ...args]);
    }) as typeof fs.readFile);
    const network = vi.fn(() => { throw new Error('Diagnostics must not use the network'); });
    vi.stubGlobal('fetch', network);
    vi.stubEnv('CONTEXT_CDN_URL', '');
    vi.stubEnv('NVIDIA_API_KEY', 'nvapi-test-key');
    vi.stubEnv('AI_ENABLE_RETRIEVAL_LLM', '1');
    const result = await getContextPack({
      localOnly: true, task: 'chat', classLevel: 10, subject: 'Chemistry',
      chapterId: 'c10-chem-2', query: 'Explain acids bases pH and salts', topK: 6,
    });
    expect(result.snippets.length).toBeGreaterThan(0);
    expect(result.snippets.some((snippet) => snippet.chapterId === 'c10-chem-2')).toBe(true);
    expect(result.snippets[0].text.toLowerCase()).toMatch(/\bacid(?:s|ic)?\b/);
    expect(result.snippets[0].text.toLowerCase()).toMatch(/\bph\b/);
    expect(result.snippets.every((snippet) => !snippet.text.startsWith('Source paper:'))).toBe(true);
    expect(getRetrievalStats().chapterCount).toBeGreaterThan(100);
    expect(network).not.toHaveBeenCalled();
  }, 30000);

  it('does not use unmapped subject material to claim coverage of a missing canonical chapter', async () => {
    const result = await getContextPack({ localOnly: true, task: 'chat', classLevel: 10, subject: 'English Core', chapterId: 'c10-eng-6', query: 'Explain The Proposal and the characters Lomov and Natalya.' });
    expect(result.snippets).toEqual([]);
    expect(result.retrievalMeta?.confidence).toBe(0);
  });

  it('reports an empty result for an unavailable subject instead of fabricating grounding', async () => {
    const result = await getContextPack({ localOnly: true, task: 'chat', classLevel: 10, subject: 'Unavailable subject', query: 'missing corpus' });
    expect(result.snippets).toEqual([]);
    expect(result.retrievalMeta?.confidence).toBe(0);
    expect(result.usedOnDemandFallback).toBe(false);
  });
});
