import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

const script = path.resolve('scripts/check_function_trace_size.mjs');
const finalizeScript = path.resolve('scripts/prune_function_traces.mjs');
const require = createRequire(import.meta.url);
const deployment = require(path.resolve('config/context-deployment.cjs')) as {
  corpusFiles: string[]; corpusRoutes: string[]; corpusTraceEntries: string[]; tracingIncludes: Record<string, string[]>;
};
const fixtures: string[] = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) {
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('vidyapath-traces-')) throw new Error('Unexpected cleanup path');
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(includeRetrieval = true) {
  const root = mkdtempSync(path.join(tmpdir(), 'vidyapath-traces-')); fixtures.push(root);
  const context = deployment.corpusFiles;
  mkdirSync(path.join(root, 'lib/context'), { recursive: true });
  mkdirSync(path.join(root, '.next/server/app'), { recursive: true });
  for (const file of context) writeFileSync(path.join(root, file), 'x');
  const trace = (relative: string, files: string[]) => {
    const target = path.join(root, '.next/server/app', relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify({ version: 1, files: files.map((file) => path.relative(path.dirname(target), path.join(root, file))) }));
  };
  const check = (limit = '240') => execFileSync(process.execPath, [script], { cwd: root, env: { ...process.env, FUNCTION_TRACE_LIMIT_MB: limit }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (includeRetrieval) for (const entry of deployment.corpusTraceEntries) trace(entry, context);
  const finalize = () => execFileSync(process.execPath, [finalizeScript], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { root, context, trace, check, finalize };
}

it('accepts Linux/Vercel framework, static and unrelated API traces without chapter data', () => {
  const { trace, check } = fixture();
  const unrelated = ['_global-error/page.js.nft.json', '_not-found/page.js.nft.json', 'privacy/page.js.nft.json', 'robots.txt/route.js.nft.json', 'api/health/route.js.nft.json', 'api/career/exams/route.js.nft.json'];
  for (const entry of unrelated) trace(entry, []);
  const output = check();
  expect(output).toContain(`All ${deployment.corpusTraceEntries.length + unrelated.length} page/API traces`);
  expect(output).toContain(`Deployment corpus verified in all ${deployment.corpusTraceEntries.length} retrieval functions`);
});

it('still rejects a real retrieval route missing its deployment corpus', () => {
  const { context, trace, check } = fixture();
  trace('_global-error/page.js.nft.json', []);
  trace('api/context-pack/route.js.nft.json', context.slice(1));
  expect(check).toThrow(/Missing deployment corpus/);
});

it.each(['_global-error', '_not-found', 'privacy'])('still rejects private artifacts in %s', (entry) => {
  const { root, trace, check } = fixture();
  writeFileSync(path.join(root, '.env.local'), 'fixture-only');
  trace(`${entry}/page.js.nft.json`, ['.env.local']);
  expect(check).toThrow(/Private\/offline artifact leaked/);
});

it.each(['_global-error', '_not-found', 'privacy'])('still enforces function size on %s', (entry) => {
  const { root, trace, check } = fixture();
  writeFileSync(path.join(root, 'large-fixture.js'), 'x'.repeat(512));
  trace(`${entry}/page.js.nft.json`, ['large-fixture.js']);
  expect(() => check('0.0001')).toThrow(/Oversized serverless function traces/);
});

it('fails if no traces were produced', () => {
  expect(fixture(false).check).toThrow(/No page\/API traces found/);
});

it('rejects an entirely missing retrieval function trace', () => {
  const { root, check } = fixture();
  unlinkSync(path.join(root, '.next/server/app/api/context-pack/route.js.nft.json'));
  expect(check).toThrow(/Missing retrieval function trace/);
});

it('rejects a corpus file listed in the trace but absent from deployment', () => {
  const { root, context, check } = fixture();
  unlinkSync(path.join(root, context[0]));
  expect(check).toThrow(/Missing deployment corpus/);
});

it('covers the actual page/API entries that read retrieval or chapter statistics', () => {
  const root = path.resolve('app');
  const consumers: string[] = [];
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/^(?:page|route)\.tsx?$/.test(entry.name) && /from\s+['"]@\/lib\/(?:ai\/(?:context-retriever|retrieval-report)|pyq-grounded|developer\/overview)['"]/.test(readFileSync(file, 'utf8'))) {
        consumers.push('/' + path.relative(root, path.dirname(file)).replaceAll('\\', '/'));
      }
    }
  }
  scan(root);
  expect(consumers.length).toBeGreaterThan(10);
  for (const route of consumers) expect(deployment.corpusRoutes).toContain(route);
});

it('uses valid Next tracing globs including literal dynamic chapter brackets', () => {
  const match = require('next/dist/compiled/picomatch') as (pattern: string, options: object) => (route: string) => boolean;
  const patterns = Object.keys(deployment.tracingIncludes).map((pattern) => match(pattern, { dot: true, contains: true }));
  for (const route of deployment.corpusRoutes) expect(patterns.some((test) => test(route))).toBe(true);
  for (const route of ['/_not-found', '/_global-error', '/privacy', '/api/health']) expect(patterns.some((test) => test(route))).toBe(false);
});

it('packages Vercel-style omitted corpus references into every retrieval trace before verifying', () => {
  const { root, trace, check, finalize } = fixture();
  for (const entry of deployment.corpusTraceEntries) trace(entry, []);
  trace('_not-found/page.js.nft.json', []);
  expect(check).toThrow(/Missing deployment corpus/);
  expect(finalize()).toContain('added 90 approved corpus references');
  expect(check()).toContain('Deployment corpus verified in all 15 retrieval functions');
  expect(JSON.parse(readFileSync(path.join(root, '.next/server/app/_not-found/page.js.nft.json'), 'utf8')).files).toEqual([]);
  expect(finalize()).toContain('added 0 approved corpus references');
});

it('refuses to fabricate a missing corpus file when finalizing traces', () => {
  const { root, context, finalize } = fixture();
  unlinkSync(path.join(root, context[0]));
  expect(finalize).toThrow(/Missing deployment corpus on disk/);
});

it('finalizes approved corpus files while removing private artifacts from all traces', () => {
  const { root, trace, check, finalize } = fixture();
  writeFileSync(path.join(root, '.env.local'), 'fixture-only');
  trace('api/adaptive-test/route.js.nft.json', ['.env.local']);
  trace('_not-found/page.js.nft.json', ['.env.local']);
  expect(finalize()).toContain('removed 2 offline/private references');
  expect(check()).toContain('Deployment corpus verified');
});
