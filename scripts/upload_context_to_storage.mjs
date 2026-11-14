import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const bucketIndex = args.indexOf('--bucket');
const bucket = bucketIndex >= 0 ? args[bucketIndex + 1] : 'context';
if (!/^[a-z0-9_-]{1,63}$/.test(bucket)) throw new Error('Invalid bucket name');
const directory = path.resolve('lib/context');
const manifest = JSON.parse(readFileSync(path.join(directory, 'retrieval_manifest.json'), 'utf8'));
const allowed = new Set(['chunks.jsonl.gz', 'textbook_chunks.jsonl.gz', 'retrieval_index.json.gz', 'chapter_index.json.gz', 'textbook_chapter_index.json.gz']);
if (!/^[a-f0-9]{64}$/.test(manifest.artifactFingerprint)) throw new Error('Invalid corpus fingerprint');
const release = `releases/${manifest.artifactFingerprint}`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const files = manifest.artifacts.map((artifact) => {
  if (!allowed.has(artifact.file)) throw new Error('Unexpected artifact in release manifest');
  const bytes = readFileSync(path.join(directory, artifact.file));
  if (hash(bytes) !== artifact.sha256) throw new Error(`Stale release manifest: ${artifact.file}`);
  return { file: artifact.file, bytes };
});
// Manifest is the commit marker and is always uploaded last.
files.push({ file: 'retrieval_manifest.json', bytes: readFileSync(path.join(directory, 'retrieval_manifest.json')) });
console.log(`Release ${release}: ${files.length} files, ${(files.reduce((sum, file) => sum + file.bytes.length, 0) / 1048576).toFixed(1)} MB`);
if (!apply) { console.log('Dry run: no upload or external write. Use node --env-file=.env.local scripts/upload_context_to_storage.mjs --apply after creating a public academic-corpus bucket. Never upload student answers/images.'); process.exit(0); }
const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || new URL(base).protocol !== 'https:' || !key) throw new Error('Server-only SUPABASE_URL (HTTPS) and SUPABASE_SERVICE_ROLE_KEY are required');
for (const { file, bytes } of files) {
  const object = `${bucket}/${release}/${file}`;
  const response = await fetch(`${base}/storage/v1/object/${object}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': file.endsWith('.gz') ? 'application/gzip' : 'application/json', 'cache-control': '31536000', 'x-upsert': 'false' }, body: bytes, signal: AbortSignal.timeout(60000) });
  if (!response.ok) {
    // Existing immutable releases may be retried only when bytes are identical.
    if ([400, 409].includes(response.status)) {
      const existing = await fetch(`${base}/storage/v1/object/public/${object}`, { signal: AbortSignal.timeout(30000) });
      if (existing.ok && hash(Buffer.from(await existing.arrayBuffer())) === hash(bytes)) { console.log(`Already verified: ${file}`); continue; }
    }
    throw new Error(`Upload failed for ${file}: HTTP ${response.status}. Release not activated; no objects overwritten.`);
  }
  console.log(`Uploaded: ${file}`);
}
console.log(`Release uploaded. Pin this URL in the deployment together with the same manifest: CONTEXT_CDN_URL=${base}/storage/v1/object/public/${bucket}/${release}`);
