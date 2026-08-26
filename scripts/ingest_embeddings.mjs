#!/usr/bin/env node
/**
 * Ingests lib/context/chunks.jsonl and lib/context/textbook_chunks.jsonl into
 * the Supabase document_embeddings table using Google Gemini embeddings.
 *
 * Usage:
 *   node scripts/ingest_embeddings.mjs
 *   node scripts/ingest_embeddings.mjs --batch-size 64 --dry-run
 *   node scripts/ingest_embeddings.mjs --probe
 *   node scripts/ingest_embeddings.mjs --async-probe
 *   node scripts/ingest_embeddings.mjs --async-batch --skip-existing
 *
 * Required env vars:
 *   SUPABASE_URL          (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY        (preferred — gemini-embedding-001, 1024-dim)
 */

import { createReadStream, promises as fs } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function loadLocalEnvFiles() {
  for (const file of [join(ROOT, '.env.local'), join(ROOT, '.env')]) {
    try {
      const raw = await fs.readFile(file, 'utf-8');
      for (const rawLine of raw.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
        const idx = normalized.indexOf('=');
        if (idx <= 0) continue;

        const key = normalized.slice(0, idx).trim();
        let value = normalized.slice(idx + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        if (!process.env[key]) process.env[key] = value;
      }
    } catch {
      // Ignore missing env files.
    }
  }
}

await loadLocalEnvFiles();

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const batchSizeArgIndex = args.indexOf('--batch-size');
const parsedBatchSize = batchSizeArgIndex >= 0 ? Number(args[batchSizeArgIndex + 1]) : Number.NaN;
const BATCH_SIZE = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0
  ? Math.max(1, Math.floor(parsedBatchSize))
  : 32;
const DRY_RUN = args.includes('--dry-run');
const PROBE_ONLY = args.includes('--probe');
const ASYNC_PROBE_ONLY = args.includes('--async-probe');
const ASYNC_BATCH = args.includes('--async-batch') || ASYNC_PROBE_ONLY;
const VERIFY_ONLY = args.includes('--verify');
const UPSERT_ONLY_MISSING = args.includes('--skip-existing');
const asyncBatchSizeArgIndex = args.indexOf('--async-batch-size');
const parsedAsyncBatchSize = asyncBatchSizeArgIndex >= 0
  ? Number(args[asyncBatchSizeArgIndex + 1])
  : Number.NaN;
const ASYNC_BATCH_SIZE = Number.isFinite(parsedAsyncBatchSize) && parsedAsyncBatchSize > 0
  ? Math.min(750, Math.max(1, Math.floor(parsedAsyncBatchSize)))
  : 400;
const asyncConcurrencyArgIndex = args.indexOf('--async-concurrency');
const parsedAsyncConcurrency = asyncConcurrencyArgIndex >= 0
  ? Number(args[asyncConcurrencyArgIndex + 1])
  : Number.NaN;
const ASYNC_CONCURRENCY = Number.isFinite(parsedAsyncConcurrency) && parsedAsyncConcurrency > 0
  ? Math.min(4, Math.max(1, Math.floor(parsedAsyncConcurrency)))
  : 2;
if (batchSizeArgIndex >= 0 && (!Number.isFinite(parsedBatchSize) || parsedBatchSize <= 0)) {
  console.warn('WARN: Invalid --batch-size value provided. Falling back to 32.');
}

// ── Env ───────────────────────────────────────────────────────────────────────
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const GEMINI_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = (process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001').trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}
if (!VERIFY_ONLY && !GEMINI_KEY) {
  console.error('ERROR: Set GEMINI_API_KEY for embeddings.');
  process.exit(1);
}
if (ASYNC_BATCH && !GEMINI_KEY) {
  console.error('ERROR: Gemini asynchronous batch ingestion requires GEMINI_API_KEY.');
  process.exit(1);
}

const PROVIDER = 'gemini';
const EMBEDDING_DIM = 1024;
const EMBEDDING_MODEL = GEMINI_MODEL;
const EMBEDDING_TIMEOUT_MS = Math.max(30_000, Number(process.env.EMBEDDING_REQUEST_TIMEOUT_MS) || 180_000);
console.log(`Provider: ${PROVIDER}  |  Model: ${EMBEDDING_MODEL}  |  Dimensions: ${EMBEDDING_DIM}  |  Batch: ${BATCH_SIZE}  |  DryRun: ${DRY_RUN}`);
if (ASYNC_BATCH) {
  console.log(`Async batch: enabled  |  Job size: ${ASYNC_BATCH_SIZE}  |  Concurrency: ${ASYNC_CONCURRENCY}`);
}

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
function normalizeEmbedding(values) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? values.map((value) => value / norm) : values;
}

function errorWithStatus(message, status, body = '', retryAfterMs = 0) {
  const error = new Error(`${message}: ${status} ${body}`.trim());
  error.status = status;
  error.retryAfterMs = retryAfterMs;
  return error;
}

function parseRetryDelayMs(body, retryAfterHeader) {
  const headerSeconds = Number(retryAfterHeader);
  if (Number.isFinite(headerSeconds) && headerSeconds > 0) return Math.ceil(headerSeconds * 1000);
  const match = String(body).match(/"retryDelay"\s*:\s*"([0-9.]+)s"/i);
  return match ? Math.ceil(Number(match[1]) * 1000) : 0;
}

async function geminiJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    headers: {
      'x-goog-api-key': GEMINI_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw errorWithStatus(
      'Gemini request failed',
      response.status,
      body.slice(0, 800),
      parseRetryDelayMs(body, response.headers.get('retry-after'))
    );
  }
  return response.json();
}

