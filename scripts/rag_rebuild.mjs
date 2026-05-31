#!/usr/bin/env node
/**
 * VidyaPath RAG Full Rebuild
 * ──────────────────────────
 * Single command to rebuild the entire RAG pipeline from scratch.
 *
 * Usage:
 *   npm run rag:rebuild                      # Full pipeline
 *   npm run rag:rebuild -- --skip-download   # Skip PDF downloads (use existing dataset)
 *   npm run rag:rebuild -- --skip-qp         # Skip question papers, textbooks only
 *   npm run rag:rebuild -- --skip-textbooks  # Skip textbooks, QP only
 *   npm run rag:rebuild -- --skip-benchmark  # Skip final benchmark test
 *   npm run rag:rebuild -- --fast            # Max 220 QP files, skip downloads
 *   npm run rag:rebuild -- --class 12        # Scope to Class 12 only
 *   npm run rag:rebuild -- --help
 *
 * Pipeline steps:
 *   1.  Download question papers (CBSE board/sample PDFs)
 *   2.  Download NCERT textbooks
 *   3.  Build question-paper chunks  → lib/context/chunks.jsonl
 *   4.  Build textbook chunks        → lib/context/textbook_chunks.jsonl
 *   5.  Clean & deduplicate chunks
 *   6.  Build vector embeddings      → lib/context/chunk_vectors.jsonl
 *        (NVIDIA → ONNX → hashed-BoW, in priority order)
 *   7.  Build BM25 retrieval index   → lib/context/retrieval_index.json
 *   8.  Dataset quality check
 *   9.  Verify artifacts
 *   10. RAG benchmark test
 */

import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const CONTEXT_DIR = path.join(ROOT, 'lib', 'context');
const REPORT_PATH = path.join(CONTEXT_DIR, 'rag_rebuild_report.json');

// ── ANSI colours ──────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  dim:   '\x1b[2m',
  green: '\x1b[32m',
  red:   '\x1b[31m',
  yellow:'\x1b[33m',
  cyan:  '\x1b[36m',
  blue:  '\x1b[34m',
  white: '\x1b[37m',
};
const use_color = process.stdout.isTTY !== false;
const c = (code, text) => use_color ? `${code}${text}${C.reset}` : text;

// ── Argument parsing ──────────────────────────────────────────────────────────
const { values: flags } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'help':            { type: 'boolean', short: 'h', default: false },
    'skip-download':   { type: 'boolean', default: false },
    'skip-qp':         { type: 'boolean', default: false },
    'skip-textbooks':  { type: 'boolean', default: false },
    'skip-clean':      { type: 'boolean', default: false },
    'skip-vectors':    { type: 'boolean', default: false },
    'skip-benchmark':  { type: 'boolean', default: false },
    'fast':            { type: 'boolean', default: false },
    'class':           { type: 'string' },
    'subject':         { type: 'string' },
    'max-pages':       { type: 'string', default: '12' },
    'max-files':       { type: 'string', default: '0' },
    'workers':         { type: 'string', default: '15' },
    'nvidia-key':      { type: 'string' },
  },
  strict: false,
});

if (flags.help) {
  console.log(`
${c(C.bold + C.cyan, 'VidyaPath RAG Full Rebuild')}

${c(C.bold, 'Usage:')}
  npm run rag:rebuild [-- options]

${c(C.bold, 'Options:')}
  --skip-download    Skip PDF downloads (use existing local dataset)
  --skip-qp          Skip question-paper steps entirely
  --skip-textbooks   Skip textbook steps entirely
  --skip-clean       Skip chunk deduplication/cleaning pass
  --skip-vectors     Skip vector embedding rebuild (re-use existing)
  --skip-benchmark   Skip final RAG benchmark test
  --fast             Quick run: max 220 QP files, skip downloads
  --class 10|12      Scope to one class only
  --subject NAME     Scope textbooks to one subject
  --max-pages N      Pages per question-paper PDF (default: 12)
  --max-files N      Max QP files to chunk (default: 0 = all)
  --workers N        Parallel download workers (default: 15)
  --nvidia-key KEY   Override NVIDIA_API_KEY for OCR/embeddings

${c(C.bold, 'Embedding priority:')}
  1. NVIDIA nv-embedqa-e5-v5 (best, requires NVIDIA_API_KEY)
  2. @xenova/transformers all-MiniLM-L6-v2 (free local ONNX semantic)
     Install: npm install @xenova/transformers
  3. Hashed bag-of-words (fallback, NOT semantic — avoid in production)
`);
  process.exit(0);
}

