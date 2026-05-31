#!/usr/bin/env node
/**
 * VidyaPath — npm run rag:build
 * ══════════════════════════════════════════════════════════════════════════════
 * Full RAG pipeline rebuild, no downloads required.
 * Dataset (CBSEpapers + NCERT textbooks) must already be in dataset/ folder
 * or downloaded separately from HuggingFace.
 *
 * What this does:
 *   Phase 0  API health check (aborts if no LLM API is reachable)
 *   Step 1   Build question-paper chunks  →  lib/context/chunks.jsonl
 *   Step 2   Build textbook chunks        →  lib/context/textbook_chunks.jsonl
 *   Step 3   Clean & deduplicate chunks
 *   Step 4   Build vector embeddings      →  lib/context/chunk_vectors.jsonl
 *            (NVIDIA 1024-dim → ONNX 384-dim → hashed-BoW 192-dim)
 *   Step 5   Build BM25 retrieval index   →  lib/context/retrieval_index.json
 *   Step 6   Dataset quality report
 *   Step 7   Verify all artifacts
 *   Step 8   RAG retrieval benchmark
 *
 * Usage:
 *   npm run rag:build
 *   npm run rag:build -- --skip-qp          (textbooks only)
 *   npm run rag:build -- --skip-textbooks   (question papers only)
 *   npm run rag:build -- --skip-benchmark   (skip final test)
 *   npm run rag:build -- --class 12         (Class 12 only)
 *   npm run rag:build -- --max-pages 20     (default)
 *   npm run rag:build -- --force            (skip API check)
 */

import { spawnSync, spawn }         from 'node:child_process';
import { existsSync, statSync,
         writeFileSync, mkdirSync,
         readFileSync }             from 'node:fs';
import path                         from 'node:path';
import { parseArgs }                from 'node:util';

// ── Load .env.local / .env automatically (no dotenv dependency) ───────────────
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return 0;
  let loaded = 0;
  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val   = line.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Only set if not already in environment (real env vars take precedence)
    if (key && !(key in process.env)) {
      process.env[key] = val;
      loaded++;
    }
  }
  return loaded;
}

{
  const root = path.resolve(import.meta.dirname, '..');
  const envFiles = ['.env.local', '.env'];
  let total = 0;
  for (const f of envFiles) {
    total += loadEnvFile(path.join(root, f));
  }
  if (total > 0) {
    process.stderr.write(`\x1b[2m  [env] Loaded ${total} variable(s) from .env.local / .env\x1b[0m\n`);
  }
}

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT        = path.resolve(import.meta.dirname, '..');
const SCRIPTS     = path.join(ROOT, 'scripts');
const CONTEXT_DIR = path.join(ROOT, 'lib', 'context');
const REPORT_PATH = path.join(CONTEXT_DIR, 'rag_build_report.json');

// ── Colour palette ────────────────────────────────────────────────────────────
const TTY = process.stdout.isTTY;
const ESC = (code) => TTY ? `\x1b[${code}m` : '';
const RESET   = ESC(0);
const BOLD    = ESC(1);
const DIM     = ESC(2);
const RED     = ESC(31);
const GREEN   = ESC(32);
const YELLOW  = ESC(33);
const BLUE    = ESC(34);
const MAGENTA = ESC(35);
const CYAN    = ESC(36);
const WHITE   = ESC(37);
const BG_RED  = ESC(41);
const BG_GREEN= ESC(42);

const col  = (c, t) => `${c}${t}${RESET}`;
const bold = (t)    => col(BOLD, t);
const dim  = (t)    => col(DIM,  t);
const ok   = (t)    => col(GREEN,   t);
const warn = (t)    => col(YELLOW,  t);
const err  = (t)    => col(RED,     t);
const info = (t)    => col(CYAN,    t);
const head = (t)    => col(BOLD + CYAN, t);

function w() { return Math.min(process.stdout.columns || 80, 100); }
function hr(ch = '─') { return dim(ch.repeat(w())); }
function dhr(ch = '═') { return col(BOLD + CYAN, ch.repeat(w())); }

