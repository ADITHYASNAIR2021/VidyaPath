#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contextDir = path.join(root, 'lib', 'context');
const chunkPaths = [
  path.join(contextDir, 'chunks.jsonl'),
  path.join(contextDir, 'textbook_chunks.jsonl'),
];
const imageManifestPaths = [
  path.join(contextDir, 'paper_image_manifest.json'),
  path.join(contextDir, 'textbook_image_manifest.json'),
];
const outPath = path.join(contextDir, 'retrieval_index.json');
const dataPath = path.join(root, 'lib', 'data.ts');

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'board', 'class', 'paper', 'chapter',
  'question', 'questions', 'answer', 'marks', 'what', 'when', 'where', 'which', 'have', 'been',
]);

function tokenize(text) {
  return (String(text || '').toLowerCase().match(/[a-z]{2,}|[\u0900-\u097f]{2,}|[0-9]+(?:\.[0-9]+)?/g) ?? [])
    .filter((token) => !STOPWORDS.has(token));
}

function unique(items) {
  return [...new Set(items)];
}

function buildTermFreq(tokens, maxTerms = 80) {
  const out = {};
  for (const token of tokens) out[token] = (out[token] ?? 0) + 1;
  // Keep only top-N terms by frequency to cap index size
  const entries = Object.entries(out).sort((a, b) => b[1] - a[1]);
  if (entries.length <= maxTerms) return out;
  const trimmed = {};
  for (const [k, v] of entries.slice(0, maxTerms)) trimmed[k] = v;
  return trimmed;
}

function inferModalityHints(text, sourceType, hasImages, visualTags = []) {
  const lower = String(text || '').toLowerCase();
  const hints = [...visualTags];
  if (sourceType === 'image-ocr' || hasImages) hints.push('visual');
  if (/diagram|figure|labelled|label the|ray diagram|circuit|graph|flow chart|map/i.test(lower)) hints.push('diagram');
  if (/table|tabular|column|row/i.test(lower)) hints.push('table');
  if (/equation|formula|reaction|=|ohm|volt|ampere|mole|deriv/i.test(lower)) hints.push('equation');
  if (/example|worked|solution/i.test(lower)) hints.push('example');
  if (/steps|sequence|process|cycle|mechanism/i.test(lower)) hints.push('process');
  return unique(hints);
}

function detectSectionType(text, modalityHints) {
  const lower = String(text || '').toLowerCase();
  if (modalityHints.includes('diagram') || /figure|ray diagram|circuit|labelled|label the/i.test(lower)) return 'diagram';
  if (/table|tabulate|column|row/i.test(lower)) return 'table';
  if (/equation|formula|reaction|impedance|derivation|balanced/i.test(lower)) return 'equation';
  if (/example|solution|worked/i.test(lower)) return 'example';
  if (/steps|sequence|process|stage|cycle|mechanism/i.test(lower)) return 'process';
  return 'theory';
}