async function embedGemini(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  const modelPath = `models/${GEMINI_MODEL.replace(/^models\//, '')}`;
  const payload = await geminiJson(
    `https://generativelanguage.googleapis.com/v1beta/${modelPath}:batchEmbedContents`,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: modelPath,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: EMBEDDING_DIM,
        })),
      }),
    }
  );
  return (payload.embeddings ?? []).map((item) => normalizeEmbedding(item.values ?? []));
}

async function createGeminiAsyncBatch(chunks) {
  const modelPath = `models/${GEMINI_MODEL.replace(/^models\//, '')}`;
  const displayName = `vidyapath-${Date.now()}-${chunks[0]?.id?.slice(0, 24) ?? 'batch'}`
    .replace(/[^a-zA-Z0-9_-]/g, '-');
  const operation = await geminiJson(
    `https://generativelanguage.googleapis.com/v1beta/${modelPath}:asyncBatchEmbedContent`,
    {
      method: 'POST',
      body: JSON.stringify({
        batch: {
          model: modelPath,
          displayName,
          inputConfig: {
            requests: {
              requests: chunks.map((chunk) => ({
                request: {
                  model: modelPath,
                  content: { parts: [{ text: chunk.text.slice(0, 2048) }] },
                  taskType: 'RETRIEVAL_DOCUMENT',
                  outputDimensionality: EMBEDDING_DIM,
                },
                metadata: { chunkId: chunk.id },
              })),
            },
          },
        },
      }),
    }
  );
  if (!operation?.name || !String(operation.name).startsWith('batches/')) {
    throw new Error(`Gemini did not return a batch operation name: ${JSON.stringify(operation).slice(0, 500)}`);
  }
  return operation.name;
}

function extractAsyncBatchResponses(operation) {
  const batch = operation?.response?.batch ?? operation?.response ?? operation?.metadata?.batch;
  return batch?.output?.inlinedResponses?.inlinedResponses
    ?? batch?.dest?.inlinedEmbedContentResponses
    ?? batch?.dest?.inlinedResponses
    ?? [];
}

