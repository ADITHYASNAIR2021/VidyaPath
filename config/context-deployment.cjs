// One deployment contract for Next tracing and the postbuild verifier.
// Keep academic data on the server functions that read it. Framework fallbacks,
// static pages and unrelated APIs still receive size/privacy checks.
const corpusFiles = [
  'chunks.jsonl.gz', 'textbook_chunks.jsonl.gz', 'chapter_index.json.gz',
  'textbook_chapter_index.json.gz', 'retrieval_index.json.gz', 'retrieval_manifest.json',
].map((file) => `lib/context/${file}`);

const corpusRoutes = [
  '/api/adaptive-test', '/api/ai-tutor', '/api/chapter-diagnose',
  '/api/chapter-drill', '/api/chapter-pack', '/api/chapter-remediate',
  '/api/context-pack', '/api/generate-flashcards', '/api/generate-quiz',
  '/api/image-solve', '/api/paper-evaluate', '/api/revision-plan',
  '/api/developer/overview', '/api/developer/rag-check', '/chapters/[id]',
];

const tracingIncludes = Object.fromEntries(corpusRoutes.map((route) => [
  route.replaceAll('[', '\\[').replaceAll(']', '\\]'),
  corpusFiles.map((file) => `./${file}`),
]));
const corpusTraceEntries = corpusRoutes.map((route) => `${route.slice(1)}/${route.startsWith('/api/') ? 'route' : 'page'}.js.nft.json`);

module.exports = { corpusFiles, corpusRoutes, corpusTraceEntries, tracingIncludes };