function flattenMermaidLabels(mermaidDiagram) {
  const labels = [];
  const matches = String(mermaidDiagram || '').match(/(?:\[[^\]]+\]|\([^)]+\)|\{[^}]+\})/g) ?? [];
  for (const match of matches) {
    const cleaned = match.slice(1, -1).trim();
    if (cleaned) labels.push(cleaned.replace(/\s+/g, ' '));
  }
  return unique(labels);
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
  const content = fs.readFileSync(dataPath, 'utf8');
  const re =
    /id:\s*'(?<id>[^']+)'.*?classLevel:\s*(?<classLevel>\d+).*?subject:\s*'(?<subject>[^']+)'.*?chapterNumber:\s*(?<chapterNumber>\d+).*?title:\s*'(?<title>(?:\\'|[^'])+)'.*?topics:\s*\[(?<topics>[\s\S]*?)\]\s*,/gs;
  const chapters = new Map();
  const matches = Array.from(content.matchAll(re));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const blockStart = match.index ?? 0;
    const blockEnd = index + 1 < matches.length ? (matches[index + 1].index ?? content.length) : content.length;
    const block = content.slice(blockStart, blockEnd);
    const mermaidMatch = block.match(/mermaidDiagram:\s*`([\s\S]*?)`/);
    chapters.set(match.groups.id, {
      id: match.groups.id,
      classLevel: Number(match.groups.classLevel),
      subject: match.groups.subject,
      chapterNumber: Number(match.groups.chapterNumber),
      title: match.groups.title.replace(/\\'/g, "'"),
      topics: parseStringList(match.groups.topics),
      mermaidDiagram: mermaidMatch?.[1] || '',
    });
  }
  return chapters;
}

function inferTopicHints(text, chapter) {
  if (!chapter?.topics?.length) return [];
  const textTokens = new Set(tokenize(text));
  return unique(
    chapter.topics.filter((topic) => {
      const tokens = tokenize(topic);
      const hits = tokens.filter((token) => textTokens.has(token)).length;
      return hits >= Math.max(1, Math.ceil(tokens.length / 3));
    })
  ).slice(0, 6);
}

function buildContextualText(chunk, chapter, topicHints, modalityHints) {
  return [
    `Class ${chunk.classLevel} ${chunk.subject}`,
    chapter?.title ? `Chapter ${chapter.title}` : chunk.chapterTitle ? `Chapter ${chunk.chapterTitle}` : '',
    chapter?.topics?.length ? `Chapter topics: ${chapter.topics.slice(0, 8).join(', ')}` : '',
    topicHints?.length ? `Matched subtopics: ${topicHints.slice(0, 5).join(', ')}` : '',
    modalityHints?.length ? `Content type: ${modalityHints.join(', ')}` : '',
    Array.isArray(chunk.visualTags) && chunk.visualTags.length ? `Visual tags: ${chunk.visualTags.join(', ')}` : '',
    chunk.sourceType === 'textbook'
      ? 'NCERT textbook grounding'
      : chunk.sourceType === 'image-ocr'
        ? 'Diagram or OCR visual grounding'
        : 'Board paper or exam-style grounding',
    chunk.page ? `Page ${chunk.page}` : '',
    Number.isFinite(chunk.chunkIndex) ? `Chunk ${chunk.chunkIndex}` : '',
    chunk.text,
  ].filter(Boolean).join('. ').replace(/\s+/g, ' ').trim();
}

function readChunks() {
  const chunks = [];
  for (const filePath of chunkPaths) {
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (!parsed?.id || !parsed?.text || !parsed?.sourcePath) continue;
        chunks.push(parsed);
      } catch {
        continue;
      }
    }
  }
  return chunks;
}

function readImageEntries() {
  const images = [];
  for (const filePath of imageManifestPaths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(payload?.images)) {
        for (const image of payload.images) {
          if (image?.imagePath && image?.sourcePath) images.push(image);
        }
      }
    } catch {
      continue;
    }
  }
  return images;
}