// ── Fast mode ─────────────────────────────────────────────────────────────────
if (flags.fast) {
  flags['skip-download'] = true;
  if (!flags['max-files']) flags['max-files'] = '220';
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function resolvePython() {
  for (const candidate of ['python', 'python3', 'py']) {
    const r = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return candidate;
  }
  throw new Error('Python not found on PATH. Install Python 3.9+ to run build scripts.');
}

function resolveNode() {
  const local = path.join(ROOT, '.tools', 'node-current', 'node.exe');
  if (existsSync(local)) return local;
  return process.execPath;
}

function resolveVitest() {
  const candidate = path.join(ROOT, 'node_modules', '.bin', 'vitest');
  const candidateCmd = path.join(ROOT, 'node_modules', '.bin', 'vitest.cmd');
  if (existsSync(candidate)) return candidate;
  if (existsSync(candidateCmd)) return candidateCmd;
  return null;
}

function hr() {
  const w = process.stdout.columns || 72;
  return c(C.dim, '─'.repeat(w));
}

let stepIndex = 0;
const results = [];

function printHeader(label, stepNum, total) {
  const tag = c(C.bold + C.cyan, `[${stepNum}/${total}]`);
  console.log(`\n${hr()}`);
  console.log(`${tag} ${c(C.bold, label)}`);
  console.log(hr());
}

async function runStep({ label, cmd, args = [], env = {}, optional = false, skip = false }) {
  stepIndex += 1;
  const start = Date.now();

  if (skip) {
    console.log(`\n${c(C.dim, `[skip] ${label}`)}`);
    results.push({ label, status: 'skipped', durationMs: 0 });
    return true;
  }

  console.log(`\n${c(C.bold + C.blue, `▶ ${label}`)}`);
  console.log(c(C.dim, `  $ ${[cmd, ...args].join(' ')}`));

  const merged = { ...process.env, ...env };
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: merged,
    shell: process.platform === 'win32',
  });

  const durationMs = Date.now() - start;
  const mins = Math.floor(durationMs / 60000);
  const secs = ((durationMs % 60000) / 1000).toFixed(1);
  const elapsed = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  if (result.status !== 0) {
    console.log(c(C.red, `\n  ✗ FAILED (exit ${result.status ?? 'signal'}) — ${elapsed}`));
    results.push({ label, status: 'failed', exitCode: result.status, durationMs });
    if (!optional) throw new Error(`Step "${label}" failed with exit code ${result.status}`);
    console.log(c(C.yellow, '  ⚠ Optional step — continuing.'));
    return false;
  }

  console.log(c(C.green, `  ✓ Done — ${elapsed}`));
  results.push({ label, status: 'ok', durationMs });
  return true;
}

function printSummary(totalMs) {
  const w = process.stdout.columns || 72;
  const passed  = results.filter(r => r.status === 'ok').length;
  const failed  = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const mins = Math.floor(totalMs / 60000);
  const secs = ((totalMs % 60000) / 1000).toFixed(1);
  const elapsed = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  console.log(`\n${'═'.repeat(w)}`);
  console.log(c(C.bold, 'RAG Rebuild Summary'));
  console.log('═'.repeat(w));

  for (const r of results) {
    const icon = r.status === 'ok' ? c(C.green, '  ✓') : r.status === 'skipped' ? c(C.dim, '  –') : c(C.red, '  ✗');
    const dur  = r.durationMs > 0 ? c(C.dim, ` (${(r.durationMs/1000).toFixed(1)}s)`) : '';
    const lbl  = r.status === 'skipped' ? c(C.dim, r.label) : r.status === 'failed' ? c(C.red, r.label) : r.label;
    console.log(`${icon}  ${lbl}${dur}`);
  }

  console.log('─'.repeat(w));
  const statusLine = failed > 0
    ? c(C.red + C.bold, `FAILED  (${failed} step(s) failed)`)
    : c(C.green + C.bold, 'PASSED');
  console.log(`  ${statusLine}  ·  ${passed} ok  ·  ${skipped} skipped  ·  ${elapsed} total`);
  console.log('═'.repeat(w));
}

