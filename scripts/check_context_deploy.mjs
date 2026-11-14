import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Read exactly the files included in serverless deployments, even when large
// uncompressed development artifacts are available locally.
const directory = path.join(process.cwd(), 'lib', 'context');
function read(file) {
  const raw = readFileSync(path.join(directory, file));
  return (file.endsWith('.gz') ? gunzipSync(raw, { maxOutputLength: 256 * 1024 * 1024 }) : raw).toString('utf8');
}
const mainChunks = read('chunks.jsonl.gz').trim().split('\n').map((line) => JSON.parse(line));
const papers = mainChunks.filter((chunk) => !chunk.sourceType || chunk.sourceType === 'paper');
const textbooks = read('textbook_chunks.jsonl.gz').trim().split('\n').map((line) => JSON.parse(line));
for (const [name, corpus] of [['papers', papers], ['textbooks', textbooks]]) {
  for (const level of [10, 12]) {
    if (!corpus.some((chunk) => chunk.classLevel === level && chunk.text?.length >= 180)) {
      throw new Error(`Deployment corpus has no usable Class ${level} ${name}. Rebuild the index.`);
    }
  }
}
const index = JSON.parse(read('retrieval_index.json.gz'));
if (!index.docs?.length || !index.idf || !index.chapters) throw new Error('Invalid deployment retrieval index');
const sourceIds = new Set([...mainChunks, ...textbooks].map((chunk) => chunk.id));
const missing = index.docs.filter((doc) => doc.kind === 'chunk' && !sourceIds.has(doc.chunkId));
if (missing.length) throw new Error(`${missing.length} indexed chunks are missing from the deployment corpus`);
for (const file of ['chunks.jsonl', 'textbook_chunks.jsonl', 'retrieval_index.json']) {
  const rawPath = path.join(directory, file);
  if (existsSync(rawPath) && readFileSync(rawPath, 'utf8') !== read(`${file}.gz`)) {
    throw new Error(`${file}.gz is stale. Run npm run compress:context before deploying.`);
  }
}
console.log(`[context-deploy] PASS: ${sourceIds.size} unique chunks (${papers.length} paper, ${textbooks.length} textbook), ${index.docs.length} retrieval documents`);
const manifest = JSON.parse(read('retrieval_manifest.json'));
for (const artifact of manifest.artifacts) {
  const digest = createHash('sha256').update(readFileSync(path.join(directory, artifact.file))).digest('hex');
  if (digest !== artifact.sha256) throw new Error(`Deployment manifest mismatch: ${artifact.file}. Regenerate the retrieval report.`);
}
console.log(`[context-deploy] Manifest integrity verified: ${manifest.artifactFingerprint.slice(0, 12)}`);
