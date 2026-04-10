#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const datasetRoot = path.join(root, 'dataset', 'cbse_papers');
const hfIndexPath = path.join(root, 'lib', 'hfPaperIndex.json');
const chapterIndexPath = path.join(root, 'lib', 'context', 'chapter_index.json');

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function pct(part, whole) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 10000) / 100;
}

function main() {
  const files = walkFiles(datasetRoot, []);
  const metadata = files.filter((file) => file.endsWith('.metadata'));
  const unknownMetadata = metadata.filter((file) => file.includes(`${path.sep}Unknown${path.sep}`)).length;
  const class12Metadata = metadata.filter((file) => file.includes(`${path.sep}Class_12${path.sep}`));
  const class12Unknown = class12Metadata.filter((file) => file.includes(`${path.sep}Unknown${path.sep}`)).length;

  const hfIndex = fs.existsSync(hfIndexPath)
    ? JSON.parse(fs.readFileSync(hfIndexPath, 'utf8'))
    : {};
  const hfKeys = Object.keys(hfIndex);
  const commerceKeys = hfKeys.filter(
    (key) => key.includes('|Accountancy|') || key.includes('|Business Studies|') || key.includes('|Economics|')
  ).length;

  let broken = 0;
  for (const rel of Object.values(hfIndex)) {
    const full = path.join(datasetRoot, String(rel || '').replace(/\//g, path.sep));
    if (!fs.existsSync(full)) broken += 1;
  }
  const brokenRatio = pct(broken, Math.max(1, hfKeys.length));

  const chapterIndex = fs.existsSync(chapterIndexPath)
    ? JSON.parse(fs.readFileSync(chapterIndexPath, 'utf8'))
    : {};
  const chapterMap = chapterIndex?.chapters ?? {};
  const totalChapters = Object.keys(chapterMap).length;
  const emptyChapters = Object.values(chapterMap).filter((list) => !Array.isArray(list) || list.length === 0).length;
  const chapterCoveragePct = pct(totalChapters - emptyChapters, Math.max(1, totalChapters));

  console.log(`[quality] metadata.total=${metadata.length}`);
  console.log(`[quality] metadata.unknown=${unknownMetadata} (${pct(unknownMetadata, metadata.length)}%)`);
  console.log(`[quality] class12.unknown=${class12Unknown}/${class12Metadata.length} (${pct(class12Unknown, class12Metadata.length)}%)`);
  console.log(`[quality] hfIndex.total=${hfKeys.length} commerceKeys=${commerceKeys}`);
  console.log(`[quality] hfIndex.broken=${broken} (${brokenRatio}%)`);
  console.log(`[quality] chapterCoverage=${chapterCoveragePct}%`);

  let fail = false;
  if (commerceKeys === 0) {
    console.error('[quality] FAIL: commerce keys missing in hfPaperIndex.');
    fail = true;
  }
  if (pct(unknownMetadata, metadata.length) > 20) {
    console.error('[quality] FAIL: unknown metadata ratio too high (>20%).');
    fail = true;
  }
  if (brokenRatio > 5) {
    console.error('[quality] FAIL: hf index broken URL ratio too high (>5%).');
    fail = true;
  }
  if (chapterCoveragePct < 85) {
    console.error('[quality] FAIL: chapter coverage too low (<85%).');
    fail = true;
  }

  if (fail) {
    process.exitCode = 1;
    return;
  }
  console.log('[quality] PASS');
}

main();
