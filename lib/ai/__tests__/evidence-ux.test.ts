import { describe, expect, it } from 'vitest';
import { buildEvidenceBundle, buildStudentPracticeSignal } from '@/lib/ai/evidence-ux';
import type { ContextPack } from '@/lib/ai/context-retriever';

describe('AI evidence UX helpers', () => {
  it('builds evidence bundles with chapter and locator hints', () => {
    const pack: ContextPack = {
      snippets: [
        {
          id: 's1',
          text: 'Ohm law states that V = IR and current increases linearly with voltage.',
          sourcePath: 'ncert/class10/science/electricity.pdf',
          classLevel: 10,
          subject: 'Science',
          sourceType: 'textbook',
          chapterId: 'class10-science-ch12',
          page: 187,
          chunkIndex: 1,
          relevanceScore: 91,
        },
      ],
      contextHash: 'test-pack',
      usedOnDemandFallback: false,
      usedPgvector: true,
      retrievalMeta: {
        snippetCount: 1,
        averageRelevance: 91,
        sourceMix: ['textbook'],
        chapterMatchCount: 1,
        confidence: 84,
        confidenceLevel: 'high',
        confidenceReasons: ['Exact chapter hit'],
        correctiveActions: [],
        topicFocus: ['electric current'],
        visualSnippetCount: 0,
        strategies: ['chapter-filter'],
      },
    };

    const bundle = buildEvidenceBundle({
      contextPack: pack,
      chapterContext: {
        chapterId: 'class10-science-ch12',
        title: 'Electricity',
        subject: 'Science',
        classLevel: 10,
      },
    });

    expect(bundle.chapterUsed?.title).toBe('Electricity');
    expect(bundle.textbookSnippets[0]?.page).toBe(187);
    expect(bundle.textbookSnippets[0]?.locatorHint).toContain('Page 187');
    expect(bundle.confidence.score).toBe(84);
    expect(bundle.confidence.level).toBe('high');
  });

  it('derives practice urgency from accuracy and weak-question signals', () => {
    const signal = buildStudentPracticeSignal({
      attempted: 6,
      accuracyRate: 0.33,
      weakQuestions: ['Find the equivalent resistance', 'State Ohm law'],
    });

    expect(signal.performanceBand).toBe('foundation');
    expect(signal.reviewUrgency).toBe('high');
    expect(signal.accuracyPercent).toBe(33);
  });
});
