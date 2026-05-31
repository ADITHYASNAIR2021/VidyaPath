import { getChapterById } from '@/lib/data';
import { getContextPack } from '@/lib/ai/context-retriever';
import { RAG_BENCHMARK_SEED, type RagBenchmarkCase } from '@/lib/ai/rag-benchmark-seed';

export interface RagBenchmarkCaseResult {
  id: string;
  chapterId?: string;
  subject?: string;
  skipped: boolean;
  reason?: string;
  expectedChapter: boolean;
  expectedDiagram: boolean;
  chapterHit: boolean;
  termRecall: number;
  top1TermRecall: number;
  top3TermRecall: number;
  reciprocalHitRank: number;
  ndcgAt3: number;
  precisionAt3: number;
  diagramHit: boolean;
  confidence: number;
  confidenceLevel?: 'low' | 'medium' | 'high';
  snippetCount: number;
  sourceMix: string[];
}

export interface RagBenchmarkReport {
  generatedAt: string;
  totalCases: number;
  executedCases: number;
  skippedCases: number;
  passedCases: number;
  metrics: {
    chapterHitRate: number;
    avgTermRecall: number;
    avgTop1TermRecall: number;
    avgTop3TermRecall: number;
    avgReciprocalHitRank: number;
    avgNdcgAt3: number;
    avgPrecisionAt3: number;
    diagramHitRate: number;
    avgConfidence: number;
    passRate: number;
  };
  chapterBreakdown: Array<{
    chapterId: string;
    subject: string;
    cases: number;
    passRate: number;
    avgConfidence: number;
  }>;
  coverageGaps: Array<{
    chapterId: string;
    subject: string;
    reason: string;
  }>;
  cases: RagBenchmarkCaseResult[];
}

function scoreTermRecall(snippetsText: string, expectedTerms: string[]): number {
  if (expectedTerms.length === 0) return 1;
  const lower = snippetsText.toLowerCase();
  const hits = expectedTerms.filter((term) => lower.includes(term.toLowerCase())).length;
  return Number((hits / expectedTerms.length).toFixed(2));
}

function scorePositionalTermRecall(snippets: string[], expectedTerms: string[], window: number): number {
  if (expectedTerms.length === 0) return 1;
  const lower = snippets.slice(0, window).join(' \n ').toLowerCase();
  const hits = expectedTerms.filter((term) => lower.includes(term.toLowerCase())).length;
  return Number((hits / expectedTerms.length).toFixed(2));
}

function scoreReciprocalHitRank(snippets: string[], expectedTerms: string[]): number {
  if (expectedTerms.length === 0) return 1;
  for (let index = 0; index < snippets.length; index += 1) {
    const lower = snippets[index].toLowerCase();
    if (expectedTerms.some((term) => lower.includes(term.toLowerCase()))) {
      return Number((1 / (index + 1)).toFixed(2));
    }
  }
  return 0;
}

function countSnippetTermHits(snippet: string, expectedTerms: string[]): number {
  const lower = snippet.toLowerCase();
  return expectedTerms.filter((term) => lower.includes(term.toLowerCase())).length;
}

function scorePrecisionAtK(snippets: string[], expectedTerms: string[], window: number): number {
  if (expectedTerms.length === 0) return 1;
  const ranked = snippets.slice(0, window);
  if (ranked.length === 0) return 0;
  const relevantCount = ranked.filter((snippet) => countSnippetTermHits(snippet, expectedTerms) > 0).length;
  return Number((relevantCount / ranked.length).toFixed(2));
}

function scoreNdcgAtK(snippets: string[], expectedTerms: string[], window: number): number {
  if (expectedTerms.length === 0) return 1;
  const graded = snippets
    .slice(0, window)
    .map((snippet) => countSnippetTermHits(snippet, expectedTerms) / expectedTerms.length);
  if (graded.length === 0) return 0;

  const dcg = graded.reduce((sum, relevance, index) => {
    const denominator = Math.log2(index + 2);
    return sum + relevance / denominator;
  }, 0);
  const ideal = [...graded].sort((a, b) => b - a);
  const idcg = ideal.reduce((sum, relevance, index) => {
    const denominator = Math.log2(index + 2);
    return sum + relevance / denominator;
  }, 0);
  if (idcg <= 0) return 0;
  return Number((dcg / idcg).toFixed(2));
}

