import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { loadIndex, createRetrievalServer } from './server.mjs';
import { loadEncoder } from './encoder.mjs';

const started = performance.now();
if (!process.env.RETRIEVAL_DATA_DIR) throw new Error('Set RETRIEVAL_DATA_DIR to the exported release');
const index = loadIndex(process.env.RETRIEVAL_DATA_DIR);
const encode = await loadEncoder();
await encode('academic retrieval startup check');
const key = randomBytes(32).toString('hex');
const server = createRetrievalServer(index, encode, key); server.listen(0, '127.0.0.1'); await once(server, 'listening');
try {
  const beforeQuery = performance.now();
  const response = await fetch(`http://127.0.0.1:${server.address().port}/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ query: 'Explain acids bases pH and salts', classLevel: 10, subject: 'Science', chapterId: 'c10-chem-2', topK: 6 }) });
  const result = await response.json();
  if (!response.ok || !result.hits?.length || result.corpusFingerprint !== index.manifest.corpusFingerprint || !result.hits.every((hit) => index.rows.some((row) => row.id === hit.id && row.chapterId === 'c10-chem-2'))) throw new Error('Semantic smoke check failed');
  console.log(JSON.stringify({ model: result.model, documents: index.rows.length, matched: result.hits.length, queryMs: Math.round(performance.now() - beforeQuery), totalMs: Math.round(performance.now() - started), peakRssMiB: Math.round(process.memoryUsage().rss / 1048576), corpusMatched: true, inferenceApiCalls: 0 }));
} finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
