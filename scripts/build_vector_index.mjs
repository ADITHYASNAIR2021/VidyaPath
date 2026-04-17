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
 * This uses the same hashed embedding shape as runtime retriever (192 dims),
 * so no paid vector DB is required for beta.
 */

import fs from 'node:fs';
import path from 'node:path';

const EMBEDDING_DIM = 192;
const root = process.cwd();
const contextDir = path.join(root, 'lib', 'context');
const chunkPaths = [
  path.join(contextDir, 'chunks.jsonl'),
  path.join(contextDir, 'textbook_chunks.jsonl'),
];
const outPath = path.join(contextDir, 'chunk_vectors.jsonl');

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

function main() {
  const chunks = parseChunks();
  if (chunks.length === 0) {
    console.error('[vector-index] No chunk records found. Build context first.');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(contextDir, { recursive: true });
  const seen = new Set();
  const out = [];

  for (const chunk of chunks) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    const embedding = Array.from(buildEmbedding(chunk.text));
    out.push(JSON.stringify({ id: chunk.id, embedding }));
  }

  fs.writeFileSync(outPath, `${out.join('\n')}\n`, 'utf8');
  console.log(`[vector-index] Wrote ${out.length} embeddings -> ${path.relative(root, outPath)}`);
}

main();
