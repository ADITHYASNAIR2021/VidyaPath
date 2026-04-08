#!/usr/bin/env node
/**
 * Node-based Context Index Builder (no Python required)
 * Generates:
 *   - lib/context/chunks.jsonl
 *   - lib/context/chapter_index.json
 *
 * This builder uses chapter + PYQ metadata + hfPaperIndex mappings to create
 * high-signal chapter-linked retrieval chunks.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataPath = path.join(root, 'lib', 'data.ts');
const pyqPath = path.join(root, 'lib', 'pyq.ts');
const hfIndexPath = path.join(root, 'lib', 'hfPaperIndex.json');
const outDir = path.join(root, 'lib', 'context');
const chunksPath = path.join(outDir, 'chunks.jsonl');
const chapterIndexPath = path.join(outDir, 'chapter_index.json');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeSubject(classLevel, subject) {
  const s = subject.trim();
  if (classLevel === 10 && ['Physics', 'Chemistry', 'Biology'].includes(s)) return 'Science';
  return s;
}

function parseStringList(raw) {
  const items = [];
  const re = /'((?:\\'|[^'])+)'|"((?:\\"|[^"])*)"/g;
  let match;
  while ((match = re.exec(raw))) {
    const singleQuoted = match[1] ? match[1].replace(/\\'/g, "'") : '';
    const doubleQuoted = match[2] ? match[2].replace(/\\"/g, '"') : '';
    const value = (singleQuoted || doubleQuoted).trim();
    if (value) items.push(value);
  }
  return items;
}

function parseChapters() {
  const content = readText(dataPath);
  const re =
    /id:\s*'(?<id>c[^']+)'.*?classLevel:\s*(?<classLevel>\d+).*?subject:\s*'(?<subject>[^']+)'.*?title:\s*'(?<title>(?:\\'|[^'])+)'.*?topics:\s*\[(?<topics>[\s\S]*?)\]\s*,\s*ncertPdfUrl:/gs;
  const chapters = [];
  let match;
  while ((match = re.exec(content))) {
    const chapter = {
      id: match.groups.id,
      classLevel: Number(match.groups.classLevel),
      subject: match.groups.subject,
      title: match.groups.title.replace(/\\'/g, "'"),
      topics: parseStringList(match.groups.topics),
    };
    if (chapter.classLevel === 10 || chapter.classLevel === 12) {
      chapters.push(chapter);
    }
  }
  return chapters;
}

function parsePyq() {
  const content = readText(pyqPath);
  const re =
    /chapterId:\s*'(?<id>c[^']+)'.*?yearsAsked:\s*\[(?<years>[^\]]*)\].*?importantTopics:\s*\[(?<important>[^\]]*)\].*?avgMarks:\s*(?<avg>\d+)/gs;
  const map = new Map();
  let match;
  while ((match = re.exec(content))) {
    const years = match.groups.years
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value));
    const importantTopics = parseStringList(match.groups.important);
    map.set(match.groups.id, {
      yearsAsked: years,
      importantTopics,
      avgMarks: Number(match.groups.avg),
    });
  }
  return map;
}

function parseHfIndex() {
  return JSON.parse(readText(hfIndexPath));
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))];
}

function paperTypeRank(paperType) {
  if (paperType === 'board') return 4;
  if (paperType === 'sample') return 3;
  if (paperType === 'compartment') return 2;
  return 1;
}

function variantRank(classLevel, subject, variant) {
  const v = (variant || '').toLowerCase();
  if (classLevel === 10 && subject === 'Math') {
    if (v === 'standard') return 3;
    if (v === 'default') return 2;
    if (v === 'basic') return 1;
  }
  if (v === 'default') return 2;
  return 1;
}

function buildHfCatalog(hfIndex) {
  const byClassSubject = new Map();
  for (const [key, sourcePath] of Object.entries(hfIndex)) {
    const [paperType, yearRaw, classRaw, subject, variant = 'default'] = key.split('|');
    const year = Number(yearRaw);
    const classLevel = Number(classRaw);
    if (!Number.isFinite(year) || !Number.isFinite(classLevel) || !subject || !sourcePath) continue;

    const catalogKey = `${classLevel}|${subject}`;
    let yearMap = byClassSubject.get(catalogKey);
    if (!yearMap) {
      yearMap = new Map();
      byClassSubject.set(catalogKey, yearMap);
    }

    const current = yearMap.get(year) ?? [];
    current.push({
      sourcePath,
      paperType,
      variant,
      score: paperTypeRank(paperType) * 10 + variantRank(classLevel, subject, variant),
    });
    yearMap.set(year, current);
  }

  for (const yearMap of byClassSubject.values()) {
    for (const [year, entries] of yearMap.entries()) {
      entries.sort((a, b) => b.score - a.score);
      yearMap.set(year, entries);
    }
  }

  return byClassSubject;
}

function getCatalogYears(catalog, classLevel, subject) {
  const normalizedSubject = normalizeSubject(classLevel, subject);
  const yearMap = catalog.get(`${classLevel}|${normalizedSubject}`);
  if (!yearMap) return [];
  return [...yearMap.keys()].sort((a, b) => b - a);
}

function pickYears(pyqYears, catalogYears) {
  const pyq = uniqueNumbers(pyqYears).sort((a, b) => b - a);
  const catalog = uniqueNumbers(catalogYears).sort((a, b) => b - a);
  const combined = uniqueNumbers([...pyq, ...catalog]).sort((a, b) => b - a);
  if (combined.length <= 12) return combined;

  const latest = combined.slice(0, 6);
  const pyqOnlyOlder = pyq.filter((year) => year < 2019).slice(0, 4);
  const middle = combined.slice(6).filter((year) => year >= 2019).slice(0, 2);
  return uniqueNumbers([...latest, ...middle, ...pyqOnlyOlder]).sort((a, b) => b - a);
}

function resolvePaperPath(catalog, classLevel, subject, year) {
  const normalizedSubject = normalizeSubject(classLevel, subject);
  const yearMap = catalog.get(`${classLevel}|${normalizedSubject}`);
  if (!yearMap) return null;
  const entries = yearMap.get(year) ?? [];
  if (entries.length === 0) return null;
  const best = entries[0];
  return {
    sourcePath: best.sourcePath,
    paperType: best.paperType,
  };
}

function buildSnippet(chapter, pyq, year, sourcePath, paperType) {
  const topics = chapter.topics.slice(0, 6).join(', ') || 'No topic list';
  const important = (pyq?.importantTopics ?? []).slice(0, 5).join(', ') || 'No strong PYQ tags';
  const yearsText = (pyq?.yearsAsked ?? []).sort((a, b) => b - a).join(', ');
  return [
    `Chapter ${chapter.id}: ${chapter.title}.`,
    `Class ${chapter.classLevel} ${chapter.subject}.`,
    `Core topics: ${topics}.`,
    `PYQ focus: ${important}.`,
    `Average marks from PYQ: ${pyq?.avgMarks ?? 0}.`,
    `Asked years: ${yearsText || 'Not enough history available'}.`,
    `Retrieved paper source: ${sourcePath} (${paperType}, ${year}).`,
  ].join(' ');
}

function showProgress(prefix, current, total) {
  if (!total) return;
  const percent = ((current / total) * 100).toFixed(1);
  const barSize = 24;
  const filled = Math.min(barSize, Math.floor((current / total) * barSize));
  const bar = `${'#'.repeat(filled)}${'-'.repeat(barSize - filled)}`;
  const line = `${prefix} [${bar}] ${current}/${total} (${percent}%)`;
  if (process.stdout.isTTY) {
    process.stdout.write(`\r${line}${current >= total ? '\n' : ''}`);
  } else if (current === 1 || current === total || current % Math.max(1, Math.floor(total / 8)) === 0) {
    console.log(line);
  }
}

function build() {
  const chapters = parseChapters();
  const pyqMap = parsePyq();
  const hfIndex = parseHfIndex();
  const hfCatalog = buildHfCatalog(hfIndex);

  const chunks = [];
  const chapterSources = {};
  const subjectSources = {};
  const diagnostics = {
    parsedChapters: chapters.length,
    parsedPyqEntries: pyqMap.size,
    hfIndexKeys: Object.keys(hfIndex).length,
    chaptersWithoutPyq: [],
    chaptersWithoutResolvedSource: [],
    chapterChunkCounts: {},
  };
  let chunkCounter = 1;

  for (const [index, chapter] of chapters.entries()) {
    const pyq = pyqMap.get(chapter.id);
    const catalogYears = getCatalogYears(hfCatalog, chapter.classLevel, chapter.subject);
    const preferredYears = pickYears(pyq?.yearsAsked ?? [], catalogYears);
    if (!pyq) diagnostics.chaptersWithoutPyq.push(chapter.id);
    const usedSources = new Set();
    let chapterChunkCount = 0;

    for (const year of preferredYears) {
      const resolved = resolvePaperPath(hfCatalog, chapter.classLevel, chapter.subject, year);
      if (!resolved) continue;
      if (usedSources.has(resolved.sourcePath)) continue;
      usedSources.add(resolved.sourcePath);

      const key = `${chapter.classLevel}|${normalizeSubject(chapter.classLevel, chapter.subject)}`;
      if (!subjectSources[key]) subjectSources[key] = [];
      if (!subjectSources[key].includes(resolved.sourcePath) && subjectSources[key].length < 80) {
        subjectSources[key].push(resolved.sourcePath);
      }

      if (!chapterSources[chapter.id]) chapterSources[chapter.id] = [];
      if (!chapterSources[chapter.id].includes(resolved.sourcePath) && chapterSources[chapter.id].length < 15) {
        chapterSources[chapter.id].push(resolved.sourcePath);
      }

      chunks.push({
        id: `ctx-node-${String(chunkCounter).padStart(7, '0')}`,
        text: buildSnippet(chapter, pyq, year, resolved.sourcePath, resolved.paperType),
        sourcePath: resolved.sourcePath,
        classLevel: chapter.classLevel,
        subject: normalizeSubject(chapter.classLevel, chapter.subject),
        chapterId: chapter.id,
        year,
        paperType: resolved.paperType,
      });
      chunkCounter += 1;
      chapterChunkCount += 1;
      if (chapterChunkCount >= 10) break;
    }

    diagnostics.chapterChunkCounts[chapter.id] = chapterChunkCount;
    if (chapterChunkCount === 0) {
      diagnostics.chaptersWithoutResolvedSource.push(chapter.id);
    }
    showProgress('Building context', index + 1, chapters.length);
  }

  if (chapters.length === 0) {
    console.error(
      '[context-index] No chapters were parsed from lib/data.ts. Check parser compatibility with current file format.'
    );
    process.exitCode = 1;
    return;
  }

  if (chunks.length === 0) {
    console.error('[context-index] No chunks generated. Context build aborted.');
    console.error(JSON.stringify(diagnostics, null, 2));
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(chunksPath, `${chunks.map((chunk) => JSON.stringify(chunk)).join('\n')}\n`, 'utf8');
  fs.writeFileSync(
    chapterIndexPath,
    JSON.stringify(
      {
        version: '2',
        generatedAt: new Date().toISOString(),
        datasetRoot: 'dataset/cbse_papers',
        chapters: chapterSources,
        sourcesBySubjectClass: subjectSources,
        stats: {
          chunks: chunks.length,
          chapters: Object.keys(chapterSources).length,
          parsedChapters: diagnostics.parsedChapters,
          parsedPyqEntries: diagnostics.parsedPyqEntries,
          hfIndexKeys: diagnostics.hfIndexKeys,
          chaptersWithoutPyq: diagnostics.chaptersWithoutPyq.length,
          chaptersWithoutResolvedSource: diagnostics.chaptersWithoutResolvedSource.length,
        },
        diagnostics,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`Context index built: chunks=${chunks.length}, chapters=${Object.keys(chapterSources).length}`);
}

build();