function checkOnnxAvailable() {
  try {
    const pkgDir = path.join(ROOT, 'node_modules', '@xenova', 'transformers');
    return existsSync(pkgDir);
  } catch {
    return false;
  }
}

function checkNvidiaKey(overrideKey) {
  const key = overrideKey || process.env.NVIDIA_API_KEY || '';
  return key.startsWith('nvapi-') && !['placeholder','replace','changeme'].some(t => key.toLowerCase().includes(t));
}

function printEmbeddingPlan(overrideKey) {
  const hasNvidia = checkNvidiaKey(overrideKey);
  const hasOnnx   = checkOnnxAvailable();

  console.log(`\n${c(C.bold, 'Embedding strategy:')}`);
  if (hasNvidia) {
    console.log(c(C.green, '  ✓ NVIDIA nv-embedqa-e5-v5 (semantic, 1024 dim)'));
  } else {
    console.log(c(C.dim,   '  – NVIDIA: no key (set NVIDIA_API_KEY to enable)'));
    if (hasOnnx) {
      console.log(c(C.green, '  ✓ @xenova/transformers all-MiniLM-L6-v2 (semantic, 384 dim)'));
    } else {
      console.log(c(C.yellow, '  ⚠ @xenova/transformers not installed → hashed-BoW fallback (NOT semantic)'));
      console.log(c(C.dim,    '    Run: npm install @xenova/transformers'));
    }
  }
}