async function waitForGeminiAsyncBatch(name) {
  let polls = 0;
  while (true) {
    const operation = await geminiJson(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      method: 'GET',
    });
    if (operation?.error) {
      throw new Error(`Gemini batch ${name} failed: ${JSON.stringify(operation.error).slice(0, 800)}`);
    }
    if (operation?.done) return operation;
    polls += 1;
    if (polls % 6 === 0) process.stdout.write(`\n  Waiting for ${name}…`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

function rowsFromAsyncBatch(chunks, operation) {
  const responses = extractAsyncBatchResponses(operation);
  if (responses.length !== chunks.length) {
    throw new Error(
      `Gemini batch response mismatch: expected ${chunks.length}, received ${responses.length}. `
      + `Payload keys: ${Object.keys(operation?.response ?? {}).join(',')}`
    );
  }

  return responses.map((item, index) => {
    if (item?.error) {
      throw new Error(`Gemini batch item failed: ${JSON.stringify(item.error).slice(0, 500)}`);
    }
    const chunkId = item?.metadata?.chunkId;
    const chunk = chunkId ? chunks.find((candidate) => candidate.id === chunkId) : chunks[index];
    const values = normalizeEmbedding(item?.response?.embedding?.values ?? []);
    if (!chunk || values.length !== EMBEDDING_DIM) {
      throw new Error(
        `Gemini batch item ${index} returned ${values.length} dimensions for ${chunkId ?? 'unknown chunk'}.`
      );
    }
    return buildRow(chunk, values);
  });
}

async function embedBatch(texts) {
  return embedGemini(texts);
}

function isUsableChunk(chunk) {
  if (!chunk || typeof chunk !== 'object') return false;
  const text = typeof chunk.text === 'string' ? chunk.text.trim() : '';
  return text.length > 0;
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

async function upsertRowsInSlices(rows, sliceSize = 32) {
  for (let index = 0; index < rows.length; index += sliceSize) {
    await withRetry(() => upsertRows(rows.slice(index, index + sliceSize)), 5, 1_000);
  }
}

function buildRow(chunk, embedding) {
  return {
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
    embedding: `[${embedding.join(',')}]`,
  };
}

// ── Retry with exponential backoff ────────────────────────────────────────────
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 500) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = Number(err?.status) || 0;
      const retryable = !status || status === 408 || status === 409 || status === 429 || status >= 500;
      if (!retryable) throw err;
      if (attempt < maxAttempts) {
        const requestedDelay = Number(err?.retryAfterMs) || 0;
        const delay = Math.max(requestedDelay, baseDelayMs * Math.pow(2, attempt - 1));
        process.stderr.write(`\n  Attempt ${attempt}/${maxAttempts} failed: ${err.message}. Retrying in ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── Existing IDs (for --skip-existing) ───────────────────────────────────────
let existingIds = new Set();
async function loadExistingIds(force = false) {
  if (!force && !UPSERT_ONLY_MISSING) return;
  console.log('Loading existing IDs from Supabase…');
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/document_embeddings?select=id&limit=${pageSize}&offset=${offset}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Could not read document_embeddings: ${res.status} ${body.slice(0, 300)}`);
    }
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
  if (PROBE_ONLY) {
    const embeddings = await embedBatch(['VidyaPath embedding readiness probe']);
    const dimension = embeddings[0]?.length ?? 0;
    if (embeddings.length !== 1 || dimension !== EMBEDDING_DIM) {
      throw new Error(`Embedding probe returned ${dimension} dimensions; expected ${EMBEDDING_DIM}.`);
    }
    console.log(`Probe successful: ${EMBEDDING_MODEL} returned ${dimension} dimensions.`);
    return;
  }

  if (ASYNC_PROBE_ONLY) {
    const probeChunks = [
      { id: 'vidyapath-async-probe-1', text: 'Photosynthesis converts light energy into chemical energy.' },
      { id: 'vidyapath-async-probe-2', text: 'Newton second law relates force, mass, and acceleration.' },
    ];
    const name = await withRetry(() => createGeminiAsyncBatch(probeChunks), 5, 2_000);
    console.log(`Created probe batch: ${name}`);
    const operation = await waitForGeminiAsyncBatch(name);
    const rows = rowsFromAsyncBatch(probeChunks, operation);
    console.log(`Async probe successful: ${rows.length} embeddings at ${EMBEDDING_DIM} dimensions.`);
    return;
  }

  await loadExistingIds(VERIFY_ONLY);

  let allChunks = [];
  for (const file of CHUNK_FILES) {
    const chunks = await readChunks(file);
    console.log(`  ${chunks.length} chunks from ${file}`);
    allChunks = allChunks.concat(chunks);
  }

  const beforeSanitize = allChunks.length;
  allChunks = allChunks
    .filter(isUsableChunk)
    .map((chunk) => ({ ...chunk, text: chunk.text.trim() }));
  const droppedInvalid = beforeSanitize - allChunks.length;
  if (droppedInvalid > 0) {
    console.log(`  Dropped ${droppedInvalid} empty/invalid chunks before ingest.`);
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

  if (VERIFY_ONLY) {
    const corpusIds = new Set(allChunks.map((chunk) => chunk.id));
    let covered = 0;
    for (const id of corpusIds) if (existingIds.has(id)) covered += 1;
    const missing = corpusIds.size - covered;
    const extra = [...existingIds].filter((id) => !corpusIds.has(id)).length;
    const coverage = corpusIds.size > 0 ? ((covered / corpusIds.size) * 100).toFixed(2) : '0.00';
    console.log(`Corpus chunks: ${corpusIds.size}`);
    console.log(`Remote embedding rows: ${existingIds.size}`);
    console.log(`Covered corpus chunks: ${covered}`);
    console.log(`Missing corpus chunks: ${missing}`);
    console.log(`Remote rows outside current corpus: ${extra}`);
    console.log(`Coverage: ${coverage}%`);
    if (missing > 0 || extra > 0) process.exitCode = 2;
    return;
  }

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

  if (ASYNC_BATCH) {
    const jobs = [];
    for (let index = 0; index < allChunks.length; index += ASYNC_BATCH_SIZE) {
      jobs.push(allChunks.slice(index, index + ASYNC_BATCH_SIZE));
    }

    let nextJob = 0;
    async function worker(workerNumber) {
      while (nextJob < jobs.length) {
        const jobIndex = nextJob++;
        const chunks = jobs[jobIndex];
        try {
          const name = await withRetry(() => createGeminiAsyncBatch(chunks), 5, 2_000);
          console.log(`\n  Worker ${workerNumber}: submitted job ${jobIndex + 1}/${jobs.length} (${chunks.length} chunks) as ${name}`);
          const operation = await waitForGeminiAsyncBatch(name);
          const rows = rowsFromAsyncBatch(chunks, operation);
          await upsertRowsInSlices(rows);
          ingested += rows.length;
          console.log(`\n  ${ingested}/${allChunks.length} ingested (${jobs.length - nextJob} jobs not yet submitted)`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`\n  Async job ${jobIndex + 1}/${jobs.length} failed: ${message}`);
          errors += chunks.length;
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(ASYNC_CONCURRENCY, jobs.length) }, (_, index) => worker(index + 1))
    );
    console.log(`\nDone. Ingested: ${ingested}  Errors: ${errors}`);
    if (errors > 0) process.exitCode = 1;
    return;
  }

  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    if (batch.length === 0) continue;
    const texts = batch.map((c) => c.text.slice(0, 2048)).filter((text) => text.length > 0);
    if (texts.length === 0) {
      errors += batch.length;
      continue;
    }

    try {
      await withRetry(async () => {
        const embeddings = await embedBatch(texts);
        if (embeddings.length !== batch.length || embeddings.some((embedding) => embedding.length !== EMBEDDING_DIM)) {
          throw new Error(
            `Embedding shape mismatch from ${EMBEDDING_MODEL}: expected ${batch.length} x ${EMBEDDING_DIM}.`
          );
        }
        const rows = batch.map((chunk, idx) => buildRow(chunk, embeddings[idx]));
        await upsertRows(rows);
      });
      ingested += batch.length;
      process.stdout.write(`\r  ${ingested}/${allChunks.length} ingested`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n  Batch ${Math.floor(i / BATCH_SIZE) + 1} failed after 3 attempts: ${message}`);
      errors += batch.length;
    }

    // Gemini free-tier quota counts each input in batchEmbedContents as one request.
    // Keep synchronous ingestion below 100 embedded inputs per rolling minute.
    const delayMs = Math.ceil((batch.length / 96) * 60_000) + 750;
    await new Promise((r) => setTimeout(r, delayMs));
  }

  console.log(`\n\nDone. Ingested: ${ingested}  Errors: ${errors}`);
  if (errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
