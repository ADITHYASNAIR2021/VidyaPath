#!/usr/bin/env node
/** Keep only vectors whose chunk IDs still exist in the sanitized corpus. */
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

const root = process.cwd();
const contextDir = path.join(root, 'lib', 'context');
const chunkFiles = ['chunks.jsonl', 'textbook_chunks.jsonl'];
const vectorPath = path.join(contextDir, 'chunk_vectors.jsonl');

const liveIds = new Set();
for (const filename of chunkFiles) {
  const filePath = path.join(contextDir, filename);
  if (!fs.existsSync(filePath)) continue;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const chunk = JSON.parse(line);
      if (chunk?.id) liveIds.add(String(chunk.id));
    } catch {
      // Malformed chunks are not eligible for vector retrieval.
    }
  }
}

if (!fs.existsSync(vectorPath)) {
  throw new Error(`Missing vector index: ${vectorPath}`);
}

const tmpPath = `${vectorPath}.tmp`;
const output = fs.createWriteStream(tmpPath, { encoding: 'utf8' });
const seen = new Set();
let input = 0;
let kept = 0;
let malformed = 0;

const lines = readline.createInterface({
  input: fs.createReadStream(vectorPath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

for await (const line of lines) {
  if (!line.trim()) continue;
  input += 1;
  try {
    const vector = JSON.parse(line);
    const id = String(vector?.id ?? '');
    if (!id || !liveIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    output.write(`${JSON.stringify(vector)}\n`);
    kept += 1;
  } catch {
    malformed += 1;
  }
}

await new Promise((resolve, reject) => {
  output.end(resolve);
  output.on('error', reject);
});

fs.renameSync(tmpPath, vectorPath);
const missing = [...liveIds].filter((id) => !seen.has(id)).length;
console.log(`[filter-vectors] liveChunks=${liveIds.size} input=${input} kept=${kept} removed=${input - kept} malformed=${malformed} missingVectors=${missing}`);
if (missing > 0) {
  console.warn('[filter-vectors] Some live chunks have no vector; lexical retrieval remains available. Run build:vectors to fill them.');
}