// ── Args ──────────────────────────────────────────────────────────────────────
const { values: F } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help:             { type: 'boolean', short: 'h', default: false },
    force:            { type: 'boolean', default: false },
    'skip-qp':        { type: 'boolean', default: false },
    'skip-textbooks': { type: 'boolean', default: false },
    'skip-clean':     { type: 'boolean', default: false },
    'skip-vectors':   { type: 'boolean', default: false },
    'skip-benchmark': { type: 'boolean', default: false },
    class:            { type: 'string' },
    subject:          { type: 'string' },
    'max-pages':      { type: 'string', default: '20' },
    'max-files':      { type: 'string', default: '0' },
    'with-ocr':       { type: 'boolean', default: false },
  },
  strict: false,
});

if (F.help) {
  console.log(`
${head('VidyaPath — npm run rag:build')}

${bold('Usage:')}
  npm run rag:build [-- options]

${bold('Options:')}
  --force            Skip API health check and run anyway
  --skip-qp          Skip question-paper chunking
  --skip-textbooks   Skip textbook chunking
  --skip-clean       Skip chunk deduplication pass
  --skip-vectors     Skip embedding rebuild (reuse existing)
  --skip-benchmark   Skip final benchmark test
  --class 10|12      Scope to one class only
  --subject NAME     Scope textbooks to one subject
  --max-pages N      Pages per PDF (default: 20)
  --max-files N      Max QP files to chunk (default: 0 = all)

${bold('Embedding priority (auto-detected):')}
  1. NVIDIA nv-embedqa-e5-v5  — set NVIDIA_API_KEY
  2. @xenova/transformers      — npm install @xenova/transformers
  3. Hashed bag-of-words       — always available (NOT semantic)
`);
  process.exit(0);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function resolvePython() {
  for (const cmd of (process.platform === 'win32'
    ? ['python', 'py', 'python3']
    : ['python3', 'python'])) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  throw new Error('Python 3 not found on PATH.');
}

function resolveNode() {
  const local = path.join(ROOT, '.tools', 'node-current', 'node.exe');
  return existsSync(local) ? local : process.execPath;
}

function resolveVitest() {
  for (const rel of [
    path.join('node_modules', '.bin', 'vitest.cmd'),
    path.join('node_modules', '.bin', 'vitest'),
    path.join('node_modules', 'vitest', 'vitest.mjs'),
  ]) {
    const p = path.join(ROOT, rel);
    if (existsSync(p)) return p;
  }
  return null;
}

function onnxInstalled() {
  return existsSync(path.join(ROOT, 'node_modules', '@xenova', 'transformers'));
}

function validKey(val, prefix) {
  if (!val || typeof val !== 'string') return false;
  const v = val.trim();
  if (prefix && !v.startsWith(prefix)) return false;
  return !['placeholder','replace','changeme','your_'].some(t => v.toLowerCase().includes(t));
}

// ── API health checker ────────────────────────────────────────────────────────
const AC_TIMEOUT = 8000; // ms per API ping

async function pingNvidia(key) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), AC_TIMEOUT);
  try {
    const r = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nvidia/nv-embedqa-e5-v5',
        input: ['ping'],
        encoding_format: 'float',
        input_type: 'query',
      }),
    });
    if (r.status === 200) return { ok: true, note: 'embeddings + reranker + OCR' };
    if (r.status === 401) return { ok: false, note: 'invalid or revoked key (401)' };
    if (r.status === 429) return { ok: true,  note: 'rate-limited but key valid (429)' };
    return { ok: false, note: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, note: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
  } finally {
    clearTimeout(tid);
  }
}

async function pingGemini(key) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), AC_TIMEOUT);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      { signal: ctrl.signal }
    );
    if (r.status === 200) return { ok: true,  note: 'gemini-2.5-flash-preview' };
    if (r.status === 400) return { ok: true,  note: 'key valid (400 = bad param is fine)' };
    if (r.status === 403) return { ok: false, note: 'API not enabled or key invalid (403)' };
    return { ok: false, note: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, note: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
  } finally {
    clearTimeout(tid);
  }
}

