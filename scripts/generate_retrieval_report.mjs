import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const root = process.cwd();
const directory = path.join(root, 'lib/context');
const reportPath = path.join(directory, 'retrieval_manifest.json');
const text = (file) => {
  const raw = path.join(directory, file);
  if (existsSync(raw)) return readFileSync(raw, 'utf8');
  return gunzipSync(readFileSync(`${raw}.gz`)).toString('utf8');
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const artifacts = ['chunks.jsonl.gz', 'textbook_chunks.jsonl.gz', 'retrieval_index.json.gz', 'chapter_index.json.gz', 'textbook_chapter_index.json.gz'].map((file) => {
  const bytes = readFileSync(path.join(directory, file));
  return { file, bytes: bytes.length, sha256: hash(bytes), uncompressedSha256: hash(file.endsWith('.gz') ? gunzipSync(bytes) : bytes) };
});
const artifactFingerprint = hash(artifacts.map((file) => `${file.file}:${file.sha256}`).join('\n'));
const benchmarkSeedHash = hash(readFileSync(path.join(root, 'lib/ai/rag-benchmark-seed.ts')));
const retrievalCodeHash = hash(['lib/ai/context-retriever.ts', 'lib/ai/retrieval-index.ts', 'lib/ai/retrieval-enhancements.ts', 'lib/data.ts'].map((file) => `${file}:${hash(readFileSync(path.join(root, file)))}`).join('\n'));
const data = readFileSync(path.join(root, 'lib/data.ts'), 'utf8');
const pattern = /id:\s*'(?<id>[^']+)'.*?classLevel:\s*(?<classLevel>\d+).*?subject:\s*'(?<subject>[^']+)'.*?chapterNumber:\s*(?<number>\d+).*?title:\s*'(?<title>(?:\\'|[^'])+)'.*?topics:\s*\[(?<topics>[\s\S]*?)\]\s*,/gs;
const chapters = [...data.matchAll(pattern)].filter((match) => ['10', '12'].includes(match.groups.classLevel)).map((match) => ({
  id: match.groups.id, classLevel: Number(match.groups.classLevel), subject: match.groups.subject, chapterNumber: Number(match.groups.number),
  title: match.groups.title.replace(/\\'/g, "'"), topics: [...match.groups.topics.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g)].map((entry) => (entry[1] ?? entry[2]).replace(/\\(['"])/g, '$1')),
}));
const byId = new Map();
let malformed = 0;
let duplicates = 0;
let mirroredTextbookChunks = 0;
let conflictingChunkIds = 0;
for (const file of ['chunks.jsonl', 'textbook_chunks.jsonl']) {
  const idsInFile = new Set();
  for (const line of text(file).split('\n').filter(Boolean)) {
    try {
      const chunk = JSON.parse(line);
      if (!chunk.id || typeof chunk.text !== 'string' || !chunk.sourcePath) { malformed++; continue; }
      if (idsInFile.has(chunk.id)) { duplicates++; continue; }
      idsInFile.add(chunk.id);
      if (byId.has(chunk.id)) {
        const previous = byId.get(chunk.id);
        if (file === 'textbook_chunks.jsonl' && chunk.sourceType === 'textbook' && isDeepStrictEqual(previous, chunk)) mirroredTextbookChunks++;
        else { duplicates++; conflictingChunkIds++; }
        continue;
      }
      byId.set(chunk.id, chunk);
    } catch { malformed++; }
  }
}
const chunks = [...byId.values()];
const vectors = new Set();
const vectorModels = {};
const vectorPath = path.join(directory, 'chunk_vectors.jsonl');
let invalidVectors = 0;
let vectorSha256 = null;
if (existsSync(vectorPath)) {
  const vectorStream = createReadStream(vectorPath);
  const vectorHash = createHash('sha256');
  vectorStream.on('data', (bytes) => vectorHash.update(bytes));
  for await (const line of createInterface({ input: vectorStream, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (!row.id || !Array.isArray(row.embedding) || !row.embedding.length || !row.embedding.every(Number.isFinite)) { invalidVectors++; continue; }
      vectors.add(row.id);
      const key = `${row.embeddingKind}|${row.embeddingModel}|${row.embedding.length}`;
      vectorModels[key] = (vectorModels[key] || 0) + 1;
    } catch { invalidVectors++; }
  }
  vectorSha256 = vectorHash.digest('hex');
}
const index = JSON.parse(text('retrieval_index.json'));
const indexIds = new Set(index.docs.filter((doc) => doc.kind === 'chunk').map((doc) => doc.chunkId));
const tokenize = (value) => value.toLowerCase().match(/[a-z]{3,}|[\u0900-\u097f]{2,}/g) || [];
const sourceTypes = {};
for (const chunk of chunks) sourceTypes[chunk.sourceType || 'paper'] = (sourceTypes[chunk.sourceType || 'paper'] || 0) + 1;
const chapterReports = chapters.map((chapter) => {
  const rows = chunks.filter((chunk) => chunk.chapterId === chapter.id);
  const textbook = rows.filter((row) => row.sourceType === 'textbook').length;
  const paper = rows.filter((row) => !row.sourceType || row.sourceType === 'paper').length;
  const tokens = new Set(rows.flatMap((row) => tokenize(row.text)));
  const missingTopics = chapter.topics.filter((topic) => {
    const terms = tokenize(topic);
    return terms.length && terms.filter((term) => tokens.has(term)).length / terms.length < 0.5;
  });
  const reasons = [];
  if (!rows.length) reasons.push('No chapter-mapped source chunks');
  if (textbook < 3) reasons.push('Fewer than three textbook chunks');
  if (paper < 3) reasons.push('Fewer than three paper chunks');
  if (missingTopics.length) reasons.push(`${missingTopics.length} topic labels have weak lexical coverage`);
  const commands = [];
  if (textbook < 3) commands.push('npm run build:textbooks');
  if (paper < 3) commands.push('npm run build:context');
  return {
    ...chapter, chunks: rows.length, textbook, paper, imageOcr: rows.filter((row) => row.sourceType === 'image-ocr').length,
    uniqueSources: new Set(rows.map((row) => row.sourcePath)).size, indexed: rows.filter((row) => indexIds.has(row.id)).length,
    vectors: rows.filter((row) => vectors.has(row.id)).length,
    lexicalTopicCoverage: chapter.topics.length ? Math.round((1 - missingTopics.length / chapter.topics.length) * 100) : null,
    missingTopics, reindexNeeded: reasons.length > 0, reasons, commands,
  };
});
let benchmark = null;
const benchmarkArgument = process.argv.indexOf('--benchmark');
const benchmarkPath = benchmarkArgument >= 0 ? process.argv[benchmarkArgument + 1] : null;
if (benchmarkPath && existsSync(benchmarkPath)) {
  const saved = JSON.parse(readFileSync(benchmarkPath, 'utf8'));
  benchmark = { ...saved, stale: saved.artifactFingerprint !== artifactFingerprint || saved.benchmarkSeedHash !== benchmarkSeedHash || saved.retrievalCodeHash !== retrievalCodeHash };
} else if (existsSync(reportPath)) {
  const saved = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (saved.benchmark) benchmark = { ...saved.benchmark, stale: saved.benchmark.artifactFingerprint !== artifactFingerprint || saved.benchmark.benchmarkSeedHash !== benchmarkSeedHash || saved.benchmark.retrievalCodeHash !== retrievalCodeHash };
}
const report = {
  version: 1, generatedAt: new Date().toISOString(), artifactFingerprint, artifacts,
  optionalVectorArtifact: vectorSha256 ? { file: 'chunk_vectors.jsonl', uncompressedSha256: vectorSha256 } : null,
  totals: { chunks: chunks.length, mapped: chunks.filter((row) => row.chapterId).length, unmapped: chunks.filter((row) => !row.chapterId).length,
    malformed, duplicates, mirroredTextbookChunks, conflictingChunkIds, sourceTypes, retrievalDocuments: index.docs.length, indexMissingChunks: chunks.filter((row) => !indexIds.has(row.id)).length,
    vectorCount: vectors.size, vectorMissingChunks: chunks.filter((row) => !vectors.has(row.id)).length, orphanVectors: [...vectors].filter((id) => !byId.has(id)).length, invalidVectors, vectorModels },
  chapters: chapterReports, benchmark,
  needsWork: chapterReports.filter((chapter) => chapter.reindexNeeded).length,
  methodology: 'Coverage counts and lexical topic proxies, not factual correctness. Diagram tags are not OCR verification. Benchmarks use fixed curated questions; no user prompts are stored.',
  serving: { default: 'Bundled gzip corpus + in-process BM25; optional private E5 service or hosted reranker', cdn: 'Optional immutable versioned artifact release with SHA-256 manifest', vectorDatabase: 'No external database: compact private E5 index supplied', localVectors: 'Export existing E5 vectors into a compact VM release; raw vectors and ONNX weights are excluded from serverless functions' },
};
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const chapterPlan = [
  '# Generated chapter indexing plan', '',
  `Generated ${report.generatedAt}. Corpus fingerprint: \`${artifactFingerprint}\`.`, '',
  `${chapters.length} chapters; ${report.needsWork} need coverage review. Counts and lexical coverage are diagnostics, not evidence of factual correctness. Zero OCR chunks are available.`, '',
  'Regenerate with `npm run report:retrieval`. For rebuild/serving/security instructions see [AI operations](./AI_SECURITY_AND_RETRIEVAL.md). Missing source books or ambiguous editions require inspection before rebuilding.', '',
  '| Chapter | Book / PYQ / OCR | Indexed / vectors | Topic proxy | Review and action |',
  '| --- | --- | --- | --- | --- |',
  ...chapterReports.map((chapter) => `| ${cell(chapter.id + ' — ' + chapter.title)} | ${chapter.textbook} / ${chapter.paper} / ${chapter.imageOcr} | ${chapter.indexed} / ${chapter.vectors} | ${chapter.lexicalTopicCoverage ?? '—'}% | ${cell(chapter.reasons.length ? chapter.reasons.join('; ') + (chapter.missingTopics.length ? '. Inspect: ' + chapter.missingTopics.join(', ') : '') + '. ' + (chapter.commands.join('; ') || 'Review source/extraction and add answer-bearing material before rebuilding') : 'No count/lexical gap detected; still requires answer-quality evaluation')} |`), '',
];
writeFileSync(path.join(root, 'docs/INDEXING_PLAN.md'), chapterPlan.join('\n'));
console.log(`[retrieval-report] ${chapters.length} chapters; ${chunks.length} chunks; ${report.needsWork} chapters need coverage review; ${malformed} malformed rows`);
console.log(`[retrieval-report] ${reportPath}`);
