import { NextResponse } from 'next/server';
import { getPYQData } from '@/lib/pyq';

interface FlashcardResponse {
  front: string;
  back: string;
}

const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';

function isUsableGroqApiKey(key: string | undefined): key is string {
  if (!key) return false;
  const normalized = key.trim();
  if (!normalized.startsWith('gsk_')) return false;

  const lower = normalized.toLowerCase();
  const blockedFragments = [
    'placeholder',
    'your_groq_api_key_here',
    'your_api_key_here',
    'replace_me',
    'changeme',
  ];

  return !blockedFragments.some((fragment) => lower.includes(fragment));
}

function isUsableGeminiApiKey(key: string | undefined): key is string {
  if (!key) return false;
  const normalized = key.trim();
  if (!normalized.startsWith('AIza')) return false;

  const lower = normalized.toLowerCase();
  const blockedFragments = [
    'placeholder',
    'your_gemini_api_key_here',
    'your_api_key_here',
    'replace_me',
    'changeme',
  ];

  return !blockedFragments.some((fragment) => lower.includes(fragment));
}

function stripCodeFence(input: string): string {
  return input
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseFlashcards(content: string): FlashcardResponse[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    return [];
  }

  const rawArray = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>).flashcards ??
        (parsed as Record<string, unknown>).data ??
        (parsed as Record<string, unknown>).cards
      : null;

  if (!Array.isArray(rawArray)) return [];

  return rawArray
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const front = typeof record.front === 'string' ? record.front.trim() : '';
      const back = typeof record.back === 'string' ? record.back.trim() : '';
      if (!front || !back) return null;
      return { front, back } satisfies FlashcardResponse;
    })
    .filter((card): card is FlashcardResponse => card !== null);
}

function buildFallbackCards(subject: string, chapterTitle: string): FlashcardResponse[] {
  return [
    {
      front: `Define the core concept of ${chapterTitle} in ${subject}.`,
      back: 'It is the foundational mechanism introduced in NCERT for this chapter.',
    },
    {
      front: 'What standard unit is commonly used in this chapter?',
      back: 'Use the SI unit emphasized in NCERT numericals and derivations.',
    },
    {
      front: `Name one important exception or edge case from ${chapterTitle}.`,
      back: 'Revise textbook edge cases and conditions where the primary rule does not apply directly.',
    },
  ];
}

async function callGroq(apiKey: string, model: string, systemPrompt: string, userPrompt: string) {
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1200,
      stream: false,
    }),
  });
}

async function callGemini(apiKey: string, systemPrompt: string, userPrompt: string) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1400,
        },
      }),
    }
  );
}

function readGeminiText(payload: unknown): string {
  const root = payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  return root?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim() ?? '';
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const subject = typeof body?.subject === 'string' && body.subject.trim() ? body.subject.trim() : 'CBSE subject';
    const chapterTitle =
      typeof body?.chapterTitle === 'string' && body.chapterTitle.trim()
        ? body.chapterTitle.trim()
        : 'this chapter';
    const chapterId = typeof body?.chapterId === 'string' ? body.chapterId.trim() : '';
    const nccontext = typeof body?.nccontext === 'string' ? body.nccontext.trim() : '';
    const pyq = chapterId ? getPYQData(chapterId) : null;

    const groqApiKey = process.env.GROQ_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const hasGroq = isUsableGroqApiKey(groqApiKey);
    const hasGemini = isUsableGeminiApiKey(geminiApiKey);

    if (!hasGroq && !hasGemini) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return NextResponse.json({ success: true, data: buildFallbackCards(subject, chapterTitle) });
    }

    const systemPrompt = `You are an expert CBSE/NCERT curriculum extractor.
Your job is to generate 5 high-yield flashcards for the subject: ${subject}, chapter: ${chapterTitle}.
Format as a strictly valid JSON array of objects with the exact keys: 'front' (the question/prompt), 'back' (the direct, accurate answer).
Ensure answers are concise, textbook-accurate, and ideal for spaced repetition learning.
Return ONLY valid JSON. Do not wrap in markdown blocks.`;

    const pyqContext = pyq
      ? `\nPYQ focus:\n- Avg marks: ${pyq.avgMarks}\n- Years asked: ${[...pyq.yearsAsked].sort((a, b) => b - a).slice(0, 6).join(', ')}\n- Important topics: ${pyq.importantTopics.join(', ')}`
      : '';

    const userPrompt = `NCERT Context:\n"""${nccontext || 'General chapter logic...'}"""${pyqContext}\n\nGenerate the flashcards JSON now.`;

    let content = '';
    let lastGroqStatus = 0;

    if (hasGroq && groqApiKey) {
      let response = await callGroq(groqApiKey, PRIMARY_MODEL, systemPrompt, userPrompt);
      lastGroqStatus = response.status;
      if (response.status === 429) {
        response = await callGroq(groqApiKey, FALLBACK_MODEL, systemPrompt, userPrompt);
        lastGroqStatus = response.status;
      }

      if (response.ok) {
        const aiRes = await response.json();
        content = aiRes?.choices?.[0]?.message?.content ?? '';
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Flashcard Groq Error]:', response.status, errorData);
      }
    }

    if (!content && hasGemini && geminiApiKey) {
      const geminiResponse = await callGemini(geminiApiKey, systemPrompt, userPrompt);
      if (geminiResponse.ok) {
        const geminiData = await geminiResponse.json().catch(() => ({}));
        content = readGeminiText(geminiData);
      } else {
        const errorData = await geminiResponse.json().catch(() => ({}));
        console.error('[Flashcard Gemini Error]:', geminiResponse.status, errorData);
      }
    }

    const parsedData = typeof content === 'string' ? parseFlashcards(content) : [];

    if (parsedData.length === 0) {
      if (lastGroqStatus === 429 && !hasGemini) {
        return NextResponse.json(
          { success: false, error: 'Flashcard generation is busy right now. Please try again in 30 seconds.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'AI returned an invalid flashcard format. Please try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: parsedData });

  } catch (error: unknown) {
    console.error('[Flashcard API Error]:', error);
    const message = error instanceof Error ? error.message : 'Unexpected flashcard API error.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
