#!/usr/bin/env node
/**
 * Ingests lib/context/chunks.jsonl and lib/context/textbook_chunks.jsonl into
 * the Supabase document_embeddings table using NVIDIA nv-embedqa-e5-v5
 * (or OpenAI text-embedding-3-small as fallback).
 *
 * Usage:
 *   node scripts/ingest_embeddings.mjs
 *   node scripts/ingest_embeddings.mjs --batch-size 64 --dry-run
 *
 * Required env vars:
 *   SUPABASE_URL          (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NVIDIA_API_KEY        (preferred — nv-embedqa-e5-v5, 1024-dim)
 *   OPENAI_API_KEY        (fallback — text-embedding-3-small, truncated to 1024)
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const BATCH_SIZE = Number(args[args.indexOf('--batch-size') + 1] || 32);
const DRY_RUN = args.includes('--dry-run');
const UPSERT_ONLY_MISSING = args.includes('--skip-existing');

// ── Env ───────────────────────────────────────────────────────────────────────
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const NVIDIA_KEY = (process.env.NVIDIA_API_KEY || '').trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY || '').trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}
if (!NVIDIA_KEY && !OPENAI_KEY) {
  console.error('ERROR: Set NVIDIA_API_KEY (preferred) or OPENAI_API_KEY for embeddings.');
  process.exit(1);
}

const PROVIDER = NVIDIA_KEY ? 'nvidia' : 'openai';
const EMBEDDING_DIM = 1024;
console.log(`Provider: ${PROVIDER}  |  Batch: ${BATCH_SIZE}  |  DryRun: ${DRY_RUN}`);

// ── Chunk sources ─────────────────────────────────────────────────────────────
const CHUNK_FILES = [
  join(ROOT, 'lib', 'context', 'chunks.jsonl'),
  join(ROOT, 'lib', 'context', 'textbook_chunks.jsonl'),
];

async function readChunks(filePath) {
  const chunks = [];
  try {
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        chunks.push(JSON.parse(trimmed));
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    console.warn(`  Skipping ${filePath} (not found)`);
  }
  return chunks;
}

// ── Embedding APIs ────────────────────────────────────────────────────────────
async function embedNvidia(texts) {
  const res = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${NVIDIA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nvidia/nv-embedqa-e5-v5',
      input: texts,
      input_type: 'passage',
      truncate: 'END',
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA embed failed: ${res.status} ${await res.text().catch(() => '')}`);
  const payload = await res.json();
  return payload.data.map((d) => d.embedding);
}

async function embedOpenAI(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions: EMBEDDING_DIM,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI embed failed: ${res.status} ${await res.text().catch(() => '')}`);
  const payload = await res.json();
  return payload.data.map((d) => d.embedding);
}

async function embedBatch(texts) {
  return PROVIDER === 'nvidia' ? embedNvidia(texts) : embedOpenAI(texts);
}

// ── Supabase upsert ───────────────────────────────────────────────────────────
async function upsertRows(rows) {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would upsert ${rows.length} rows`);
    return;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/document_embeddings`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase upsert failed: ${res.status} ${body.slice(0, 300)}`);
  }
}

// ── Retry with exponential backoff ────────────────────────────────────────────
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 500) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        process.stderr.write(`\n  Attempt ${attempt}/${maxAttempts} failed: ${err.message}. Retrying in ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── Existing IDs (for --skip-existing) ───────────────────────────────────────
let existingIds = new Set();
async function loadExistingIds() {
  if (!UPSERT_ONLY_MISSING) return;
  console.log('Loading existing IDs from Supabase…');
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/document_embeddings?select=id&limit=${pageSize}&offset=${offset}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!res.ok) break;
    const rows = await res.json();
    if (!rows.length) break;
    for (const row of rows) existingIds.add(row.id);
    offset += pageSize;
    if (rows.length < pageSize) break;
  }
  console.log(`  ${existingIds.size} existing rows`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  await loadExistingIds();

  let allChunks = [];
  for (const file of CHUNK_FILES) {
    const chunks = await readChunks(file);
    console.log(`  ${chunks.length} chunks from ${file}`);
    allChunks = allChunks.concat(chunks);
  }

  // Deduplicate by id
  const seen = new Set();
  allChunks = allChunks.filter((c) => {
    const id = c.id || `${c.sourcePath}::${c.text?.slice(0, 80)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    c.id = id;
    return true;
  });

  if (UPSERT_ONLY_MISSING) {
    allChunks = allChunks.filter((c) => !existingIds.has(c.id));
    console.log(`${allChunks.length} new chunks to ingest (${existingIds.size} already exist)`);
  } else {
    console.log(`${allChunks.length} total chunks to ingest`);
  }

  if (allChunks.length === 0) {
    console.log('Nothing to ingest.');
    return;
  }

  let ingested = 0;
  let errors = 0;

  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => (c.text ?? '').slice(0, 2048));

    try {
      await withRetry(async () => {
        const embeddings = await embedBatch(texts);
        const rows = batch.map((chunk, idx) => ({
          id: chunk.id,
          text: (chunk.text ?? '').slice(0, 8000),
          source_path: chunk.sourcePath ?? '',
          class_level: chunk.classLevel ?? 10,
          subject: chunk.subject ?? '',
          source_type: chunk.sourceType ?? 'paper',
          chapter_id: chunk.chapterId ?? null,
          year: chunk.year ?? null,
          paper_type: chunk.paperType ?? null,
          medium: chunk.medium ?? null,
          language: chunk.language ?? null,
          embedding: `[${embeddings[idx].join(',')}]`,
        }));
        await upsertRows(rows);
      });
      ingested += batch.length;
      process.stdout.write(`\r  ${ingested}/${allChunks.length} ingested`);
    } catch (err) {
      console.error(`\n  Batch ${Math.floor(i / BATCH_SIZE) + 1} failed after 3 attempts: ${err.message}`);
      errors += batch.length;
    }

    // Rate-limit guard: 200ms between batches
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n\nDone. Ingested: ${ingested}  Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
