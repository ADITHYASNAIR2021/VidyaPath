#!/usr/bin/env node
/**
 * Build a local/free vector index from context chunks.
 *
 * Input:
 *   - lib/context/chunks.jsonl
 *   - lib/context/textbook_chunks.jsonl (if present)
 *
 * Output:
 *   - lib/context/chunk_vectors.jsonl
 *
 * VECTOR_PROVIDER=local (default): multilingual-e5-small, free local inference.
 * VECTOR_PROVIDER=nvidia: hosted Nemotron, subject to trial terms and quota.
 * VECTOR_PROVIDER=lexical: explicit non-semantic baseline.
 * Never mix model spaces or replace a valid index after a partial build failure.
 */

import fs from 'node:fs';
import path from 'node:path';

const EMBEDDING_DIM = 192;
const ONNX_EMBEDDING_DIM = 384;
const ONNX_MODEL = process.env.LOCAL_EMBED_MODEL || 'Xenova/multilingual-e5-small';
const NVIDIA_EMBED_MODEL = process.env.AI_EMBED_MODEL || 'nvidia/nemotron-3-embed-1b';
const provider = process.env.VECTOR_PROVIDER || 'local';
if (!['local', 'nvidia', 'lexical'].includes(provider)) throw new Error('VECTOR_PROVIDER must be local, nvidia or lexical');
const root = process.cwd();
const contextDir = path.join(root, 'lib', 'context');
const chunkPaths = [
  path.join(contextDir, 'chunks.jsonl'),
  path.join(contextDir, 'textbook_chunks.jsonl'),
];
const outPath = path.join(contextDir, 'chunk_vectors.jsonl');

let onnxPipeline = null;
async function initOnnxPipeline() {
  if (onnxPipeline) return onnxPipeline;
  try {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;
    env.cacheDir = path.join(root, '.cache', 'embeddings');
    onnxPipeline = await pipeline('feature-extraction', ONNX_MODEL, { dtype: /e5/i.test(ONNX_MODEL) ? 'q8' : 'fp32' });
    console.log(`[vector-index] ONNX model loaded: ${ONNX_MODEL}`);
    return onnxPipeline;
  } catch {
    return null;
  }
}

async function buildOnnxEmbedding(text) {
  const pipe = await initOnnxPipeline();
  if (!pipe) return null;
  try {
    const input = /e5/i.test(ONNX_MODEL) ? `passage: ${text}` : text;
    const output = await pipe(input, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch {
    return null;
  }
}

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z]{3,}|[\u0900-\u097f]{2,}/g) ?? []).filter((token) => {
    if (/^[a-z]{3,}$/.test(token)) {
      return !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'board', 'class', 'paper'].includes(token);
    }
    return true;
  });
}

function hashToken(token) {
  let hash = 2166136261;
  for (let idx = 0; idx < token.length; idx++) {
    hash ^= token.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildEmbedding(text) {
  const vec = new Float32Array(EMBEDDING_DIM);
  const tokens = tokenize(text || '');
  if (tokens.length === 0) return vec;
  for (const token of tokens) {
    const index = hashToken(token) % EMBEDDING_DIM;
    vec[index] += 1;
  }
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  if (norm > 0) {
    const inv = 1 / Math.sqrt(norm);
    for (let i = 0; i < vec.length; i++) vec[i] *= inv;
  }
  return vec;
}

function isUsableNvidiaApiKey(value) {
  if (!value || typeof value !== 'string') return false;
  const normalized = value.trim();
  if (!normalized.startsWith('nvapi-')) return false;
  const compact = normalized.toLowerCase().replace(/\s+/g, '');
  return !['placeholder', 'replace', 'changeme', 'your_nvidia_api_key_here'].some((tag) => compact.includes(tag));
}

async function createNvidiaEmbeddings(apiKey, inputs) {
  const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: NVIDIA_EMBED_MODEL,
      input: inputs,
      encoding_format: 'float',
      input_type: 'passage',
      truncate: 'END',
    }),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`NVIDIA embeddings failed: ${response.status} ${err.slice(0, 300)}`);
  }
  const payload = await response.json();
  return (payload.data ?? []).map((item) => item?.embedding).filter((embedding) => Array.isArray(embedding) && embedding.length > 0);
}

function parseChunks() {
  const chunks = [];
  for (const filePath of chunkPaths) {
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (!parsed || typeof parsed !== 'object') continue;
        if (typeof parsed.id !== 'string' || typeof parsed.text !== 'string') continue;
        chunks.push({ id: parsed.id, text: parsed.text });
      } catch {
        continue;
      }
    }
  }
  return chunks;
}

