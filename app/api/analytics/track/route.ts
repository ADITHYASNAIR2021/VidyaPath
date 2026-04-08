import { NextResponse } from 'next/server';
import { trackAiQuestion, trackChapterView, trackSearchNoResult } from '@/lib/analytics-store';

interface TrackPayload {
  eventName?: string;
  chapterId?: string;
  query?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as TrackPayload | null;
    if (!body || typeof body !== 'object' || typeof body.eventName !== 'string') {
      return NextResponse.json({ error: 'Invalid analytics payload.' }, { status: 400 });
    }

    const eventName = body.eventName.trim();
    if (eventName === 'chapter_view' && body.chapterId) {
      await trackChapterView(body.chapterId);
    } else if (eventName === 'ai_question' && body.chapterId) {
      await trackAiQuestion(body.chapterId);
    } else if (eventName === 'search_no_result' && body.query) {
      await trackSearchNoResult(body.query);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[analytics-track] error', error);
    return NextResponse.json({ ok: true });
  }
}
