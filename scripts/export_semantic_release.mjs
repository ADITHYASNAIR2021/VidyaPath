import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, writeSync, renameSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const root = process.cwd();
const context = path.join(root, 'lib/context');
const manifest = JSON.parse(readFileSync(path.join(context, 'retrieval_manifest.json'), 'utf8'));
const space = Object.keys(manifest.totals.vectorModels);
if (space.length !== 1 || space[0] !== 'onnx-minilm|Xenova/multilingual-e5-small|384') throw new Error('Export requires one complete multilingual E5 Small vector space.');
if (manifest.totals.vectorMissingChunks || manifest.totals.invalidVectors || manifest.totals.orphanVectors || manifest.totals.conflictingChunkIds) throw new Error('Fix corpus integrity before export.');
const vectorSha256 = manifest.optionalVectorArtifact?.uncompressedSha256;
if (!/^[a-f0-9]{64}$/.test(vectorSha256 || '')) throw new Error('Missing pinned vector digest');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const releaseId = sha(`${manifest.artifactFingerprint}:${vectorSha256}`).slice(0, 24);
const base = path.join(root, '.cache/semantic-releases');
const output = path.join(base, releaseId);
console.log(JSON.stringify({ releaseId, corpusFingerprint: manifest.artifactFingerprint, vectors: manifest.totals.vectorCount, model: 'Xenova/multilingual-e5-small', dimensions: 384, output, mode: process.argv.includes('--apply') ? 'export' : 'dry-run' }, null, 2));
if (!process.argv.includes('--apply')) { console.log('Add --apply to export. No upload, inference or re-embedding is performed.'); process.exit(0); }
if (existsSync(output)) {
  const saved = JSON.parse(readFileSync(path.join(output, 'semantic_manifest.json'), 'utf8'));
  if (saved.corpusFingerprint !== manifest.artifactFingerprint || saved.vectorSha256 !== vectorSha256) throw new Error('Existing release differs');
  for (const file of saved.files) if (sha(readFileSync(path.join(output, file.name))) !== file.sha256) throw new Error('Existing release is corrupt');
  console.log('Existing immutable release verified; nothing overwritten.'); process.exit(0);
}
const chunks = new Map();
for (const file of ['chunks.jsonl.gz', 'textbook_chunks.jsonl.gz']) {
  const bytes = readFileSync(path.join(context, file));
  const pinned = manifest.artifacts.find((row) => row.file === file);
  if (!pinned || sha(bytes) !== pinned.sha256) throw new Error(`Stale corpus: ${file}`);
  for (const line of gunzipSync(bytes, { maxOutputLength: 256 * 1024 * 1024 }).toString('utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line); chunks.set(row.id, row);
  }
}
const temporary = path.join(base, `staging-${randomUUID()}`); mkdirSync(temporary, { recursive: true });
const indexPath = path.join(temporary, 'vectors.f32');
const fd = openSync(indexPath, 'wx');
const rows = [], seen = new Set(), digest = createHash('sha256');
const stream = createReadStream(path.join(context, 'chunk_vectors.jsonl')); stream.on('data', (bytes) => digest.update(bytes));
try {
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    const vector = JSON.parse(line), chunk = chunks.get(vector.id);
    if (!chunk || seen.has(vector.id) || vector.embeddingModel !== 'Xenova/multilingual-e5-small' || vector.embeddingKind !== 'onnx-minilm' || vector.embedding?.length !== 384 || !vector.embedding.every(Number.isFinite)) throw new Error('Invalid, duplicate or mismatched vector');
    const norm = Math.sqrt(vector.embedding.reduce((sum, value) => sum + value * value, 0));
    if (norm < 0.9 || norm > 1.1) throw new Error('Expected normalized E5 document vectors');
    const bytes = Buffer.allocUnsafe(384 * 4);
    vector.embedding.forEach((value, index) => bytes.writeFloatLE(value / norm, index * 4));
    writeSync(fd, bytes); seen.add(vector.id);
    rows.push({ id: chunk.id, classLevel: chunk.classLevel, subject: chunk.subject, chapterId: chunk.chapterId || null });
  }
} finally { closeSync(fd); }
if (digest.digest('hex') !== vectorSha256 || rows.length !== chunks.size) throw new Error('Vector digest/count mismatch; incomplete staging release was not published');
writeFileSync(path.join(temporary, 'rows.json'), JSON.stringify(rows));
const release = { version: 1, releaseId, corpusFingerprint: manifest.artifactFingerprint, vectorSha256, model: 'Xenova/multilingual-e5-small', dimensions: 384, count: rows.length,
  chapters: manifest.chapters.map(({ id, classLevel, subject }) => ({ id, classLevel, subject })),
  files: ['vectors.f32', 'rows.json'].map((name) => { const bytes = readFileSync(path.join(temporary, name)); return { name, bytes: bytes.length, sha256: sha(bytes) }; }) };
writeFileSync(path.join(temporary, 'semantic_manifest.json'), JSON.stringify(release, null, 2) + '\n');
renameSync(temporary, output);
console.log(`Semantic release ready: ${output}. Upload only this release directory to the retrieval host. Source text stays with the web app.`);
