import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, expect, it } from 'vitest';

const script = path.resolve('scripts/check_context_deploy.mjs');
const fixtures: string[] = [];
afterEach(() => { for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'vidyapath-context-prebuild-'));
  fixtures.push(root);
  const directory = path.join(root, 'lib/context');
  mkdirSync(directory, { recursive: true });
  const chunks = (type: string) => [10, 12].map((classLevel) => ({ id: `${type}-${classLevel}`, sourceType: type, classLevel, text: 'Academic source passage. '.repeat(12) }));
  const books = chunks('textbook').map((row) => JSON.stringify(row)).join('\n') + '\n';
  const files: Record<string, string> = {
    'chunks.jsonl.gz': chunks('paper').map((row) => JSON.stringify(row)).join('\r\n') + '\r\n',
    'textbook_chunks.jsonl.gz': books.replace(/\n/g, '\r\n'),
    'retrieval_index.json.gz': JSON.stringify({ docs: [{ kind: 'chunk', chunkId: 'paper-10' }], idf: {}, chapters: {} }),
    'chapter_index.json.gz': '{}', 'textbook_chapter_index.json.gz': '{}',
  };
  const artifacts = Object.entries(files).map(([file, content]) => {
    const bytes = gzipSync(content); writeFileSync(path.join(directory, file), bytes);
    return { file, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  writeFileSync(path.join(directory, 'retrieval_manifest.json'), JSON.stringify({ artifactFingerprint: 'a'.repeat(64), artifacts }));
  writeFileSync(path.join(directory, 'textbook_chunks.jsonl'), books);
  const check = () => execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { directory, books, check };
}

it('accepts Git LF checkout against a pinned CRLF gzip without requiring reindexing', () => {
  expect(fixture().check()).toContain('Manifest integrity verified');
});

it('still rejects actual editable corpus changes', () => {
  const { directory, books, check } = fixture();
  writeFileSync(path.join(directory, 'textbook_chunks.jsonl'), books.replace('Academic', 'Changed'));
  expect(check).toThrow(/textbook_chunks.jsonl.gz is stale/);
});

it('still rejects changed deployed gzip bytes against the pinned manifest', () => {
  const { directory, books, check } = fixture();
  unlinkSync(path.join(directory, 'textbook_chunks.jsonl'));
  writeFileSync(path.join(directory, 'textbook_chunks.jsonl.gz'), gzipSync(books.replace('Academic', 'Changed')));
  expect(check).toThrow(/Deployment manifest mismatch/);
});
