import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { gunzipSync } from 'node:zlib';

const apply = process.argv.includes('--apply');
const argument = process.argv.indexOf('--corpus');
const corpusId = argument >= 0 ? process.argv[argument + 1] : '';
if (!/^[A-Za-z0-9._-]{1,80}$/.test(corpusId)) throw new Error('Use --corpus <new-immutable-release-id>. Default is a local dry run; --apply writes the new release.');
const chunks = new Map();
for (const file of ['chunks.jsonl', 'textbook_chunks.jsonl']) {
  let payload;
  try { payload = readFileSync(`lib/context/${file}`, 'utf8'); } catch { payload = gunzipSync(readFileSync(`lib/context/${file}.gz`)).toString('utf8'); }
  for (const line of payload.split('\n').filter(Boolean)) {
    const chunk = JSON.parse(line);
    if ([10, 12].includes(chunk.classLevel) && chunk.text?.length >= 180 && chunk.text.length <= 12000 && chunk.sourcePath?.length <= 1024) chunks.set(chunk.id, chunk);
  }
}
let metadata = null;
let accepted = 0;
const seen = new Set();
async function* vectors() {
  for await (const line of createInterface({ input: createReadStream('lib/context/chunk_vectors.jsonl'), crlfDelay: Infinity })) {
    if (line.trim()) yield JSON.parse(line);
  }
}
// Validate the entire vector space before any external write.
for await (const vector of vectors()) {
  if (!chunks.has(vector.id)) continue;
  if (seen.has(vector.id)) throw new Error(`Duplicate vector ID: ${vector.id}`);
  seen.add(vector.id);
  const next = { embedding_model: vector.embeddingModel, embedding_kind: vector.embeddingKind, dimensions: vector.embedding?.length };
  if (!((next.embedding_kind === 'onnx-minilm' && next.dimensions === 384) || (next.embedding_kind === 'nvidia-e5' && next.dimensions === 2048)) || !vector.embedding.every(Number.isFinite)) throw new Error('Invalid or unsupported semantic vectors. Lexical hashes are not accepted.');
  if (!metadata) metadata = next;
  if (JSON.stringify(metadata) !== JSON.stringify(next)) throw new Error('Mixed embedding models or dimensions. Rebuild one complete vector space.');
  accepted++;
}
if (!metadata || !accepted) throw new Error('No usable document/vector pairs');
console.log(JSON.stringify({ mode: apply ? 'apply-new-release' : 'dry-run', corpusId, vectors: accepted, sourceChunks: chunks.size, missingVectors: chunks.size - accepted, ...metadata }, null, 2));
if (!apply) { console.log('No network requests or database writes were made. Add --apply after applying the optional SQL migration.'); process.exit(0); }
const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key || new URL(base).protocol !== 'https:') throw new Error('Server-only SUPABASE_URL (HTTPS) and SUPABASE_SERVICE_ROLE_KEY are required');
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
async function request(table, method, body) {
  const response = await fetch(`${base}/rest/v1/${table}`, { method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Vector release write failed with HTTP ${response.status}. The release remains unready; no existing corpus was replaced.`);
}
// No upsert: a reused release ID fails instead of mutating a live corpus.
await request('rag_corpora', 'POST', { id: corpusId, ...metadata, ready: false, chunk_count: 0 });
let batch = [];
let written = 0;
for await (const vector of vectors()) {
  const chunk = chunks.get(vector.id);
  if (!chunk) continue;
  batch.push({ corpus_id: corpusId, chunk_id: chunk.id, content: chunk.text, source_path: chunk.sourcePath, source_type: chunk.sourceType || 'paper', class_level: chunk.classLevel, subject: chunk.subject, chapter_id: chunk.chapterId || null, page: chunk.page || null, year: chunk.year || null, dimensions: metadata.dimensions, embedding: vector.embedding });
  if (batch.length >= 64) { await request('rag_document_chunks', 'POST', batch); written += batch.length; batch = []; }
}
if (batch.length) { await request('rag_document_chunks', 'POST', batch); written += batch.length; }
if (written !== accepted) throw new Error('Incomplete release; corpus remains unready');
await request(`rag_corpora?id=eq.${encodeURIComponent(corpusId)}`, 'PATCH', { ready: true, chunk_count: written });
console.log(`New corpus is ready. To activate on the server: AI_VECTOR_BACKEND=supabase and RAG_VECTOR_CORPUS_ID=${corpusId}. No deployment settings were changed.`);
