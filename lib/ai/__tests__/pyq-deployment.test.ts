import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

function corpus(corrupt = false, withPapers = true) {
  const textbook = { id: 'book', sourceType: 'textbook', chapterId: 'c10-chem-2', text: 'Acids bases and salts pH indicators neutralization. '.repeat(5), sourcePath: 'dataset/textbook.pdf' };
  const paper = (year: number) => ({ id: `paper-${year}`, sourceType: 'paper', chapterId: 'c10-chem-2', year, text: 'Explain acids bases pH and salts with suitable indicators. '.repeat(5), sourcePath: `dataset/${year}/paper.pdf` });
  const files = new Map([
    ['chunks.jsonl.gz', gzipSync([...(withPapers ? [paper(2023), paper(2024)] : []), textbook].map((row) => JSON.stringify(row)).join('\n'))],
    ['textbook_chunks.jsonl.gz', gzipSync(JSON.stringify(textbook))],
  ]);
  const manifest = { artifacts: [...files].map(([file, bytes]) => ({ file, sha256: corrupt ? '0'.repeat(64) : createHash('sha256').update(bytes).digest('hex') })) };
  return vi.spyOn(fs, 'readFile').mockImplementation((async (file: Parameters<typeof fs.readFile>[0]) => {
    const name = String(file).replaceAll('\\', '/').split('/').pop()!;
    if (name === 'retrieval_manifest.json') return JSON.stringify(manifest);
    if (files.has(name)) return files.get(name)!;
    throw new Error(`Unexpected/raw corpus read: ${name}`);
  }) as typeof fs.readFile);
}

it('shares concurrent chapter calculations, reads deployed gzip only, and counts mirrored books once', async () => {
  const reads = corpus();
  const { getGroundedPYQData, getGroundedPaperYearUniverse } = await import('@/lib/pyq-grounded');
  const [entry, second, years] = await Promise.all([getGroundedPYQData('c10-chem-2'), getGroundedPYQData('c10-chem-2'), getGroundedPaperYearUniverse()]);
  expect(entry).toEqual(second);
  expect(entry?.meta.paperEvidenceCount).toBe(2);
  expect(entry?.meta.textbookEvidenceCount).toBe(1);
  expect(entry?.yearsAsked).toEqual([2024, 2023]);
  expect(years).toContain(2024);
  expect(reads).toHaveBeenCalledTimes(3);
});

it('rejects corrupted deployed chapter statistics rather than presenting them as grounded', async () => {
  corpus(true);
  const { getGroundedPYQData } = await import('@/lib/pyq-grounded');
  await expect(getGroundedPYQData('c10-chem-2')).rejects.toThrow('PYQ corpus integrity mismatch');
});

it('does not invent paper years or exam frequency from editorial defaults when chapter evidence is missing', async () => {
  corpus(false, false);
  const { getGroundedPYQData, getGroundedFrequencyLabel, getGroundedPaperYearUniverse } = await import('@/lib/pyq-grounded');
  expect((await getGroundedPYQData('c10-eng-6'))?.yearsAsked).toEqual([]);
  expect(await getGroundedFrequencyLabel('c10-eng-6')).toBeNull();
  expect(await getGroundedPaperYearUniverse()).toEqual([]);
});
