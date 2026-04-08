import { NextRequest, NextResponse } from 'next/server';
import { ALL_CHAPTERS } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';

export const runtime = 'edge';

// Build compact curriculum map from live data.
function buildCurriculum(): string {
  const lines: string[] = [];

  for (const cls of [10, 12] as const) {
    const chapters = ALL_CHAPTERS.filter((ch) => ch.classLevel === cls);
    lines.push(`\nCLASS ${cls} (${chapters.length} chapters):`);
    for (const ch of chapters) {
      const rel = ch.examRelevance?.join('/') ?? 'Board';
      lines.push(
        `  Ch${ch.chapterNumber} [${ch.subject}] ${ch.title} - ${ch.marks}M [${rel}] | Topics: ${ch.topics.slice(0, 5).join(', ')}`
      );
    }
  }

  return lines.join('\n');
}

const CURRICULUM = buildCurriculum();

const SYSTEM_PROMPT = `You are VidyaAI, a CBSE tutor for VidyaPath.

SCOPE (STRICT)
You only answer:
- Class 10: Science and Mathematics (NCERT)
- Class 12: Physics, Chemistry, Biology, Mathematics (NCERT)
- CBSE board prep, marking schemes, PYQ trends, study plans
- JEE/NEET foundational relevance for these same topics

If the user asks anything outside scope, reply in this exact format:
OFFTOPIC: <one warm sentence saying what you can help with>

CBSE CURRICULUM CONTEXT
${CURRICULUM}

HOW TO ANSWER
- Keep responses concise, structured, and exam-focused.
- Mention chapter/topic mapping when relevant.
- For numericals: formula, givens, substitution, steps, final answer with unit.
- For theory: one-line definition, key points, and a board-tip line.
- For MCQs: include 4 options and a short explanation.
- For Class 12 topics, mention JEE/NEET relevance briefly when useful.

STYLE
- Warm, clear, never condescending.
- Use bold for key terms/formulas.
- Prefer short sections over long paragraphs.
- End with one helpful next-practice suggestion when useful.`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChapterContext {
  chapterId?: string;
  title: string;
  subject: string;
  classLevel: number;
  topics: string[];
}

function normalizeMessages(input: unknown): Message[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const role = record.role;
      const content = record.content;

      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
        return null;
      }

      const trimmed = content.trim();
      if (!trimmed) return null;
      return { role, content: trimmed } satisfies Message;
    })
    .filter((msg): msg is Message => msg !== null)
    .slice(-20);
}

function normalizeChapterContext(input: unknown): ChapterContext | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const chapterId = typeof record.chapterId === 'string' ? record.chapterId.trim() : '';
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const subject = typeof record.subject === 'string' ? record.subject.trim() : '';
  const classLevel = typeof record.classLevel === 'number' ? record.classLevel : Number(record.classLevel);
  const topics = Array.isArray(record.topics)
    ? record.topics.filter((topic): topic is string => typeof topic === 'string').map((topic) => topic.trim()).filter(Boolean)
    : [];

  if (!title || !subject || Number.isNaN(classLevel) || topics.length === 0) {
    return undefined;
  }

  return { chapterId: chapterId || undefined, title, subject, classLevel, topics };
}

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

async function callGroq(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Message[],
  maxTokens: number
): Promise<Response> {
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
        ...messages.slice(-12), // Keep last 12 turns for context
      ],
      max_tokens: maxTokens,
      temperature: 0.4, // Lower = more accurate for STEM
      top_p: 0.9,
      stream: false,
    }),
  });
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  messages: Message[],
  maxOutputTokens: number
): Promise<Response> {
  const contents = messages.slice(-12).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens,
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const messages = normalizeMessages(payload.messages);
    const chapterContext = normalizeChapterContext(payload.chapterContext);

    if (messages.length === 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const hasGroq = isUsableGroqApiKey(groqApiKey);
    const hasGemini = isUsableGeminiApiKey(geminiApiKey);

    if (!hasGroq && !hasGemini) {
      return NextResponse.json(
        { error: 'AI tutor not configured. Set GROQ_API_KEY or GEMINI_API_KEY in .env.local.' },
        { status: 503 }
      );
    }

    // Build contextual system prompt - pin the current chapter prominently
    const pyq = chapterContext?.chapterId ? getPYQData(chapterContext.chapterId) : null;
    const pyqSummary = pyq
      ? `\nPYQ signal for this chapter: asked in ${pyq.yearsAsked.length} years (${[...pyq.yearsAsked].sort((a, b) => b - a).slice(0, 6).join(', ')}), avg marks ${pyq.avgMarks}, high-yield topics: ${pyq.importantTopics.join(', ')}.`
      : '';

    const chapterPin = chapterContext
      ? `\n==============================================\n CURRENT CHAPTER (student is studying this right now)\n==============================================\nChapter: ${chapterContext.title}\nSubject: ${chapterContext.subject} | Class: ${chapterContext.classLevel}\nTopics: ${chapterContext.topics.join(', ')}${pyqSummary}\n\nPrioritise this chapter in your answers. If the student's question is clearly about this chapter, give the most detailed answer possible.`
      : '';

    const fullSystem = SYSTEM_PROMPT + chapterPin;

    let rawMessage = '';
    let groqStatus = 0;

    if (hasGroq && groqApiKey) {
      let groqResponse = await callGroq(groqApiKey, 'llama-3.3-70b-versatile', fullSystem, messages, 2048);
      groqStatus = groqResponse.status;

      if (groqResponse.status === 429) {
        groqResponse = await callGroq(groqApiKey, 'llama-3.1-8b-instant', fullSystem, messages, 1024);
        groqStatus = groqResponse.status;
      }

      if (groqResponse.ok) {
        const data = await groqResponse.json();
        rawMessage = data.choices?.[0]?.message?.content?.trim() ?? '';
      } else {
        const errorData = await groqResponse.json().catch(() => ({}));
        console.error('Groq API error:', groqResponse.status, errorData);
      }
    }

    if (!rawMessage && hasGemini && geminiApiKey) {
      const geminiResponse = await callGemini(geminiApiKey, fullSystem, messages, 2048);
      if (geminiResponse.ok) {
        const geminiData = await geminiResponse.json().catch(() => ({}));
        rawMessage = readGeminiText(geminiData);
      } else {
        const errorData = await geminiResponse.json().catch(() => ({}));
        console.error('Gemini API error:', geminiResponse.status, errorData);
      }
    }

    if (!rawMessage) {
      if (groqStatus === 429 && !hasGemini) {
        return NextResponse.json(
          { error: 'VidyaAI is busy right now. Please wait 30 seconds and try again!' },
          { status: 429 }
        );
      }

      return NextResponse.json({ error: 'No response from AI. Please try again.' }, { status: 502 });
    }

    // Detect off-topic sentinel
    const isOffTopic = rawMessage.trimStart().startsWith('OFFTOPIC:');
    const message = isOffTopic
      ? rawMessage.replace(/^OFFTOPIC:\s*/i, '').trim()
      : rawMessage;

    return NextResponse.json({ message, isOffTopic });
  } catch (error) {
    console.error('AI tutor route error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Check your connection and try again.' },
      { status: 500 }
    );
  }
}

