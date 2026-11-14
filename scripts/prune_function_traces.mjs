import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Next's exclude-glob resolution uses Windows backslashes as picomatch escapes.
// Apply the same offline-only exclusions to normalized paths after every build.
// Never remove application code, node dependencies other than optional ONNX, or
// the six pinned deployment artifacts. The separate size gate checks the result.
const root = process.cwd();
const excluded = /^(?:(?:\.cache|\.git|dataset|services|scripts)\/|\.env[^/]*(?:$|\/)|lib\/runtime\/[^/]+\.json$|node_modules\/(?:@huggingface\/transformers|onnxruntime-common|onnxruntime-node)\/|lib\/context\/images\/|lib\/context\/(?:chunks\.jsonl|textbook_chunks\.jsonl|retrieval_index\.json|chunk_vectors\.jsonl(?:\.gz)?|(?:paper|textbook)_image_manifest\.json|rag_pipeline_report\.json|\.rag_count\.json)$)/;
let removed = 0, traces = 0;
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith('.nft.json')) {
      const trace = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(trace.files) || trace.files.some((item) => typeof item !== 'string')) throw new Error(`Invalid build trace: ${file}`);
      const files = trace.files.filter((item) => !excluded.test(path.relative(root, path.resolve(directory, item)).replaceAll('\\', '/')));
      removed += trace.files.length - files.length; traces++;
      if (files.length !== trace.files.length) writeFileSync(file, JSON.stringify({ ...trace, files }));
    }
  }
}
visit(path.join(root, '.next', 'server'));
console.log(`[function-traces] Checked ${traces} traces; removed ${removed} offline/private references.`);