export async function runRagBenchmark(cases: RagBenchmarkCase[] = RAG_BENCHMARK_SEED): Promise<RagBenchmarkReport> {
  const results: RagBenchmarkCaseResult[] = [];

  for (const testCase of cases) {
    const chapter = testCase.chapterId ? getChapterById(testCase.chapterId) : undefined;
    if (testCase.chapterId && !chapter) {
      results.push({
        id: testCase.id,
        chapterId: testCase.chapterId,
        subject: testCase.subject,
        skipped: true,
        reason: `Missing chapter metadata for ${testCase.chapterId}`,
        expectedChapter: !!testCase.chapterId,
        expectedDiagram: !!testCase.expectDiagram,
        chapterHit: false,
        termRecall: 0,
        top1TermRecall: 0,
        top3TermRecall: 0,
        reciprocalHitRank: 0,
        ndcgAt3: 0,
        precisionAt3: 0,
        diagramHit: false,
        confidence: 0,
        snippetCount: 0,
        sourceMix: [],
      });
      continue;
    }

    const contextPack = await getContextPack({
      task: testCase.task,
      classLevel: chapter?.classLevel ?? testCase.classLevel,
      subject: chapter?.subject ?? testCase.subject,
      chapterId: chapter?.id ?? testCase.chapterId,
      chapterTopics: chapter?.topics ?? [],
      query: testCase.query,
      topK: 8,
    });

    const snippetTexts = contextPack.snippets.map((snippet) => snippet.text);
    const snippetsText = snippetTexts.join(' \n ');
    const chapterHit = !!testCase.chapterId && contextPack.snippets.some((snippet) => snippet.chapterId === testCase.chapterId);
    const diagramHit = testCase.expectDiagram
      ? contextPack.snippets.some(
          (snippet) => snippet.sourceType === 'image-ocr' || (snippet.modalityHints ?? []).includes('diagram')
        )
      : true;
    const termRecall = scoreTermRecall(snippetsText, testCase.expectedTerms);
    const top1TermRecall = scorePositionalTermRecall(snippetTexts, testCase.expectedTerms, 1);
    const top3TermRecall = scorePositionalTermRecall(snippetTexts, testCase.expectedTerms, 3);
    const reciprocalHitRank = scoreReciprocalHitRank(snippetTexts, testCase.expectedTerms);
    const ndcgAt3 = scoreNdcgAtK(snippetTexts, testCase.expectedTerms, 3);
    const precisionAt3 = scorePrecisionAtK(snippetTexts, testCase.expectedTerms, 3);
    const confidence = contextPack.retrievalMeta?.confidence ?? 0;
    const passed = (chapterHit || !testCase.chapterId) && termRecall >= 0.7 && (!testCase.expectDiagram || diagramHit);

    results.push({
      id: testCase.id,
      chapterId: testCase.chapterId,
      subject: chapter?.subject ?? testCase.subject,
      skipped: false,
      expectedChapter: !!testCase.chapterId,
      expectedDiagram: !!testCase.expectDiagram,
      chapterHit,
      termRecall,
      top1TermRecall,
      top3TermRecall,
      reciprocalHitRank,
      ndcgAt3,
      precisionAt3,
      diagramHit,
      confidence,
      confidenceLevel: contextPack.retrievalMeta?.confidenceLevel,
      snippetCount: contextPack.snippets.length,
      sourceMix: contextPack.retrievalMeta?.sourceMix ?? [],
      reason: passed ? undefined : 'retrieval did not meet benchmark threshold',
    });
  }

  const executed = results.filter((result) => !result.skipped);
  const passed = executed.filter(
    (result) => (result.chapterHit || !result.expectedChapter) && result.termRecall >= 0.7 && (!result.expectedDiagram || result.diagramHit)
  );

  const safeRate = (value: number, total: number): number => (total > 0 ? Number((value / total).toFixed(2)) : 0);
  const avg = (values: number[]): number =>
    values.length > 0 ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0;

  const chapterBreakdown = [...executed.reduce((map, result) => {
    if (!result.chapterId) return map;
    const key = `${result.chapterId}::${result.subject || 'unknown'}`;
    const current = map.get(key) ?? {
      chapterId: result.chapterId,
      subject: result.subject || 'unknown',
      cases: 0,
      passed: 0,
      confidences: [] as number[],
    };
    current.cases += 1;
    const passedCase = (result.chapterHit || !result.expectedChapter) && result.termRecall >= 0.7 && (!result.expectedDiagram || result.diagramHit);
    if (passedCase) current.passed += 1;
    current.confidences.push(result.confidence);
    map.set(key, current);
    return map;
  }, new Map<string, { chapterId: string; subject: string; cases: number; passed: number; confidences: number[] }>()).values()]
    .map((entry) => ({
      chapterId: entry.chapterId,
      subject: entry.subject,
      cases: entry.cases,
      passRate: safeRate(entry.passed, entry.cases),
      avgConfidence: avg(entry.confidences),
    }))
    .sort((a, b) => a.passRate - b.passRate || a.avgConfidence - b.avgConfidence);

  const coverageGaps = chapterBreakdown
    .filter((entry) => entry.passRate < 0.75 || entry.avgConfidence < 45)
    .map((entry) => ({
      chapterId: entry.chapterId,
      subject: entry.subject,
      reason:
        entry.passRate < 0.75
          ? `benchmark pass rate is only ${entry.passRate}`
          : `average retrieval confidence is only ${entry.avgConfidence}`,
    }));

  return {
    generatedAt: new Date().toISOString(),
    totalCases: results.length,
    executedCases: executed.length,
    skippedCases: results.length - executed.length,
    passedCases: passed.length,
    metrics: {
      chapterHitRate: safeRate(executed.filter((result) => result.chapterHit).length, executed.length),
      avgTermRecall: avg(executed.map((result) => result.termRecall)),
      avgTop1TermRecall: avg(executed.map((result) => result.top1TermRecall)),
      avgTop3TermRecall: avg(executed.map((result) => result.top3TermRecall)),
      avgReciprocalHitRank: avg(executed.map((result) => result.reciprocalHitRank)),
      avgNdcgAt3: avg(executed.map((result) => result.ndcgAt3)),
      avgPrecisionAt3: avg(executed.map((result) => result.precisionAt3)),
      diagramHitRate: safeRate(
        executed.filter((result) => result.expectedDiagram && result.diagramHit).length,
        executed.filter((result) => result.expectedDiagram).length || 1
      ),
      avgConfidence: avg(executed.map((result) => result.confidence)),
      passRate: safeRate(passed.length, executed.length),
    },
    chapterBreakdown,
    coverageGaps,
    cases: results,
  };
}
