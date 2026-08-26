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
const textbookChunksPath = path.join(root, 'lib', 'context', 'textbook_chunks.jsonl');
const indexPath = path.join(root, 'lib', 'context', 'chapter_index.json');
const textbookIndexPath = path.join(root, 'lib', 'context', 'textbook_chapter_index.json');
const retrievalIndexPath = path.join(root, 'lib', 'context', 'retrieval_index.json');
const paperImageManifestPath = path.join(root, 'lib', 'context', 'paper_image_manifest.json');
const textbookImageManifestPath = path.join(root, 'lib', 'context', 'textbook_image_manifest.json');
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

  const chunkPayloads = [chunksPath];
  if (fs.existsSync(textbookChunksPath)) {
    chunkPayloads.push(textbookChunksPath);
  }
  const lines = chunkPayloads.flatMap((filePath) =>
    fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  );

  const parsedById = new Map();
  let validRecords = 0;
  for (const line of lines) {
    try {
      const chunk = JSON.parse(line);
      if (!chunk?.id) continue;
      validRecords += 1;
      if (!parsedById.has(String(chunk.id))) parsedById.set(String(chunk.id), chunk);
    } catch {
      // Ignore malformed lines but keep counting valid data
    }
  }
  const parsed = [...parsedById.values()];
  const duplicateRecords = validRecords - parsed.length;

  const index = readJson(indexPath, {});
  const textbookIndex = fs.existsSync(textbookIndexPath) ? readJson(textbookIndexPath, {}) : {};
  const hfIndex = readJson(hfIndexPath, {});
  const retrievalIndex = fs.existsSync(retrievalIndexPath) ? readJson(retrievalIndexPath, {}) : {};
  const paperImageManifest = fs.existsSync(paperImageManifestPath) ? readJson(paperImageManifestPath, {}) : {};
  const textbookImageManifest = fs.existsSync(textbookImageManifestPath) ? readJson(textbookImageManifestPath, {}) : {};
  const total = parsed.length;
  const mapped = parsed.filter((item) => typeof item.chapterId === 'string' && item.chapterId.trim()).length;
  const unmapped = total - mapped;
  const textbookChunks = parsed.filter((item) => item.sourceType === 'textbook').length;
  const imageOcrChunks = parsed.filter((item) => item.sourceType === 'image-ocr').length;
  const visualTaggedChunks = parsed.filter((item) => Array.isArray(item.visualTags) && item.visualTags.length > 0).length;
  const years = parsed.map((item) => Number(item.year)).filter((year) => Number.isFinite(year));
  const pre2019 = years.filter((year) => year < 2019).length;
  const minYear = years.length ? Math.min(...years) : null;
  const maxYear = years.length ? Math.max(...years) : null;
  const subjects = [...new Set(parsed.map((item) => `${item.classLevel}|${item.subject}`))].sort();

  console.log(`[verify:context] chunks=${total} unique, duplicateRecords=${duplicateRecords}, mapped=${mapped}, unmapped=${unmapped}`);
  console.log(`[verify:context] yearRange=${minYear ?? 'N/A'}-${maxYear ?? 'N/A'}, pre2019=${pre2019}`);
  console.log(`[verify:context] subjectBuckets=${subjects.length}`);
  if (subjects.length > 0) {
    console.log(`[verify:context] subjectBucketsList=${subjects.join(', ')}`);
  }

  const indexStats = index?.stats ?? {};
  const indexChapters = index?.chapters ? Object.keys(index.chapters).length : 0;
  const textbookIndexChapters = textbookIndex?.chapters ? Object.keys(textbookIndex.chapters).length : 0;
  const hfKeys = hfIndex ? Object.keys(hfIndex) : [];
  const commerceKeys = hfKeys.filter(
    (key) => key.includes('|Accountancy|') || key.includes('|Business Studies|') || key.includes('|Economics|')
  ).length;
  const englishCoreKeys = hfKeys.filter((key) => key.includes('|English Core|')).length;
  console.log(
    `[verify:context] indexStats.chunks=${indexStats.chunks ?? 'N/A'}, indexChapters=${indexChapters}`
  );
  console.log(
    `[verify:context] textbook.chunks=${textbookChunks}, textbook.indexChapters=${textbookIndexChapters}`
  );
  console.log(
    `[verify:context] retrievalIndex.docs=${Array.isArray(retrievalIndex?.docs) ? retrievalIndex.docs.length : 0}, retrievalIndex.chapters=${retrievalIndex?.chapters ? Object.keys(retrievalIndex.chapters).length : 0}`
  );
  const paperImages = Array.isArray(paperImageManifest?.images) ? paperImageManifest.images : [];
  const textbookImages = Array.isArray(textbookImageManifest?.images) ? textbookImageManifest.images : [];
  const visualDocs = Array.isArray(retrievalIndex?.docs)
    ? retrievalIndex.docs.filter((doc) => doc?.kind === 'visual').length
    : 0;
  console.log(`[verify:context] imageOcrChunks=${imageOcrChunks}, visualTaggedChunks=${visualTaggedChunks}`);
  console.log(
    `[verify:context] visualAssets.paper=${paperImages.length}, visualAssets.textbook=${textbookImages.length}, retrievalIndex.visualDocs=${visualDocs}`
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
    console.warn(`[verify:context] WARN: Found ${unmapped} chunk(s) with null/empty chapterId (kept for broad retrieval).`);
  }
  if (commerceKeys === 0) {
    console.error('[verify:context] FAIL: hfPaperIndex has 0 commerce keys (Accountancy/Business Studies/Economics).');
    process.exitCode = 1;
    return;
  }
  for (const manifest of [paperImageManifest, textbookImageManifest]) {
    const images = Array.isArray(manifest?.images) ? manifest.images : [];
    const broken = images.filter((entry) => {
      if (!entry?.imagePath) return true;
      return !fs.existsSync(path.join(root, 'lib', 'context', String(entry.imagePath).replace(/\//g, path.sep)));
    }).length;
    if (broken > 0) {
      console.error(`[verify:context] FAIL: ${broken} visual asset(s) referenced in manifests are missing on disk.`);
      process.exitCode = 1;
      return;
    }
  }
  if ((paperImageManifest?.saveImagesEnabled && paperImages.length === 0) || (textbookImageManifest?.saveImagesEnabled && textbookImages.length === 0)) {
    console.error('[verify:context] FAIL: image saving was enabled but no visual assets were emitted.');
    process.exitCode = 1;
    return;
  }

  console.log('[verify:context] PASS');
}

main();
