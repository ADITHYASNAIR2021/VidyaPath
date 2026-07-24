#!/usr/bin/env node
/**
 * Upload RAG context files to Supabase Storage.
 *
 * Prerequisites:
 *   1. Create a bucket in Supabase Dashboard → Storage → New Bucket
 *      Name: "context" (public bucket)
 *   2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage:
 *   node scripts/upload_context_to_storage.mjs
 *   node scripts/upload_context_to_storage.mjs --bucket my-bucket
 *
 * After upload, set CONTEXT_CDN_URL in your deployment:
 *   CONTEXT_CDN_URL=https://YOUR_PROJECT.supabase.co/storage/v1/object/public/context
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = join(import.meta.dirname, '..');
const CONTEXT_DIR = join(ROOT, 'lib', 'context');

const { values: flags } = parseArgs({
  args: process.argv.slice(2),
  options: {
    bucket: { type: 'string', default: 'context' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (flags.help) {
  console.log(`
Usage: node scripts/upload_context_to_storage.mjs [--bucket <name>]

Uploads RAG context files to Supabase Storage for CDN distribution.
Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
  `);
  process.exit(0);
}

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const FILES = [
  'chunks.jsonl',
  'textbook_chunks.jsonl',
  'chunk_vectors.jsonl',
  'retrieval_index.json',
  'chapter_index.json',
  'textbook_chapter_index.json',
  '.rag_count.json',
];

async function uploadFile(filePath, fileName) {
  const content = readFileSync(filePath);
  const url = `${SUPABASE_URL}/storage/v1/object/${flags.bucket}/${fileName}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: content,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
  }

  return { url, size: content.length };
}

console.log(`Uploading to Supabase Storage bucket: ${flags.bucket}`);
console.log(`Endpoint: ${SUPABASE_URL}\n`);

let totalSize = 0;
for (const fileName of FILES) {
  const filePath = join(CONTEXT_DIR, fileName);
  if (!existsSync(filePath)) {
    console.log(`  SKIP  ${fileName} (not found)`);
    continue;
  }

  try {
    const result = await uploadFile(filePath, fileName);
    const sizeMB = (result.size / (1024 * 1024)).toFixed(1);
    console.log(`  OK    ${fileName} (${sizeMB} MB)`);
    totalSize += result.size;
  } catch (err) {
    console.error(`  FAIL  ${fileName}: ${err.message}`);
  }
}

const totalMB = (totalSize / (1024 * 1024)).toFixed(1);
console.log(`\nDone. Total: ${totalMB} MB uploaded.`);
console.log(`\nSet in your deployment environment:`);
console.log(`  CONTEXT_CDN_URL=${SUPABASE_URL}/storage/v1/object/public/${flags.bucket}`);
