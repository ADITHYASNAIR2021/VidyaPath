import { NextResponse } from 'next/server';
import { getPYQData } from '@/lib/pyq';
import { getChapterById } from '@/lib/data';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskJson } from '@/lib/ai/generator';
import { isFlashcardArray, normalizeFlashcards, type FlashcardItem } from '@/lib/ai/validators';
import { buildDynamicFlashcardFallback } from '@/lib/ai/dynamic-fallback';
import { buildVariationInstruction, buildVariationProfile } from '@/lib/ai/variation';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';

function buildFallbackCards(input: {
  subject: string;
  chapterTitle: string;
  chapterTopics: string[];
  pyqTopics?: string[];
  seedText: string;
}): FlashcardItem[] {
  return buildDynamicFlashcardFallback({
    subject: input.subject,
    chapterTitle: input.chapterTitle,
    chapterTopics: input.chapterTopics,
    pyqTopics: input.pyqTopics,
    seedText: input.seedText,
  }, 5);
}

export async function POST(req: Request) {
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const incomingSubject = typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim() : 'CBSE subject';
    const incomingChapterTitle =
      typeof body.chapterTitle === 'string' && body.chapterTitle.trim()
        ? body.chapterTitle.trim()
        : 'this chapter';
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
    const nccontext = typeof body.nccontext === 'string' ? body.nccontext.trim() : '';

    const chapter = chapterId ? getChapterById(chapterId) : undefined;
    const subject = chapter?.subject ?? incomingSubject;
    const chapterTitle = chapter?.title ?? incomingChapterTitle;
    const classLevel = chapter?.classLevel ?? (typeof body.classLevel === 'number' ? body.classLevel : 12);
    const pyq = chapterId ? getPYQData(chapterId) : null;

    const contextPack = await getContextPack({
      task: 'flashcards',
      classLevel,
      subject: chapter?.subject ?? subject,
      chapterId: chapter?.id ?? (chapterId || undefined),
      chapterTopics: chapter?.topics ?? [],
      query: `${chapterTitle} ${subject} ${pyq?.importantTopics.join(' ') ?? ''}`.trim(),
      topK: 4,
    });

    const pyqContext = pyq
      ? `PYQ Signal: avg marks ${pyq.avgMarks}, years asked ${[...pyq.yearsAsked].sort((a, b) => b - a).slice(0, 6).join(', ')}, important topics ${pyq.importantTopics.join(', ')}.`
      : 'No PYQ signal available for this chapter.';
    const variation = buildVariationProfile({
      task: 'flashcards',
      contextHash: contextPack.contextHash,
      chapterId: (chapter?.id ?? chapterId) || undefined,
    });

    const schemaNote = `Return ONLY valid JSON array:
[{"front":"...", "back":"..."}]
Exactly 5 cards.`;

    const userPrompt = `Generate 5 high-yield flashcards for Class ${classLevel} ${subject}, chapter "${chapterTitle}".
${pyqContext}
NCERT context (optional): ${nccontext || 'Use retrieved context snippets and chapter fundamentals.'}
${buildVariationInstruction(variation)}

${schemaNote}`;

    const { data, result } = await generateTaskJson<FlashcardItem[]>({
      task: 'flashcards',
      contextHash: contextPack.contextHash,
      contextSnippets: contextPack.snippets,
      chapterId: chapter?.id ?? (chapterId || undefined),
      diversityKey: variation.diversityKey,
      systemPrompt: `You are VidyaAI Flashcard Engine for CBSE.
- Prioritize board-marking phrasing.
- Keep answers concise, factual, and revision-friendly.
- Avoid hallucinations and unsupported claims.
- Use simple student-friendly language.
- Ensure each run has phrasing variety and different recall prompts.
- Do not include citation tokens like [S1] in the output.
- Output JSON only.`,
      userPrompt,
      temperature: 0.2,
      maxOutputTokens: 1300,
      validate: isFlashcardArray,
    });

    const normalized = normalizeFlashcards(data);
    const fallback = buildFallbackCards({
      subject,
      chapterTitle,
      chapterTopics: chapter?.topics ?? [],
      pyqTopics: pyq?.importantTopics,
      seedText: variation.diversityKey,
    });
    const merged: FlashcardItem[] = [];
    const seen = new Set<string>();
    for (const card of normalized) {
      const key = `${card.front}|${card.back}`.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(card);
      if (merged.length >= 5) break;
    }
    for (const card of fallback) {
      if (merged.length >= 5) break;
      const key = `${card.front}|${card.back}`.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(card);
    }
    await logAiUsage({
      context,
      endpoint: '/api/generate-flashcards',
      provider: result.provider,
      model: result.model,
      promptText: userPrompt,
      completionText: JSON.stringify(merged.slice(0, 5)),
      estimated: true,
    });
    return NextResponse.json({ success: true, data: merged.slice(0, 5) });
  } catch (error) {
    console.error('[Flashcard API Error]:', error);
    return NextResponse.json(
      {
        success: true,
        data: buildFallbackCards({
          subject: 'CBSE subject',
          chapterTitle: 'this chapter',
          chapterTopics: ['core definitions', 'applications', 'common mistakes'],
          seedText: `fallback:${Date.now()}`,
        }),
      },
      { status: 200 }
    );
  }
}
