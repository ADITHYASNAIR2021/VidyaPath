import { expect, it } from 'vitest';
import { getContextPack } from '@/lib/ai/context-retriever';
import { getRemoteRetrievalStatus } from '@/lib/ai/remote-retrieval';

it.skipIf(process.env.RUN_REMOTE_RETRIEVAL_INTEGRATION !== '1')('uses the actual private E5 service and resolves only pinned chapter evidence', async () => {
  const pack = await getContextPack({ task: 'chat', classLevel: 10, subject: 'Chemistry', chapterId: 'c10-chem-2', query: 'Explain acids bases pH and salts', topK: 6 });
  expect(getRemoteRetrievalStatus().available).toBe(true);
  expect(pack.retrievalMeta?.strategies).toContain('remote-e5-index');
  expect(pack.usedRemoteIndex).toBe(true);
  expect(pack.snippets.length).toBeGreaterThan(0);
  expect(pack.snippets.every((row) => row.chapterId === 'c10-chem-2')).toBe(true);
}, 60000);
