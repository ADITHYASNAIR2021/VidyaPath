import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import deployment from '../config/context-deployment.cjs';

// Next's exclude-glob resolution uses Windows backslashes as picomatch escapes.
// Apply the same offline-only exclusions to normalized paths after every build.
// Explicitly finalize the six approved corpus paths as well: Next/Vercel tracing
// can omit dynamic fs reads even when includes are configured. The separate
// verifier still rejects missing files, missing functions and oversized traces.
const root = process.cwd();
const appRoot = path.join(root, '.next/server/app');
const corpusEntries = new Set(deployment.corpusTraceEntries);
for (const file of deployment.corpusFiles) {
  const target = path.join(root, file);
  if (!existsSync(target) || !statSync(target).isFile()) throw new Error(`Missing deployment corpus on disk: ${file}`);
}
for (const entry of corpusEntries) {
  if (!existsSync(path.join(appRoot, entry))) throw new Error(`Missing retrieval function trace: ${entry}`);
}
const excluded = /^(?:(?:\.cache|\.git|dataset|services|scripts)\/|\.env[^/]*(?:$|\/)|lib\/runtime\/[^/]+\.json$|node_modules\/(?:@huggingface\/transformers|onnxruntime-common|onnxruntime-node)\/|lib\/context\/images\/|lib\/context\/(?:chunks\.jsonl|textbook_chunks\.jsonl|retrieval_index\.json|chunk_vectors\.jsonl(?:\.gz)?|(?:paper|textbook)_image_manifest\.json|rag_pipeline_report\.json|\.rag_count\.json)$)/;
let removed = 0, traces = 0, added = 0;
const updates = [];
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith('.nft.json')) {
      const trace = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(trace.files) || trace.files.some((item) => typeof item !== 'string')) throw new Error(`Invalid build trace: ${file}`);
      const files = trace.files.filter((item) => !excluded.test(path.relative(root, path.resolve(directory, item)).replaceAll('\\', '/')));
      removed += trace.files.length - files.length; traces++;
      if (corpusEntries.has(path.relative(appRoot, file).replaceAll('\\', '/'))) {
        const present = new Set(files.map((item) => path.resolve(directory, item)));
        for (const corpus of deployment.corpusFiles) {
          const absolute = path.join(root, corpus);
          if (!present.has(absolute)) {
            files.push(path.relative(directory, absolute).replaceAll('\\', '/'));
            present.add(absolute); added++;
          }
        }
      }
      if (JSON.stringify(files) !== JSON.stringify(trace.files)) updates.push([file, JSON.stringify({ ...trace, files })]);
    }
  }
}
visit(path.join(root, '.next', 'server'));
for (const [file, content] of updates) writeFileSync(file, content);
console.log(`[function-traces] Checked ${traces} traces; removed ${removed} offline/private references; added ${added} approved corpus references.`);
