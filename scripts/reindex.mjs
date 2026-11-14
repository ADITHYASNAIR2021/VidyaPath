import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const flags = new Set(process.argv.slice(2));
const run = flags.has('--apply');
const steps = [];
if (flags.has('--reextract')) {
  steps.push(['scripts/run_python.mjs', 'scripts/build_context_index.py', '--max-files', '0', '--max-pages', '100']);
  steps.push(['scripts/run_python.mjs', 'scripts/build_textbook_index.py', '--merge-main-index']);
}
// Extraction replaces metadata, so repair the newly extracted corpus afterwards.
if (flags.has('--repair-metadata')) steps.push(['scripts/run_python.mjs', 'scripts/repair_textbook_mapping.py', '--apply']);
steps.push(['scripts/build_retrieval_index.mjs']);
if (flags.has('--vectors')) steps.push(['scripts/build_vector_index.mjs']);
steps.push(['scripts/compress_context.mjs'], ['scripts/write_rag_count.mjs'], ['scripts/generate_retrieval_report.mjs'], ['scripts/check_context_deploy.mjs']);
console.log('Local corpus rebuild plan (no dataset download, publish, upload or database writes; optional vector build may download model weights):');
for (const args of steps) console.log(`  node ${args.join(' ')}`);
console.log('  npm run eval:rag:report');
if (!run) { console.log('Dry run. Add --apply to execute; --repair-metadata fixes existing chapter labels, --reextract parses all local PDFs, --vectors rebuilds free local embeddings.'); process.exit(0); }
const directory = path.resolve('lib/context');
const backup = path.resolve('.cache', `rag-backup-${Date.now()}`);
mkdirSync(backup, { recursive: true });
const files = ['chunks.jsonl', 'textbook_chunks.jsonl', 'textbook_image_manifest.json', 'chapter_index.json', 'textbook_chapter_index.json', 'retrieval_index.json', 'chunk_vectors.jsonl', 'retrieval_manifest.json', '.rag_count.json'];
const saved = [];
for (const file of files.flatMap((file) => [file, `${file}.gz`])) {
  const source = path.join(directory, file);
  if (existsSync(source)) { copyFileSync(source, path.join(backup, file)); saved.push(file); }
}
// Offline defaults never consume hosted OCR or embedding credits.
const environment = { ...process.env, NVIDIA_API_KEY: '', GEMINI_API_KEY: '', GROQ_API_KEY: '', VECTOR_PROVIDER: 'local' };
for (const args of steps) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', shell: false, env: environment });
  if (result.status !== 0 || result.error) {
    for (const file of saved) copyFileSync(path.join(backup, file), path.join(directory, file));
    console.error(`Rebuild failed. Previous artifacts restored from ${backup}. Nothing was published.`);
    process.exit(1);
  }
}
console.log(`Artifact checks passed. Backup: ${backup}. Run npm run eval:rag:report before committing or publishing.`);
