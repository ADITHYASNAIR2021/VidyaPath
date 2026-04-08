import { NextResponse } from 'next/server';
import { getPYQData } from '@/lib/pyq';

// Type definition for the expected quiz output
interface QuizQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
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

function parseQuizQuestions(content: string): QuizQuestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    return [];
  }

  const rawArray = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>).quiz ??
        (parsed as Record<string, unknown>).data ??
        (parsed as Record<string, unknown>).questions
      : null;

  if (!Array.isArray(rawArray)) return [];

  return rawArray
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const question = typeof record.question === 'string' ? record.question.trim() : '';
      const explanation = typeof record.explanation === 'string' ? record.explanation.trim() : '';
      const answer = typeof record.answer === 'number' ? record.answer : Number(record.answer);
      const options = Array.isArray(record.options)
        ? record.options.filter((opt): opt is string => typeof opt === 'string').map((opt) => opt.trim())
        : [];

      if (!question || options.length !== 4 || Number.isNaN(answer) || answer < 0 || answer > 3) {
        return null;
      }

      return {
        question,
        options,
        answer,
        explanation: explanation || 'Review this concept in NCERT once more.',
      } satisfies QuizQuestion;
    })
    .filter((q): q is QuizQuestion => q !== null);
}

function buildFallbackQuiz(subject: string, chapterTitle: string): QuizQuestion[] {
  return [
    {
      question: `Which fundamental principle of ${subject} is highlighted in ${chapterTitle}?`,
      options: [
        'The Principle of Conservation',
        'The Laws of Thermodynamics',
        'The General Theory of Relativity',
        'NCERT Specific Phenomenon XYZ',
      ],
      answer: 0,
      explanation: `According to NCERT, conservation principles are central to ${chapterTitle}.`,
    },
    {
      question: 'Based on NCERT, what is a key limitation of the ideal model discussed?',
      options: [
        'It only applies in perfectly elastic scenarios.',
        'It is heavily dependent on temperature.',
        'It neglects friction and air resistance.',
        'It cannot be practically tested.',
      ],
      answer: 2,
      explanation:
        'Most textbook models assume ideal conditions and ignore real-world effects such as friction.',
    },
    {
      question: `What happens when the key variable in ${chapterTitle} is doubled in a direct relation?`,
      options: [
        'The result is halved.',
        'The result doubles.',
        'The result is squared.',
        'There is no effect.',
      ],
      answer: 1,
      explanation: 'In direct proportionality, doubling input doubles output.',
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
      temperature: 0.1,
      max_tokens: 1400,
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
          temperature: 0.15,
          maxOutputTokens: 1600,
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
      return NextResponse.json({ success: true, data: buildFallbackQuiz(subject, chapterTitle) });
    }

    const systemPrompt = `You are an expert CBSE/NCERT curriculum evaluator.
Your job is to generate 5 multiple-choice questions for subject: ${subject}, chapter: ${chapterTitle}.
All questions MUST be entirely factual, textbook-accurate, and grounded ONLY in the provided NCERT context.
Return ONLY a strictly valid JSON array.
Each object must include these keys exactly:
- question (string)
- options (array of exactly 4 strings)
- answer (number from 0 to 3)
- explanation (string)
Do NOT use markdown fences. Return pure JSON only.`;

    const pyqContext = pyq
      ? `\nPYQ focus:\n- Avg marks: ${pyq.avgMarks}\n- Years asked: ${[...pyq.yearsAsked].sort((a, b) => b - a).slice(0, 6).join(', ')}\n- Important topics: ${pyq.importantTopics.join(', ')}`
      : '';

    const userPrompt = `NCERT Context snippet:\n"""${nccontext || 'General chapter logic...'}"""${pyqContext}\n\nGenerate the quiz JSON now.`;

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
        console.error('[Quiz Groq Error]:', response.status, errorData);
      }
    }

    if (!content && hasGemini && geminiApiKey) {
      const geminiResponse = await callGemini(geminiApiKey, systemPrompt, userPrompt);
      if (geminiResponse.ok) {
        const geminiData = await geminiResponse.json().catch(() => ({}));
        content = readGeminiText(geminiData);
      } else {
        const errorData = await geminiResponse.json().catch(() => ({}));
        console.error('[Quiz Gemini Error]:', geminiResponse.status, errorData);
      }
    }

    const parsedData = typeof content === 'string' ? parseQuizQuestions(content) : [];

    if (parsedData.length === 0) {
      if (lastGroqStatus === 429 && !hasGemini) {
        return NextResponse.json(
          { success: false, error: 'Quiz generation is busy right now. Please try again in 30 seconds.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'AI returned an invalid quiz format. Please try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: parsedData });

  } catch (error: unknown) {
    console.error('[Quiz API Error]:', error);
    const message = error instanceof Error ? error.message : 'Unexpected quiz API error.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