async function pingOpenAICompat(url, key, name) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), AC_TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}` },
    });
    if (r.status === 200) return { ok: true,  note: 'models endpoint OK' };
    if (r.status === 401) return { ok: false, note: 'invalid key (401)' };
    if (r.status === 429) return { ok: true,  note: 'rate-limited but key valid (429)' };
    return { ok: false, note: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, note: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
  } finally {
    clearTimeout(tid);
  }
}

async function pingSupabase(url, anonKey) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), AC_TIMEOUT);
  try {
    const r = await fetch(`${url}/rest/v1/`, {
      signal: ctrl.signal,
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    return r.status < 500
      ? { ok: true,  note: `HTTP ${r.status}` }
      : { ok: false, note: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, note: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
  } finally {
    clearTimeout(tid);
  }
}

async function runApiHealthCheck() {
  const env = process.env;

  const checks = [
    {
      name:      'NVIDIA',
      role:      'embeddings · reranker · OCR',
      tier:      'embedding',
      key:       env.NVIDIA_API_KEY,
      prefix:    'nvapi-',
      ping:      async (k) => pingNvidia(k),
    },
    {
      name:      'Gemini',
      role:      'primary LLM (flash-2.5)',
      tier:      'llm',
      key:       env.GEMINI_API_KEY,
      prefix:    'AIza',
      ping:      async (k) => pingGemini(k),
    },
    {
      name:      'Groq',
      role:      'LLM fallback · HyDE helper',
      tier:      'llm',
      key:       env.GROQ_API_KEY,
      prefix:    'gsk_',
      ping:      async (k) => pingOpenAICompat('https://api.groq.com/openai/v1/models', k, 'Groq'),
    },
    {
      name:      'Cerebras',
      role:      'LLM fallback',
      tier:      'llm',
      key:       env.CEREBRAS_API_KEY,
      prefix:    'csk-',
      ping:      async (k) => pingOpenAICompat('https://api.cerebras.ai/v1/models', k, 'Cerebras'),
    },
    {
      name:      'Mistral',
      role:      'LLM fallback',
      tier:      'llm',
      key:       env.MISTRAL_API_KEY,
      prefix:    null,
      minLen:    16,
      ping:      async (k) => pingOpenAICompat('https://api.mistral.ai/v1/models', k, 'Mistral'),
    },
    {
      name:      'Supabase',
      role:      'state persistence',
      tier:      'db',
      key:       env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      url:       env.NEXT_PUBLIC_SUPABASE_URL,
      ping:      async (k) => pingSupabase(env.NEXT_PUBLIC_SUPABASE_URL, k),
    },
    {
      name:      '@xenova/transformers',
      role:      'ONNX local embeddings (no API)',
      tier:      'embedding-local',
      key:       'local',
      prefix:    null,
      ping:      async () => ({
        ok: onnxInstalled(),
        note: onnxInstalled()
          ? 'installed → 384-dim semantic'
          : 'not installed  →  npm install @xenova/transformers',
      }),
    },
  ];

  console.log(`\n${dhr()}`);
  console.log(head('  Phase 0 — API Health Check'));
  console.log(dhr());
  console.log(dim('  Pinging every provider... (8s timeout each)\n'));

  const WIDTH_NAME = 26;
  const WIDTH_ROLE = 32;

  // Run all pings concurrently
  const settled = await Promise.all(
    checks.map(async (chk) => {
      const hasKey = chk.key && chk.key !== 'local'
        ? validKey(chk.key, chk.prefix)
        : chk.key === 'local';
      if (!hasKey) {
        return {
          ...chk,
          result: { ok: false, note: 'key not set / invalid format' },
          skipped: true,
        };
      }
      const result = await chk.ping(chk.key).catch(e => ({ ok: false, note: String(e.message) }));
      return { ...chk, result, skipped: false };
    })
  );

  let llmCount   = 0;
  let embedOk    = false;
  let hasWarning = false;

  for (const chk of settled) {
    const { result, skipped } = chk;
    let icon, nameStr, noteStr;

    if (skipped) {
      icon    = dim('  ○');
      nameStr = dim(chk.name.padEnd(WIDTH_NAME));
      noteStr = dim(chk.result.note);
    } else if (result.ok) {
      icon    = ok('  ✓');
      nameStr = ok(chk.name).padEnd(WIDTH_NAME + 9);
      noteStr = dim(result.note);
      if (chk.tier === 'llm') llmCount++;
      if (chk.tier === 'embedding' || chk.tier === 'embedding-local') embedOk = true;
    } else {
      icon    = err('  ✗');
      nameStr = err(chk.name).padEnd(WIDTH_NAME + 9);
      noteStr = warn(result.note);
      hasWarning = true;
    }

    const role = dim(chk.role.padEnd(WIDTH_ROLE));
    console.log(`${icon}  ${nameStr}  ${role}  ${noteStr}`);
  }

  // Embedding decision
  console.log('');
  const hasOnnx = onnxInstalled();
  const hasNvidiaEmbed = settled.find(c => c.name === 'NVIDIA')?.result?.ok;

  if (hasNvidiaEmbed) {
    console.log(`${ok('  ✓')}  ${bold('Embeddings:')}  NVIDIA nv-embedqa-e5-v5 ${dim('(1024-dim semantic)')}`);
  } else if (hasOnnx) {
    console.log(`${ok('  ✓')}  ${bold('Embeddings:')}  @xenova/transformers all-MiniLM-L6-v2 ${dim('(384-dim semantic)')}`);
  } else {
    console.log(`${warn('  ⚠')}  ${bold('Embeddings:')}  ${warn('hashed bag-of-words (192-dim, NOT semantic)')}`);
    console.log(dim('              Vector search will be lexical, not semantic.'));
    console.log(dim('              → npm install @xenova/transformers  for free ONNX embeddings'));
    hasWarning = true;
  }

  // ── Decision gate ────────────────────────────────────────────────────────
  console.log('');

  // BUILD only needs embeddings. LLMs are a runtime concern (generation, HyDE).
  // Hard abort only when we have zero embedding option at all.
  const canEmbed = hasNvidiaEmbed || hasOnnx;

  if (!canEmbed) {
    console.log(warn('  ⚠  No semantic embedding provider found.'));
    console.log(dim('     Will use hashed bag-of-words (NOT semantic) — vector search quality is poor.'));
    console.log(dim('     Install: npm install @xenova/transformers  for free 384-dim embeddings.'));
  } else {
    const embedLabel = hasNvidiaEmbed
      ? ok('NVIDIA nv-embedqa-e5-v5 (1024-dim)')
      : ok('@xenova/transformers all-MiniLM-L6-v2 (384-dim)');
    console.log(`${ok('  ✓')}  ${bold('Embedding provider ready:')}  ${embedLabel}`);
  }

  // LLM check — warning only, not a blocker for building the index
  if (llmCount === 0) {
    console.log('');
    console.log(`${warn('  ⚠')}  ${bold(warn('No LLM API keys found.'))}  Generation will fail at runtime.`);
    console.log(dim('     Add at least one of: GEMINI_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY'));
    console.log(dim('     to your .env.local file.  The index build will continue.'));
    if (!F.force) {
      console.log('');
      console.log(warn('  Continuing in 3s... (Ctrl+C to abort, or --force to skip this pause)'));
      await new Promise(r => setTimeout(r, 3000));
    }
  } else {
    console.log(`${ok('  ✓')}  ${llmCount} LLM provider(s) reachable.  Runtime generation will work.`);
  }

  return true;
}

// ── Step runner ───────────────────────────────────────────────────────────────
const results = [];
let stepNum = 0;

async function runStep({ label, cmd, args = [], env = {}, optional = false, skip = false }) {
  stepNum++;
  const start = Date.now();

  if (skip) {
    const tag = dim(`  [skip] Step ${stepNum}: ${label}`);
    console.log(`\n${tag}`);
    results.push({ label, status: 'skipped', ms: 0 });
    return true;
  }

  console.log(`\n${hr()}`);
  console.log(`${info(bold(`  Step ${stepNum}`))}  ${bold(label)}`);
  console.log(dim(`  $ ${[cmd, ...args].join(' ')}`));
  console.log(hr());

  const merged = { ...process.env, ...env };

  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: merged,
    shell: false,
  });

  const ms  = Date.now() - start;
  const dur = ms > 60000
    ? `${Math.floor(ms/60000)}m ${((ms%60000)/1000).toFixed(1)}s`
    : `${(ms/1000).toFixed(1)}s`;

  if (result.status !== 0) {
    console.log(err(`\n  ✗  FAILED  (exit ${result.status ?? 'signal'})  ·  ${dur}`));
    results.push({ label, status: 'failed', exitCode: result.status, ms });
    if (optional) {
      console.log(warn('  Optional step — continuing anyway.'));
      return false;
    }
    throw new Error(`Step "${label}" failed (exit ${result.status})`);
  }

  console.log(ok(`\n  ✓  Done  ·  ${dur}`));
  results.push({ label, status: 'ok', ms });
  return true;
}

// ── Summary table ─────────────────────────────────────────────────────────────
function printSummary(totalMs) {
  const mins = Math.floor(totalMs / 60000);
  const secs = ((totalMs % 60000) / 1000).toFixed(1);
  const elapsed = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  const passed  = results.filter(r => r.status === 'ok').length;
  const failed  = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  console.log(`\n${dhr()}`);
  console.log(head('  Build Summary'));
  console.log(dhr());

  for (const r of results) {
    const icon = r.status === 'ok'
      ? ok('  ✓')
      : r.status === 'skipped'
        ? dim('  –')
        : err('  ✗');
    const label = r.status === 'ok'
      ? r.label
      : r.status === 'skipped'
        ? dim(r.label)
        : err(r.label);
    const dur = r.ms > 0 ? dim(`  (${(r.ms/1000).toFixed(1)}s)`) : '';
    console.log(`${icon}  ${label}${dur}`);
  }

  console.log(hr());
  const statusBadge = failed > 0
    ? col(BG_RED + BOLD, ` FAILED · ${failed} step(s) errored `)
    : col(BG_GREEN + BOLD, ' PASSED ');
  console.log(`  ${statusBadge}  ${passed} ok  ·  ${skipped} skipped  ·  ${elapsed} total`);
  console.log(dhr());
}

// ── Artifact sizes ────────────────────────────────────────────────────────────
function printArtifacts() {
  const files = [
    ['chunks.jsonl',                'lib/context/chunks.jsonl'],
    ['textbook_chunks.jsonl',       'lib/context/textbook_chunks.jsonl'],
    ['chunk_vectors.jsonl',         'lib/context/chunk_vectors.jsonl'],
    ['retrieval_index.json',        'lib/context/retrieval_index.json'],
    ['chapter_index.json',          'lib/context/chapter_index.json'],
    ['textbook_chapter_index.json', 'lib/context/textbook_chapter_index.json'],
  ];

  console.log(`\n${bold('  Artifacts:')}`);
  for (const [name, rel] of files) {
    const full = path.join(ROOT, rel);
    if (existsSync(full)) {
      const mb = (statSync(full).size / 1024 / 1024).toFixed(1);
      console.log(`  ${ok('✓')}  ${name.padEnd(34)} ${dim(mb + ' MB')}`);
    } else {
      console.log(`  ${dim('–')}  ${dim(name.padEnd(34))} ${dim('(not present)')}`);
    }
  }

  const report = path.join(ROOT, 'lib/context/rag_build_report.json');
  console.log(`\n  ${dim('Report: ' + report)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const T0 = Date.now();

  // Banner
  console.log(dhr());
  console.log(head('  VidyaPath  ·  RAG Pipeline Build'));
  console.log(dhr());
  const ts = new Date().toLocaleString();
  console.log(dim(`  Started: ${ts}  ·  max-pages=${F['max-pages']}  ·  max-files=${F['max-files']}`));
  if (F.class)   console.log(dim(`  Scope: Class ${F.class}${F.subject ? ` · ${F.subject}` : ''}`));

  // ── Phase 0: API health check ──────────────────────────────────────────────
  if (!F.force) {
    const apiOk = await runApiHealthCheck();
    if (!apiOk) {
      process.exitCode = 1;
      return;
    }
  } else {
    console.log(warn('\n  --force: skipping API health check.'));
  }

  const python  = resolvePython();
  const node    = resolveNode();
  const vitest  = resolveVitest();
  const maxPages = F['max-pages'] || '20';
  const maxFiles = F['max-files'] || '0';
  const extraEnv = {};

  const totalSteps =
    (F['skip-qp']        ? 0 : 1)
  + (F['skip-textbooks'] ? 0 : 1)
  + (F['skip-clean']     ? 0 : 1)
  + (F['skip-vectors']   ? 0 : 1)
  + 1 // retrieval index always
  + 1 // quality check always
  + 1 // verify always
  + (F['skip-benchmark'] ? 0 : 1);

  console.log(dim(`\n  ${totalSteps} pipeline step(s) queued.\n`));

  try {
    // ── Step 1: Build question-paper chunks ──────────────────────────────────
    const qpArgs = [
      path.join(SCRIPTS, 'build_context_index.py'),
      '--max-files', maxFiles,
      '--max-pages', maxPages,
      // --save-images and --extract-images omitted by default:
      // renders every visual page as PNG + runs NVIDIA OCR → adds hours to build.
      // Pass --with-ocr flag to rag:build to enable.
      ...(F['with-ocr'] ? ['--save-images', '--extract-images'] : []),
    ];
    if (F.class) qpArgs.push('--class', F.class);
    await runStep({
      label: `Build question-paper chunks  (max-pages=${maxPages})`,
      cmd: python, args: qpArgs, env: extraEnv,
      skip: !!F['skip-qp'],
    });

    // ── Step 2: Build textbook chunks ────────────────────────────────────────
    const tbArgs = [
      path.join(SCRIPTS, 'build_textbook_index.py'),
      '--merge-main-index',
      ...(F['with-ocr'] ? ['--save-images', '--extract-images'] : []),
    ];
    if (F.class)   tbArgs.push('--class', F.class);
    if (F.subject) tbArgs.push('--subject', F.subject);
    await runStep({
      label: 'Build textbook semantic chunks',
      cmd: python, args: tbArgs, env: extraEnv,
      skip: !!F['skip-textbooks'],
      optional: true,
    });

    // ── Step 3: Clean & deduplicate ──────────────────────────────────────────
    await runStep({
      label: 'Clean & deduplicate chunks',
      cmd: node, args: [path.join(SCRIPTS, 'clean_context_chunks.mjs')],
      skip: !!F['skip-clean'],
    });

    // ── Step 4: Vector embeddings ────────────────────────────────────────────
    await runStep({
      label: 'Build vector embeddings  (NVIDIA → ONNX → hashed-BoW)',
      cmd: node, args: [path.join(SCRIPTS, 'build_vector_index.mjs')], env: extraEnv,
      skip: !!F['skip-vectors'],
    });

    // ── Step 5: BM25 retrieval index ─────────────────────────────────────────
    await runStep({
      label: 'Build BM25 retrieval index',
      cmd: node, args: [path.join(SCRIPTS, 'build_retrieval_index.mjs')],
    });

    // ── Step 6: Dataset quality ───────────────────────────────────────────────
    await runStep({
      label: 'Dataset quality report',
      cmd: node, args: [path.join(SCRIPTS, 'check_dataset_quality.mjs')],
      optional: true,
    });

    // ── Step 7: Verify artifacts ──────────────────────────────────────────────
    await runStep({
      label: 'Verify context artifacts',
      cmd: node, args: [path.join(SCRIPTS, 'verify_context_index.mjs')],
      optional: true,
    });

    // ── Step 8: Benchmark ─────────────────────────────────────────────────────
    if (vitest) {
      await runStep({
        label: 'RAG retrieval benchmark',
        cmd: node, args: [vitest, 'run', 'lib/ai/__tests__/rag-benchmark.test.ts'],
        optional: true,
        skip: !!F['skip-benchmark'],
      });
    } else {
      console.log(dim('\n  [skip] RAG benchmark: vitest not found'));
    }

    const totalMs = Date.now() - T0;
    mkdirSync(CONTEXT_DIR, { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify({
      generatedAt: new Date().toISOString(), totalMs, status: 'ok', steps: results,
    }, null, 2), 'utf-8');

    printSummary(totalMs);
    printArtifacts();
    console.log(ok(bold('\n  ✓  RAG pipeline build complete.\n')));
    return 0;

  } catch (e) {
    const totalMs = Date.now() - T0;
    mkdirSync(CONTEXT_DIR, { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify({
      generatedAt: new Date().toISOString(), totalMs, status: 'failed',
      error: String(e.message), steps: results,
    }, null, 2), 'utf-8');
    printSummary(totalMs);
    console.log(err(bold(`\n  ✗  Pipeline failed: ${e.message}\n`)));
    return 1;
  }
}

process.exitCode = await main();
