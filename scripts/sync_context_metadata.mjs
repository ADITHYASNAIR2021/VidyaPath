#!/usr/bin/env node
/** Rebuild lightweight chapter/source metadata from the sanitized JSONL corpus. */
import fs from 'node:fs';
import path from 'node:path';

const contextDir = path.join(process.cwd(), 'lib', 'context');

function readChunks(filename) {
  const filePath = path.join(contextDir, filename);
  if (!fs.existsSync(filePath)) return [];
  const chunks = [];
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const chunk = JSON.parse(line);
      if (chunk?.id && chunk?.sourcePath) chunks.push(chunk);
    } catch {
      // Sanitized metadata only describes valid chunks.
    }
  }
  return chunks;
}

function groupedMetadata(chunks) {
  const chapters = new Map();
  const sourcesBySubjectClass = new Map();
  const chunksByChapter = new Map();
  for (const chunk of chunks) {
    const subjectKey = `${Number(chunk.classLevel)}|${String(chunk.subject)}`;
    if (!sourcesBySubjectClass.has(subjectKey)) sourcesBySubjectClass.set(subjectKey, new Set());
    sourcesBySubjectClass.get(subjectKey).add(String(chunk.sourcePath));
    if (!chunk.chapterId) continue;
    const chapterId = String(chunk.chapterId);
    if (!chapters.has(chapterId)) chapters.set(chapterId, new Set());
    chapters.get(chapterId).add(String(chunk.sourcePath));
    if (!chunksByChapter.has(chapterId)) chunksByChapter.set(chapterId, []);
    chunksByChapter.get(chapterId).push(String(chunk.id));
  }
  return {
    chapters: Object.fromEntries([...chapters].map(([key, value]) => [key, [...value]])),
    sourcesBySubjectClass: Object.fromEntries([...sourcesBySubjectClass].map(([key, value]) => [key, [...value]])),
    chunksByChapter: Object.fromEntries(chunksByChapter),
  };
}

function readJson(filename) {
  try {
    return JSON.parse(fs.readFileSync(path.join(contextDir, filename), 'utf8'));
  } catch {
    return {};
  }
}

function writeJson(filename, payload) {
  fs.writeFileSync(path.join(contextDir, filename), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

const paperChunks = readChunks('chunks.jsonl');
const textbookChunks = readChunks('textbook_chunks.jsonl');
const paper = groupedMetadata(paperChunks);
const textbook = groupedMetadata(textbookChunks);
const generatedAt = new Date().toISOString();

const chapterIndex = readJson('chapter_index.json');
writeJson('chapter_index.json', {
  ...chapterIndex,
  generatedAt,
  chapters: paper.chapters,
  sourcesBySubjectClass: paper.sourcesBySubjectClass,
  stats: {
    ...(chapterIndex.stats ?? {}),
    chunks: paperChunks.length,
    keptUnmappedChunks: paperChunks.filter((chunk) => !chunk.chapterId).length,
    textbookChunksMerged: 0,
    sanitizedCorpus: true,
  },
});

const textbookIndex = readJson('textbook_chapter_index.json');
writeJson('textbook_chapter_index.json', {
  ...textbookIndex,
  generatedAt,
  totalChunks: textbookChunks.length,
  chapters: textbook.chapters,
  chunksByChapter: textbook.chunksByChapter,
  sourcesBySubjectClass: textbook.sourcesBySubjectClass,
  sanitizedCorpus: true,
});

console.log(`[sync-context-metadata] papers=${paperChunks.length} textbooks=${textbookChunks.length} paperChapters=${Object.keys(paper.chapters).length} textbookChapters=${Object.keys(textbook.chapters).length}`);
