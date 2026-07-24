#!/usr/bin/env node
/**
 * Writes .rag_count.json for fast health-check lookups.
 * Run after any RAG rebuild to keep the counter in sync.
 *
 * Usage: node scripts/write_rag_count.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTEXT_DIR = join(import.meta.dirname, '..', 'lib', 'context');
const FILES = ['chunks.jsonl', 'textbook_chunks.jsonl'];

let total = 0;
for (const file of FILES) {
  const fullPath = join(CONTEXT_DIR, file);
  try {
    const content = readFileSync(fullPath, 'utf-8');
    const count = content.split('\n').filter(Boolean).length;
    total += count;
    console.log(`  ${file}: ${count.toLocaleString()} chunks`);
  } catch {
    // File doesn't exist — skip
  }
}

const countPath = join(CONTEXT_DIR, '.rag_count.json');
writeFileSync(countPath, JSON.stringify({
  chunks: total,
  updatedAt: new Date().toISOString(),
}, null, 2));

console.log(`\n  Wrote .rag_count.json: ${total.toLocaleString()} total chunks (${JSON.stringify({chunks: total}).length} bytes)`);