async function main() {
  const chunks = parseChunks();
  if (chunks.length === 0) {
    console.error('[vector-index] No chunk records found. Build context first.');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(contextDir, { recursive: true });
  const seen = new Set();
  const out = [];
  const nvidiaKey = process.env.NVIDIA_API_KEY?.trim();
  const canUseNvidia = provider === 'nvidia' && isUsableNvidiaApiKey(nvidiaKey);
  if (provider === 'nvidia' && !canUseNvidia) throw new Error('NVIDIA_API_KEY is required for VECTOR_PROVIDER=nvidia');
  const uniqueChunks = [];

  for (const chunk of chunks) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    uniqueChunks.push(chunk);
  }

  // Probe ONNX availability before the main loop (downloads model once)
  const onnxAvailable = provider === 'local' && (await initOnnxPipeline()) !== null;
  if (provider === 'local' && !onnxAvailable) throw new Error('Local model unavailable. Existing vectors preserved. Use VECTOR_PROVIDER=lexical explicitly for lexical vectors.');
  if (onnxAvailable) {
    console.log('[vector-index] Using ONNX local document embeddings (384 dim), no inference API key. Semantic queries still require the matching encoder at runtime.');
  } else if (!canUseNvidia) {
    console.warn('[vector-index] WARNING: No semantic embedding available. Falling back to hashed bag-of-words (NOT semantic).');
    console.warn('[vector-index] Install @huggingface/transformers for free local semantic embeddings: npm install @huggingface/transformers');
  }

  if (canUseNvidia) {
    const batchSize = 24;
    for (let start = 0; start < uniqueChunks.length; start += batchSize) {
      const batch = uniqueChunks.slice(start, start + batchSize);
      try {
        const embeddings = await createNvidiaEmbeddings(nvidiaKey, batch.map((chunk) => chunk.text.slice(0, 5000)));
        if (embeddings.length === batch.length) {
          for (let idx = 0; idx < batch.length; idx++) {
            out.push(
              JSON.stringify({
                id: batch[idx].id,
                embeddingKind: 'nvidia-e5',
                embeddingModel: NVIDIA_EMBED_MODEL,
                embedding: embeddings[idx],
              })
            );
          }
          continue;
        }
      } catch (error) {
        throw new Error(`NVIDIA batch failed; existing index preserved: ${String(error.message || error)}`);
      }
      throw new Error('NVIDIA returned an incomplete embedding batch; existing index preserved');
    }
  } else if (onnxAvailable) {
    const batchSize = 8;
    let done = 0;
    for (let start = 0; start < uniqueChunks.length; start += batchSize) {
      const batch = uniqueChunks.slice(start, start + batchSize);
      for (const chunk of batch) {
        const onnxEmbed = await buildOnnxEmbedding(chunk.text);
        if (onnxEmbed && onnxEmbed.length === ONNX_EMBEDDING_DIM) {
          out.push(JSON.stringify({ id: chunk.id, embeddingKind: 'onnx-minilm', embeddingModel: ONNX_MODEL, embedding: onnxEmbed }));
        } else {
          throw new Error(`Local embedding failed for ${chunk.id}; existing index preserved`);
        }
        done += 1;
      }
      if (done % 200 === 0) process.stdout.write(`\r[vector-index] ONNX progress: ${done}/${uniqueChunks.length}`);
    }
    if (done > 0) process.stdout.write('\n');
  } else {
    for (const chunk of uniqueChunks) {
      out.push(
        JSON.stringify({
          id: chunk.id,
          embeddingKind: 'hashed-bow',
          embeddingModel: 'local-hashed-bow',
          embedding: Array.from(buildEmbedding(chunk.text)),
        })
      );
    }
  }

  const kinds = new Set(out.map((line) => { try { return JSON.parse(line).embeddingKind; } catch { return 'unknown'; } }));
  if (kinds.size !== 1 || (provider === 'local' && !kinds.has('onnx-minilm')) || (provider === 'nvidia' && !kinds.has('nvidia-e5'))) {
    throw new Error('Embedding failed or produced mixed model spaces. Existing vector index preserved; retry the build.');
  }
  const payload = `${out.join('\n')}\n`;
  const tmpPath = outPath + '.tmp';
  fs.writeFileSync(tmpPath, payload, 'utf8');
  try { fs.renameSync(tmpPath, outPath); } catch { fs.writeFileSync(outPath, payload, 'utf8'); try { fs.unlinkSync(tmpPath); } catch {} }
  console.log(
    `[vector-index] Wrote ${out.length} embeddings -> ${path.relative(root, outPath)} (kinds: ${[...kinds].join(', ')})`
  );
}

await main();
