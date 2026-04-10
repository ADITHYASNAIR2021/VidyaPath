#!/usr/bin/env node
/**
 * Quick health check for context artifacts.
 * Validates:
 *  - chunks file exists and is non-empty
 *  - chapter index exists
 *  - chapterId mapping coverage
 *  - year range / pre-2019 presence
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const chunksPath = path.join(root, 'lib', 'context', 'chunks.jsonl');
const indexPath = path.join(root, 'lib', 'context', 'chapter_index.json');
const hfIndexPath = path.join(root, 'lib', 'hfPaperIndex.json');

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function main() {
  if (!fs.existsSync(chunksPath)) {
    console.error('[verify:context] Missing file:', chunksPath);
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(indexPath)) {
    console.error('[verify:context] Missing file:', indexPath);
    process.exitCode = 1;
    return;
  }

  const lines = fs
    .readFileSync(chunksPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // Ignore malformed lines but keep counting valid data
    }
  }

  const index = readJson(indexPath, {});
  const hfIndex = readJson(hfIndexPath, {});
  const total = parsed.length;
  const mapped = parsed.filter((item) => typeof item.chapterId === 'string' && item.chapterId.trim()).length;
  const unmapped = total - mapped;
  const years = parsed.map((item) => Number(item.year)).filter((year) => Number.isFinite(year));
  const pre2019 = years.filter((year) => year < 2019).length;
  const minYear = years.length ? Math.min(...years) : null;
  const maxYear = years.length ? Math.max(...years) : null;
  const subjects = [...new Set(parsed.map((item) => `${item.classLevel}|${item.subject}`))].sort();

  console.log(`[verify:context] chunks=${total}, mapped=${mapped}, unmapped=${unmapped}`);
  console.log(`[verify:context] yearRange=${minYear ?? 'N/A'}-${maxYear ?? 'N/A'}, pre2019=${pre2019}`);
  console.log(`[verify:context] subjectBuckets=${subjects.length}`);
  if (subjects.length > 0) {
    console.log(`[verify:context] subjectBucketsList=${subjects.join(', ')}`);
  }

  const indexStats = index?.stats ?? {};
  const indexChapters = index?.chapters ? Object.keys(index.chapters).length : 0;
  const hfKeys = hfIndex ? Object.keys(hfIndex) : [];
  const commerceKeys = hfKeys.filter(
    (key) => key.includes('|Accountancy|') || key.includes('|Business Studies|') || key.includes('|Economics|')
  ).length;
  const englishCoreKeys = hfKeys.filter((key) => key.includes('|English Core|')).length;
  console.log(
    `[verify:context] indexStats.chunks=${indexStats.chunks ?? 'N/A'}, indexChapters=${indexChapters}`
  );
  console.log(`[verify:context] hfIndex.keys=${hfKeys.length}, commerceKeys=${commerceKeys}, englishCoreKeys=${englishCoreKeys}`);
  if (pre2019 === 0) {
    console.warn('[verify:context] WARN: No pre-2019 chunks detected in current artifact.');
  }

  if (total === 0) {
    console.error('[verify:context] FAIL: No chunks found. Run `npm run build:context` again.');
    process.exitCode = 1;
    return;
  }
  if (mapped === 0) {
    console.error('[verify:context] FAIL: No chapter-mapped chunks found.');
    process.exitCode = 1;
    return;
  }
  if (unmapped > 0) {
    console.error(`[verify:context] FAIL: Found ${unmapped} chunk(s) with null/empty chapterId. Rebuild context.`);
    process.exitCode = 1;
    return;
  }
  if (commerceKeys === 0) {
    console.error('[verify:context] FAIL: hfPaperIndex has 0 commerce keys (Accountancy/Business Studies/Economics).');
    process.exitCode = 1;
    return;
  }

  console.log('[verify:context] PASS');
}

main();
