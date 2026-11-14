import { describe, expect, it } from 'vitest';
import { runRagBenchmark } from '@/lib/ai/rag-benchmark';
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

describe('RAG benchmark harness', () => {
  it('runs retrieval benchmark cases and emits aggregate metrics', async () => {
    const report = await runRagBenchmark();
    if (process.env.RAG_BENCHMARK_REPORT) {
      const artifacts = ['chunks.jsonl.gz', 'textbook_chunks.jsonl.gz', 'retrieval_index.json.gz', 'chapter_index.json.gz', 'textbook_chapter_index.json.gz'];
      const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
      const artifactFingerprint = hash(artifacts.map((file) => `${file}:${hash(readFileSync(`lib/context/${file}`))}`).join('\n'));
      const benchmarkSeedHash = hash(readFileSync('lib/ai/rag-benchmark-seed.ts'));
      const retrievalCodeHash = hash(['lib/ai/context-retriever.ts', 'lib/ai/retrieval-index.ts', 'lib/ai/retrieval-enhancements.ts', 'lib/data.ts'].map((file) => `${file}:${hash(readFileSync(file))}`).join('\n'));
      await writeFile(process.env.RAG_BENCHMARK_REPORT, JSON.stringify({ ...report, artifactFingerprint, benchmarkSeedHash, retrievalCodeHash }, null, 2));
    }

    expect(report.totalCases).toBeGreaterThan(0);
    expect(report.executedCases).toBeGreaterThan(0);
    expect(report.executedCases + report.skippedCases).toBe(report.totalCases);
    expect(report.executedCases).toBeGreaterThanOrEqual(Math.max(8, Math.floor(report.totalCases * 0.7)));
    expect(report.metrics.chapterHitRate).toBeGreaterThanOrEqual(0.75);
    expect(report.metrics.avgTermRecall).toBeGreaterThanOrEqual(0);
    expect(report.metrics.avgTop3TermRecall).toBeGreaterThanOrEqual(0.8);
    expect(report.metrics.avgReciprocalHitRank).toBeGreaterThanOrEqual(0.2);
    expect(report.metrics.diagramHitRate).toBeGreaterThanOrEqual(0.5);
    expect(report.metrics.avgConfidence).toBeGreaterThanOrEqual(40);
    expect(report.metrics.passRate).toBeGreaterThanOrEqual(0.9);

    console.log(
      '[rag-benchmark]',
      JSON.stringify(
        {
          generatedAt: report.generatedAt,
          totals: {
            totalCases: report.totalCases,
            executedCases: report.executedCases,
            skippedCases: report.skippedCases,
            passedCases: report.passedCases,
          },
          metrics: report.metrics,
        },
        null,
        2
      )
    );
  }, 120000);
});
