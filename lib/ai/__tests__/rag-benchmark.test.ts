import { describe, expect, it } from 'vitest';
import { runRagBenchmark } from '@/lib/ai/rag-benchmark';

describe('RAG benchmark harness', () => {
  it('runs retrieval benchmark cases and emits aggregate metrics', async () => {
    const report = await runRagBenchmark();

    expect(report.totalCases).toBeGreaterThan(0);
    expect(report.executedCases).toBeGreaterThan(0);
    expect(report.executedCases + report.skippedCases).toBe(report.totalCases);
    expect(report.executedCases).toBeGreaterThanOrEqual(Math.max(8, Math.floor(report.totalCases * 0.7)));
    expect(report.metrics.chapterHitRate).toBeGreaterThanOrEqual(0.75);
    expect(report.metrics.avgTermRecall).toBeGreaterThanOrEqual(0);
    expect(report.metrics.avgTop3TermRecall).toBeGreaterThanOrEqual(0.35);
    expect(report.metrics.avgReciprocalHitRank).toBeGreaterThanOrEqual(0.2);
    expect(report.metrics.diagramHitRate).toBeGreaterThanOrEqual(0.5);
    expect(report.metrics.avgConfidence).toBeGreaterThanOrEqual(40);
    expect(report.metrics.passRate).toBeGreaterThanOrEqual(0.5);

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
