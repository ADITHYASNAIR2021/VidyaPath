import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDeveloper } from '@/lib/developer/guard';
import { getContextPack } from '@/lib/ai/context-retriever';
import { getChapterById } from '@/lib/data';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';

export const dynamic = 'force-dynamic';

const schema = z.object({
  chapterId: z.string().trim().min(1).max(80).default('c10-chem-1'),
  query: z.string().trim().max(300).optional(),
});

/** Runs retrieval only (no LLM call) to prove the RAG index loads and returns grounded snippets. */
export async function POST(req: Request) {
  const denied = await requireDeveloper();
  if (denied) return denied;
  const body = await parseAndValidateJsonBody(req, 4 * 1024, schema);
  if (!body.ok) {
    return NextResponse.json({ ok: false, errorCode: body.reason, message: body.message }, { status: bodyReasonToStatus(body.reason) });
  }
  const chapter = getChapterById(body.value.chapterId);
  if (!chapter) return NextResponse.json({ ok: false, errorCode: 'unknown-chapter', message: 'Unknown chapterId.' }, { status: 404 });

  const started = Date.now();
  try {
    const pack = await getContextPack({
      task: 'chat',
      classLevel: chapter.classLevel,
      subject: chapter.subject,
      chapterId: chapter.id,
      chapterTopics: chapter.topics,
      query: body.value.query || `${chapter.title} ${chapter.topics.slice(0, 4).join(' ')}`,
      topK: 6,
    });
    return NextResponse.json({
      ok: true,
      data: {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        latencyMs: Date.now() - started,
        snippetCount: pack.snippets.length,
        retrieval: pack.retrievalMeta ?? null,
        snippets: pack.snippets.slice(0, 6).map((snippet) => ({
          sourcePath: snippet.sourcePath,
          sourceType: snippet.sourceType,
          relevanceScore: snippet.relevanceScore,
          preview: snippet.text.slice(0, 220),
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, errorCode: 'rag-check-failed', message: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started },
      { status: 500 }
    );
  }
}
