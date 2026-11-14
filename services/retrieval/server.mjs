import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEncoder } from './encoder.mjs';

const normalizeSubject = (level, subject) => level === 10 && ['Science', 'Chemistry', 'Physics', 'Biology'].includes(subject) ? 'Science' : subject;
export function loadIndex(directory) {
  const manifest = JSON.parse(readFileSync(path.join(directory, 'semantic_manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.model !== 'Xenova/multilingual-e5-small' || manifest.dimensions !== 384 || !Number.isInteger(manifest.count) || manifest.count < 1 || manifest.count > 1000000) throw new Error('invalid-release');
  const allowed = new Set(['vectors.f32', 'rows.json']);
  if (manifest.files?.length !== 2 || new Set(manifest.files.map((file) => file.name)).size !== 2) throw new Error('invalid-release-files');
  for (const file of manifest.files) {
    if (!allowed.has(file.name)) throw new Error('invalid-release-file');
    const bytes = readFileSync(path.join(directory, file.name));
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('corrupt-release');
  }
  const bytes = readFileSync(path.join(directory, 'vectors.f32'));
  if (bytes.length !== manifest.count * 384 * 4) throw new Error('invalid-vector-count');
  const vectors = new Float32Array(manifest.count * 384);
  for (let i = 0; i < vectors.length; i++) { vectors[i] = bytes.readFloatLE(i * 4); if (!Number.isFinite(vectors[i])) throw new Error('invalid-vector'); }
  const rows = JSON.parse(readFileSync(path.join(directory, 'rows.json'), 'utf8'));
  if (rows.length !== manifest.count || new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('invalid-row-count');
  return { manifest, vectors, rows };
}

export function createRetrievalServer(index, encode, key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(key) || /replace|placeholder|your-key/i.test(key)) throw new Error('RETRIEVAL_SERVICE_KEY must be a real random secret of 32–256 URL-safe characters');
  const expected = createHash('sha256').update(`Bearer ${key}`).digest();
  let active = 0;
  const cache = new Map();
  const server = createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
    if (req.url === '/health' && req.method === 'GET') return send(200, { ready: true, model: index.manifest.model, corpusFingerprint: index.manifest.corpusFingerprint, count: index.rows.length });
    const actual = createHash('sha256').update(req.headers.authorization || '').digest();
    if (!timingSafeEqual(expected, actual)) return send(401, { error: 'unauthorized' });
    if (req.url !== '/search' || req.method !== 'POST') return send(404, { error: 'not-found' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'json-required' });
    if (active >= 2) return send(503, { error: 'busy' });
    active++;
    try {
      const chunks = []; let size = 0;
      for await (const part of req.iterator({ destroyOnReturn: false })) { size += part.length; if (size > 8192) { send(413, { error: 'size-limit' }); req.resume(); return; } chunks.push(part); }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'invalid-json' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((name) => !['query', 'classLevel', 'subject', 'chapterId', 'topK'].includes(name)) || typeof body.query !== 'string' || !body.query.trim() || body.query.length > 2000 || ![10, 12].includes(body.classLevel) || typeof body.subject !== 'string' || body.subject.length > 80 || (body.chapterId !== undefined && typeof body.chapterId !== 'string') || !Number.isInteger(body.topK ?? 24) || (body.topK ?? 24) < 1 || (body.topK ?? 24) > 48) return send(422, { error: 'invalid-query' });
      const subject = normalizeSubject(body.classLevel, body.subject);
      const chapter = body.chapterId ? index.manifest.chapters.find((row) => row.id === body.chapterId) : null;
      if ((body.chapterId && (!chapter || chapter.classLevel !== body.classLevel || normalizeSubject(chapter.classLevel, chapter.subject) !== subject)) || !index.manifest.chapters.some((row) => row.classLevel === body.classLevel && normalizeSubject(row.classLevel, row.subject) === subject)) return send(422, { error: 'invalid-scope' });
      const digest = createHash('sha256').update(body.query).digest('hex');
      const cached = cache.get(digest);
      const query = cached && cached.expires > Date.now() ? cached.vector : await encode(body.query);
      if (query.length !== 384 || !query.every(Number.isFinite)) throw new Error('invalid-query-vector');
      if (cache.size >= 256) cache.delete(cache.keys().next().value);
      cache.set(digest, { vector: query, expires: Date.now() + 300000 });
      const ranked = [];
      for (let row = 0; row < index.rows.length; row++) {
        const metadata = index.rows[row];
        if (metadata.classLevel !== body.classLevel || normalizeSubject(metadata.classLevel, metadata.subject) !== subject || (body.chapterId && metadata.chapterId !== body.chapterId)) continue;
        let score = 0; for (let dim = 0; dim < 384; dim++) score += query[dim] * index.vectors[row * 384 + dim];
        ranked.push({ id: metadata.id, score });
      }
      ranked.sort((a, b) => b.score - a.score);
      send(200, { model: index.manifest.model, dimensions: 384, corpusFingerprint: index.manifest.corpusFingerprint, vectorSha256: index.manifest.vectorSha256, hits: ranked.slice(0, body.topK ?? 24) });
    } catch { if (!res.headersSent) send(503, { error: 'retrieval-unavailable' }); }
    finally { active--; }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.maxHeadersCount = 32;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const index = loadIndex(path.resolve(process.env.RETRIEVAL_DATA_DIR || '/data'));
  const encode = await loadEncoder(); await encode('academic retrieval startup check');
  const server = createRetrievalServer(index, encode, process.env.RETRIEVAL_SERVICE_KEY);
  server.listen(Number(process.env.PORT) || 8080, process.env.HOST || '127.0.0.1', () => console.log(JSON.stringify({ event: 'retrieval-ready', model: index.manifest.model, count: index.rows.length })));
}