function writeReport(totalMs, error) {
  mkdirSync(CONTEXT_DIR, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    totalMs,
    status: error ? 'failed' : 'ok',
    error: error ? String(error) : null,
    steps: results,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const totalStart = Date.now();

  // Banner
  const w = process.stdout.columns || 72;
  console.log(c(C.bold + C.cyan, '═'.repeat(w)));
  console.log(c(C.bold + C.cyan, ' VidyaPath — Full RAG Pipeline Rebuild'));
  console.log(c(C.bold + C.cyan, '═'.repeat(w)));

  const python = resolvePython();
  const node   = resolveNode();
  const vitest = resolveVitest();
  const extraEnv = {};
  if (flags['nvidia-key']) extraEnv.NVIDIA_API_KEY = flags['nvidia-key'];

  printEmbeddingPlan(flags['nvidia-key']);

  const maxPages = String(flags['max-pages'] || '12');
  const maxFiles = String(flags['max-files'] || '0');
  const workers  = String(flags['workers']   || '15');
  const classArg = flags['class'];
  const subjectArg = flags['subject'];

  const skipDownload  = !!flags['skip-download'];
  const skipQp        = !!flags['skip-qp'];
  const skipTextbooks = !!flags['skip-textbooks'];
  const skipClean     = !!flags['skip-clean'];
  const skipVectors   = !!flags['skip-vectors'];
  const skipBenchmark = !!flags['skip-benchmark'];

  console.log(`\n${c(C.bold, 'Config:')} max-pages=${maxPages}  max-files=${maxFiles}  workers=${workers}`);
  if (classArg)   console.log(`  class=${classArg}`);
  if (subjectArg) console.log(`  subject=${subjectArg}`);

  try {
    // ── 1. Download question papers ──
    const qpDownloadArgs = [path.join(SCRIPTS, 'download_dataset.py')];
    if (classArg) qpDownloadArgs.push('--class', classArg);
    await runStep({
      label: 'Download question papers (CBSE PDFs)',
      cmd: python,
      args: qpDownloadArgs,
      env: extraEnv,
      skip: skipDownload || skipQp,
    });

    // ── 2. Download NCERT textbooks ──
    const tbDownloadArgs = [path.join(SCRIPTS, 'download_ncert_textbooks.py'), '--workers', workers];
    if (classArg) tbDownloadArgs.push('--cls', classArg);
    await runStep({
      label: 'Download NCERT textbooks',
      cmd: python,
      args: tbDownloadArgs,
      env: extraEnv,
      skip: skipDownload || skipTextbooks,
    });

    // ── 3. Build question-paper chunks ──
    const qpChunkArgs = [
      path.join(SCRIPTS, 'build_context_index.py'),
      '--max-files', maxFiles,
      '--max-pages', maxPages,
      '--save-images',
      '--extract-images',
    ];
    if (classArg) qpChunkArgs.push('--class', classArg);
    await runStep({
      label: `Build question-paper chunks (max-pages=${maxPages})`,
      cmd: python,
      args: qpChunkArgs,
      env: extraEnv,
      skip: skipQp,
    });

    // ── 4. Build textbook chunks ──
    const tbChunkArgs = [
      path.join(SCRIPTS, 'build_textbook_index.py'),
      '--merge-main-index',
      '--save-images',
      '--extract-images',
    ];
    if (classArg)   tbChunkArgs.push('--class', classArg);
    if (subjectArg) tbChunkArgs.push('--subject', subjectArg);
    await runStep({
      label: 'Build textbook semantic chunks',
      cmd: python,
      args: tbChunkArgs,
      env: extraEnv,
      skip: skipTextbooks,
      optional: true,
    });

    // ── 5. Clean & deduplicate chunks ──
    await runStep({
      label: 'Clean & deduplicate chunks',
      cmd: node,
      args: [path.join(SCRIPTS, 'clean_context_chunks.mjs')],
      skip: skipClean,
    });

    // ── 6. Build vector embeddings ──
    await runStep({
      label: 'Build vector embeddings (NVIDIA → ONNX → hashed-BoW)',
      cmd: node,
      args: [path.join(SCRIPTS, 'build_vector_index.mjs')],
      env: extraEnv,
      skip: skipVectors,
    });

    // ── 7. Build BM25 retrieval index ──
    await runStep({
      label: 'Build BM25 retrieval index',
      cmd: node,
      args: [path.join(SCRIPTS, 'build_retrieval_index.mjs')],
    });

    // ── 8. Dataset quality check ──
    await runStep({
      label: 'Dataset quality check',
      cmd: node,
      args: [path.join(SCRIPTS, 'check_dataset_quality.mjs')],
      optional: true,
    });

    // ── 9. Verify context artifacts ──
    await runStep({
      label: 'Verify context artifacts',
      cmd: node,
      args: [path.join(SCRIPTS, 'verify_context_index.mjs')],
      optional: true,
    });

    // ── 10. RAG benchmark ──
    const vitestArgs = vitest
      ? [vitest, 'run', 'lib/ai/__tests__/rag-benchmark.test.ts']
      : null;
    await runStep({
      label: 'RAG retrieval benchmark',
      cmd: vitestArgs ? node : 'echo',
      args: vitestArgs ? vitestArgs.slice(1) : ['(vitest not found, skipping)'],
      skip: skipBenchmark || !vitestArgs,
      optional: true,
    });

    const totalMs = Date.now() - totalStart;
    writeReport(totalMs, null);
    printSummary(totalMs);

    // Print artifact sizes
    console.log(`\n${c(C.bold, 'Artifacts:')}`);
    const artifacts = [
      ['chunks.jsonl',              path.join(CONTEXT_DIR, 'chunks.jsonl')],
      ['textbook_chunks.jsonl',     path.join(CONTEXT_DIR, 'textbook_chunks.jsonl')],
      ['chunk_vectors.jsonl',       path.join(CONTEXT_DIR, 'chunk_vectors.jsonl')],
      ['retrieval_index.json',      path.join(CONTEXT_DIR, 'retrieval_index.json')],
      ['chapter_index.json',        path.join(CONTEXT_DIR, 'chapter_index.json')],
      ['textbook_chapter_index.json', path.join(CONTEXT_DIR, 'textbook_chapter_index.json')],
    ];
    for (const [name, fpath] of artifacts) {
      if (existsSync(fpath)) {
        const bytes = (await import('node:fs')).statSync(fpath).size;
        const mb = (bytes / 1024 / 1024).toFixed(1);
        console.log(`  ${c(C.green, '✓')} ${name.padEnd(32)} ${c(C.dim, mb + ' MB')}`);
      } else {
        console.log(`  ${c(C.dim, '–')} ${c(C.dim, name)} ${c(C.dim, '(not built)')}`);
      }
    }

    console.log(`\n${c(C.dim, `Report: ${REPORT_PATH}`)}`);
    console.log(c(C.bold + C.green, '\n✓ RAG pipeline rebuild complete.\n'));
    return 0;

  } catch (err) {
    const totalMs = Date.now() - totalStart;
    writeReport(totalMs, err);
    printSummary(totalMs);
    console.log(c(C.red + C.bold, `\n✗ Pipeline failed: ${err.message}\n`));
    return 1;
  }
}

process.exitCode = await main();