function buildIndex() {
  const chunks = readChunks();
  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const imageEntries = readImageEntries();
  const chapters = parseChapters();
  const docs = [];
  const docFrequency = new Map();
  const chapterDocs = new Map();

  for (const chunk of chunks) {
    const chapter = chunk.chapterId ? chapters.get(chunk.chapterId) : null;
    const modalityHints = inferModalityHints(chunk.text, chunk.sourceType, chunk.hasImages, chunk.visualTags ?? []);
    const topicHints = inferTopicHints(chunk.text, chapter);
    const contextualText = buildContextualText(chunk, chapter, topicHints, modalityHints);
    const tokens = tokenize(contextualText);
    const termFreq = buildTermFreq(tokens);
    for (const term of Object.keys(termFreq)) {
      docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
    }
    const doc = {
      id: chunk.id,
      kind: 'chunk',
      chunkId: chunk.id,
      text: '',            // omitted — looked up from cachedChunks at runtime via chunkId
      contextualText: contextualText.slice(0, 600),
      sourcePath: chunk.sourcePath,
      classLevel: chunk.classLevel,
      subject: chunk.subject,
      sourceType: chunk.sourceType === 'textbook' ? 'textbook' : chunk.sourceType === 'image-ocr' ? 'image-ocr' : 'paper',
      chapterId: chunk.chapterId ?? null,
      chapterTitle: chapter?.title ?? chunk.chapterTitle,
      page: chunk.page,
      chunkIndex: chunk.chunkIndex,
      year: chunk.year,
      modalityHints,
      topicHints,
      sectionType: detectSectionType(chunk.text, modalityHints),
      hierarchyPath: [String(chunk.classLevel), chunk.subject, chunk.chapterId ?? 'general'],
      docLength: tokens.length,
      termFreq,
    };
    docs.push(doc);
    if (chapter?.id) {
      const bucket = chapterDocs.get(chapter.id) ?? [];
      bucket.push(doc);
      chapterDocs.set(chapter.id, bucket);
    }
  }

  const chapterIndex = {};
  for (const [chapterId, chapter] of chapters.entries()) {
    const scopedDocs = chapterDocs.get(chapterId) ?? [];
    const topicNodes = chapter.topics.map((topic, index) => {
      const topicTokens = tokenize(topic);
      const ranked = scopedDocs
        .map((doc) => ({
          doc,
          overlap: topicTokens.reduce((sum, token) => sum + (doc.termFreq[token] ?? 0), 0),
        }))
        .filter((entry) => entry.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, 5);
      const summaryText = [
        `Class ${chapter.classLevel} ${chapter.subject} chapter ${chapter.title}.`,
        `Topic focus: ${topic}.`,
        ranked.length > 0
          ? `Key evidence: ${ranked.map((entry) => entry.doc.text.slice(0, 140)).join(' ')}`
          : `Key NCERT wording and board phrasing should mention ${topic}.`,
      ].join(' ');
      const termFreq = buildTermFreq(tokenize(summaryText));
      for (const term of Object.keys(termFreq)) {
        docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
      }
      docs.push({
        id: `${chapterId}::topic::${index}`,
        kind: 'topic',
        chunkId: null,
        text: summaryText,
        contextualText: summaryText,
        sourcePath: `chapter:${chapterId}#topic`,
        classLevel: chapter.classLevel,
        subject: chapter.subject,
        sourceType: 'textbook',
        chapterId,
        chapterTitle: chapter.title,
        modalityHints: [],
        topicHints: [topic],
        sectionType: 'process',
        hierarchyPath: [String(chapter.classLevel), chapter.subject, chapterId, topic],
        docLength: tokenize(summaryText).length,
        termFreq,
      });
      return {
        id: `${chapterId}::topic::${index}`,
        chapterId,
        classLevel: chapter.classLevel,
        subject: chapter.subject,
        topic,
        summaryText,
        chunkIds: ranked.map((entry) => entry.doc.chunkId).filter(Boolean),
        keywords: topicTokens,
      };
    });

    const diagramLabels = flattenMermaidLabels(chapter.mermaidDiagram);
    if (diagramLabels.length > 0) {
      const visualText = [
        `Class ${chapter.classLevel} ${chapter.subject} chapter ${chapter.title}.`,
        `Diagram labels and visual structure: ${diagramLabels.join(', ')}.`,
        `Relevant topics: ${chapter.topics.slice(0, 8).join(', ')}.`,
      ].join(' ');
      const termFreq = buildTermFreq(tokenize(visualText));
      for (const term of Object.keys(termFreq)) {
        docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
      }
      docs.push({
        id: `${chapterId}::visual::mermaid`,
        kind: 'visual',
        chunkId: null,
        text: visualText,
        contextualText: visualText,
        sourcePath: `chapter:${chapterId}#diagram`,
        classLevel: chapter.classLevel,
        subject: chapter.subject,
        sourceType: 'image-ocr',
        chapterId,
        chapterTitle: chapter.title,
        modalityHints: ['visual', 'diagram'],
        topicHints: chapter.topics.slice(0, 6),
        sectionType: 'diagram',
        hierarchyPath: [String(chapter.classLevel), chapter.subject, chapterId, 'diagram'],
        docLength: tokenize(visualText).length,
        termFreq,
      });
    }

    chapterIndex[chapterId] = {
      chapterId,
      classLevel: chapter.classLevel,
      subject: chapter.subject,
      title: chapter.title,
      topics: chapter.topics,
      topicNodes,
    };
  }

  for (const image of imageEntries) {
    const chapter = image.chapterId ? chapters.get(image.chapterId) : null;
    const tags = Array.isArray(image.tags) ? unique(image.tags.map((tag) => String(tag))) : [];
    const ocrChunk = image.ocrChunkId ? chunksById.get(image.ocrChunkId) : null;
    const visualText = [
      `Class ${image.classLevel} ${image.subject} visual page.`,
      chapter?.title ? `Chapter ${chapter.title}.` : image.chapterTitle ? `Chapter ${image.chapterTitle}.` : '',
      tags.length ? `Visual tags: ${tags.join(', ')}.` : '',
      Array.isArray(image.reasons) && image.reasons.length ? `Detection reasons: ${image.reasons.join(', ')}.` : '',
      ocrChunk?.text ? `OCR evidence: ${ocrChunk.text.slice(0, 220)}.` : '',
      `Source asset: ${image.imagePath}.`,
    ].filter(Boolean).join(' ');
    const termFreq = buildTermFreq(tokenize(visualText));
    for (const term of Object.keys(termFreq)) {
      docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
    }
    docs.push({
      id: `visual-asset::${String(image.datasetKind || 'asset')}::${String(image.sourcePath)}::${Number(image.page) + 1}`,
      kind: 'visual',
      chunkId: ocrChunk?.id ?? null,
      text: visualText,
      contextualText: visualText,
      sourcePath: image.imagePath,
      classLevel: Number(image.classLevel) || 0,
      subject: String(image.subject || 'Unknown'),
      sourceType: 'image-ocr',
      chapterId: image.chapterId ?? null,
      chapterTitle: chapter?.title ?? image.chapterTitle,
      page: Number.isFinite(Number(image.page)) ? Number(image.page) : undefined,
      modalityHints: unique(['visual', ...tags]),
      topicHints: chapter?.topics?.slice(0, 6) ?? [],
      sectionType: tags.includes('table') ? 'table' : tags.includes('equation') ? 'equation' : 'diagram',
      hierarchyPath: [
        String(image.classLevel || '0'),
        String(image.subject || 'Unknown'),
        image.chapterId ?? 'general',
        'visual-asset',
      ],
      docLength: tokenize(visualText).length,
      termFreq,
    });
  }

  const avgDocLength = docs.length > 0 ? docs.reduce((sum, doc) => sum + doc.docLength, 0) / docs.length : 0;
  const idf = {};
  for (const [term, df] of docFrequency.entries()) {
    idf[term] = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
  }

  return {
    version: '2',
    generatedAt: new Date().toISOString(),
    averageDocLength: Number(avgDocLength.toFixed(2)),
    docs,
    idf,
    chapters: chapterIndex,
  };
}

function main() {
  if (!fs.existsSync(contextDir)) fs.mkdirSync(contextDir, { recursive: true });
  const index = buildIndex();
  const payload = JSON.stringify(index);
  // Write to temp file then rename to avoid file-lock issues when dev server is running
  const tmpPath = outPath + '.tmp';
  fs.writeFileSync(tmpPath, payload, 'utf8');
  try {
    fs.renameSync(tmpPath, outPath);
  } catch {
    // On Windows, rename fails if target is locked — fall back to direct write
    fs.writeFileSync(outPath, payload, 'utf8');
    try { fs.unlinkSync(tmpPath); } catch {}
  }
  console.log(`[retrieval-index] Wrote ${index.docs.length} docs -> ${path.relative(root, outPath)}`);
}

main();
