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

const uniqueIds = new Set();
const sourceCounts = {};
let records = 0;
for (const file of FILES) {
  const fullPath = join(CONTEXT_DIR, file);
  try {
    const content = readFileSync(fullPath, 'utf-8');
    let count = 0;
    for (const line of content.split('\n').filter(Boolean)) {
      try {
        const chunk = JSON.parse(line);
        if (!chunk?.id) continue;
        count += 1;
        records += 1;
        uniqueIds.add(String(chunk.id));
      } catch {
        // Malformed records are excluded from the health count.
      }
    }
    sourceCounts[file] = count;
    console.log(`  ${file}: ${count.toLocaleString()} valid records`);
  } catch {
    // File doesn't exist — skip
  }
}

const countPath = join(CONTEXT_DIR, '.rag_count.json');
writeFileSync(countPath, JSON.stringify({
  chunks: uniqueIds.size,
  records,
  duplicates: records - uniqueIds.size,
  sourceCounts,
  updatedAt: new Date().toISOString(),
}, null, 2));

console.log(`\n  Wrote .rag_count.json: ${uniqueIds.size.toLocaleString()} unique chunks (${(records - uniqueIds.size).toLocaleString()} duplicate records excluded)`);
