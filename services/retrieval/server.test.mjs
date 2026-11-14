import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRetrievalServer } from './server.mjs';
const key = 'local-test-secret-'.repeat(3);
const vectors = new Float32Array(384 * 3); vectors[0] = 1; vectors[384] = 0.5; vectors[768] = 1;
const index = { vectors, manifest: { model: 'Xenova/multilingual-e5-small', corpusFingerprint: 'a'.repeat(64), vectorSha256: 'b'.repeat(64), chapters: [{ id: 'acid', classLevel: 10, subject: 'Chemistry' }, { id: 'other', classLevel: 12, subject: 'Physics' }] }, rows: [{ id: 'matched', chapterId: 'acid', classLevel: 10, subject: 'Chemistry' }, { id: 'unmapped', chapterId: null, classLevel: 10, subject: 'Science' }, { id: 'wrong-class', chapterId: 'other', classLevel: 12, subject: 'Physics' }] };
test('service auth, scoped search and bounded input', async () => {
  let calls = 0; const server = createRetrievalServer(index, async () => { calls++; const vector = Array(384).fill(0); vector[0] = 1; return vector; }, key);
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = `http://127.0.0.1:${server.address().port}`;
  const request = (body, authorized = true) => fetch(base + '/search', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await request({}, false)).status, 401); assert.equal(calls, 0);
    const body = { query: 'pH', classLevel: 10, subject: 'Science', chapterId: 'acid', topK: 6 };
    const result = await (await request(body)).json(); assert.deepEqual(result.hits, [{ id: 'matched', score: 1 }]); assert.equal(result.hits[0].text, undefined);
    assert.equal((await request({ ...body, chapterId: 'other' })).status, 422);
    assert.equal((await request({ ...body, query: 'x'.repeat(2100) })).status, 422);
    assert.equal((await request({ ...body, imageBase64: 'not-accepted' })).status, 422);
    assert.equal((await request({ ...body, query: 'x'.repeat(9000) })).status, 413);
    assert.equal(calls, 1);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
