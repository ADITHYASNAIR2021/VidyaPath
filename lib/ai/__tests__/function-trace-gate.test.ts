import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

const script = path.resolve('scripts/check_function_trace_size.mjs');
const fixtures: string[] = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) {
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('vidyapath-traces-')) throw new Error('Unexpected cleanup path');
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'vidyapath-traces-')); fixtures.push(root);
  const context = ['chunks.jsonl.gz', 'textbook_chunks.jsonl.gz', 'chapter_index.json.gz', 'textbook_chapter_index.json.gz', 'retrieval_index.json.gz', 'retrieval_manifest.json'].map((name) => `lib/context/${name}`);
  mkdirSync(path.join(root, 'lib/context'), { recursive: true });
  mkdirSync(path.join(root, '.next/server/app'), { recursive: true });
  for (const file of context) writeFileSync(path.join(root, file), 'x');
  const trace = (relative: string, files: string[]) => {
    const target = path.join(root, '.next/server/app', relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify({ version: 1, files: files.map((file) => path.relative(path.dirname(target), path.join(root, file))) }));
  };
  const check = (limit = '240') => execFileSync(process.execPath, [script], { cwd: root, env: { ...process.env, FUNCTION_TRACE_LIMIT_MB: limit }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { root, context, trace, check };
}

it('allows the standalone Next crash fallback without corpus while checking real page/API traces', () => {
  const { context, trace, check } = fixture();
  trace('_global-error/page.js.nft.json', []);
  trace('api/context-pack/route.js.nft.json', context);
  trace('chapters/[id]/page.js.nft.json', context);
  expect(check()).toContain('All 3 page/API traces');
});

it('still rejects a real retrieval route missing its deployment corpus', () => {
  const { context, trace, check } = fixture();
  trace('_global-error/page.js.nft.json', []);
  trace('api/context-pack/route.js.nft.json', context.slice(1));
  expect(check).toThrow(/Missing deployment corpus/);
});

it('still rejects private artifacts in the standalone crash fallback', () => {
  const { root, trace, check } = fixture();
  writeFileSync(path.join(root, '.env.local'), 'fixture-only');
  trace('_global-error/page.js.nft.json', ['.env.local']);
  expect(check).toThrow(/Private\/offline artifact leaked/);
});

it('still enforces function size on the standalone crash fallback', () => {
  const { root, trace, check } = fixture();
  writeFileSync(path.join(root, 'large-fixture.js'), 'x'.repeat(512));
  trace('_global-error/page.js.nft.json', ['large-fixture.js']);
  expect(() => check('0.0001')).toThrow(/Oversized serverless function traces/);
});

it('fails if no traces were produced', () => {
  expect(fixture().check).toThrow(/No page\/API traces found/);
});
