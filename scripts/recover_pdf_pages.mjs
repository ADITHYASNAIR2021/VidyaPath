import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync, appendFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const planIndex = args.indexOf('--plan');
if (planIndex < 0 || !args[planIndex + 1]) throw new Error('Use --plan <JSON file of sourcePath/page entries>; --apply executes after a dry run.');
const extraction = spawnSync(process.execPath, ['scripts/run_python.mjs', 'scripts/recover_pdf_pages.py', args[planIndex + 1]], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (extraction.status !== 0) throw new Error(`Recovery extraction failed: ${extraction.stderr}`);
const extracted = JSON.parse(extraction.stdout);
const directory = path.resolve('lib/context');
const books = readFileSync(path.join(directory, 'textbook_chunks.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const known = new Map(books.map((row) => [row.id, row.text]));
const pending = extracted.chunks.filter((row) => {
  if (known.has(row.id) && known.get(row.id) !== row.text) throw new Error('Recovery ID conflict');
  if (known.has(row.id)) return false;
  known.set(row.id, row.text);
  return true;
});
console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'dry-run', pages: extracted.pages, newChunks: pending.length, existingChunksPreserved: true }, null, 2));
if (!pending.length || !args.includes('--apply')) process.exit(0);
const manifest = JSON.parse(readFileSync(path.join(directory, 'retrieval_manifest.json'), 'utf8'));
const spaces = Object.keys(manifest.totals.vectorModels);
if (spaces.length !== 1 || !/^onnx-minilm\|Xenova\/(multilingual-e5-small|all-MiniLM-L6-v2)\|384$/.test(spaces[0])) throw new Error('Recovery only supports an existing complete matching local 384-dimension corpus.');
if (manifest.totals.vectorMissingChunks || manifest.totals.invalidVectors || manifest.totals.orphanVectors) throw new Error('Validate the existing vector corpus before adding recovered pages.');
const model = spaces[0].split('|')[1];
const digest = createHash('sha256');
for await (const bytes of createReadStream(path.join(directory, 'chunk_vectors.jsonl'))) digest.update(bytes);
if (digest.digest('hex') !== manifest.optionalVectorArtifact?.uncompressedSha256) throw new Error('Vector file changed; refresh/validate the report first.');
const { pipeline, env } = await import('@huggingface/transformers');
env.cacheDir = path.resolve('.cache/embeddings'); env.allowLocalModels = true; env.allowRemoteModels = false;
const encode = await pipeline('feature-extraction', model, { dtype: /e5/i.test(model) ? 'q8' : 'fp32', local_files_only: true });
const vectors = [];
for (const row of pending) {
  const output = await encode(`${/e5/i.test(model) ? 'passage: ' : ''}${row.text}`, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data);
  if (embedding.length !== 384 || !embedding.every(Number.isFinite)) throw new Error('Invalid recovered vector; no corpus writes made');
  vectors.push({ id: row.id, embeddingKind: 'onnx-minilm', embeddingModel: model, embedding });
}
const files = ['chunks.jsonl', 'textbook_chunks.jsonl', 'chunk_vectors.jsonl', 'chapter_index.json', 'textbook_chapter_index.json', 'retrieval_index.json', 'retrieval_manifest.json', '.rag_count.json'];
const backup = path.resolve('.cache', `page-recovery-backup-${Date.now()}`); mkdirSync(backup, { recursive: true });
const saved = files.flatMap((file) => [file, file + '.gz']).filter((file) => existsSync(path.join(directory, file)));
for (const file of saved) copyFileSync(path.join(directory, file), path.join(backup, file));
try {
  const chunkLines = pending.map((row) => JSON.stringify(row)).join('\n') + '\n';
  appendFileSync(path.join(directory, 'chunks.jsonl'), chunkLines);
  appendFileSync(path.join(directory, 'textbook_chunks.jsonl'), chunkLines);
  appendFileSync(path.join(directory, 'chunk_vectors.jsonl'), vectors.map((row) => JSON.stringify(row)).join('\n') + '\n');
  const indexFile = path.join(directory, 'textbook_chapter_index.json');
  const index = JSON.parse(readFileSync(indexFile, 'utf8')); index.totalChunks = books.length + pending.length; index.generatedAt = new Date().toISOString();
  for (const row of pending) if (row.chapterId) (index.chunksByChapter[row.chapterId] ??= []).push(row.id);
  writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
  const mainFile = path.join(directory, 'chapter_index.json'); const main = JSON.parse(readFileSync(mainFile, 'utf8'));
  main.stats.textbookChunksMerged = index.totalChunks; main.generatedAt = new Date().toISOString();
  writeFileSync(mainFile, JSON.stringify(main, null, 2) + '\n');
  for (const script of ['build_retrieval_index.mjs', 'compress_context.mjs', 'write_rag_count.mjs', 'generate_retrieval_report.mjs', 'check_context_deploy.mjs']) {
    if (spawnSync(process.execPath, ['scripts/' + script], { stdio: 'inherit' }).status !== 0) throw new Error(`Recovery finalization failed: ${script}`);
  }
  console.log(`Recovered ${pending.length} chunks using cached ${model}; original vectors preserved. Backup: ${backup}. Run npm run eval:rag:report.`);
} catch (error) {
  for (const file of saved) copyFileSync(path.join(backup, file), path.join(directory, file));
  throw error;
}
