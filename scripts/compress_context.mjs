#!/usr/bin/env node
/**
 * Compress RAG context files with gzip for storage/distribution.
 * Reads raw .jsonl/.json files, writes .gz alongside them.
 *
 * Usage:
 *   node scripts/compress_context.mjs
 *   node scripts/compress_context.mjs --decompress   (extract .gz back to raw)
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join, extname } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = join(import.meta.dirname, '..');
const CONTEXT_DIR = join(ROOT, 'lib', 'context');

const { values: flags } = parseArgs({
  args: process.argv.slice(2),
  options: {
    decompress: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (flags.help) {
  console.log(`
Usage: node scripts/compress_context.mjs [--decompress]

Compresses context files with gzip for efficient storage.
  --decompress   Extract .gz files back to raw .jsonl/.json
  `);
  process.exit(0);
}

const FILES = [
  'chunks.jsonl',
  'textbook_chunks.jsonl',
  'chunk_vectors.jsonl',
  'retrieval_index.json',
  'chapter_index.json',
  'textbook_chapter_index.json',
];

if (flags.decompress) {
  // Decompress .gz → raw
  for (const file of FILES) {
    const gzPath = join(CONTEXT_DIR, file + '.gz');
    const rawPath = join(CONTEXT_DIR, file);
    if (!existsSync(gzPath)) {
      console.log(`  SKIP  ${file}.gz (not found)`);
      continue;
    }
    const compressed = readFileSync(gzPath);
    const raw = gunzipSync(compressed);
    writeFileSync(rawPath, raw);
    const ratio = (compressed.length / raw.length * 100).toFixed(1);
    console.log(`  OK    ${file}.gz → ${file} (${ratio}% of original)`);
  }
} else {
  // Compress raw → .gz
  for (const file of FILES) {
    const rawPath = join(CONTEXT_DIR, file);
    if (!existsSync(rawPath)) {
      console.log(`  SKIP  ${file} (not found)`);
      continue;
    }
    const raw = readFileSync(rawPath);
    const compressed = gzipSync(raw, { level: 9 });
    const gzPath = join(CONTEXT_DIR, file + '.gz');
    writeFileSync(gzPath, compressed);
    const ratio = (compressed.length / raw.length * 100).toFixed(1);
    const origMB = (raw.length / (1024 * 1024)).toFixed(1);
    const compMB = (compressed.length / (1024 * 1024)).toFixed(1);
    console.log(`  OK    ${file} (${origMB} MB → ${compMB} MB, ${ratio}%)`);
  }
}

console.log('\nDone.');
