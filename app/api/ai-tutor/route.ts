import { NextRequest, NextResponse } from 'next/server';
import { ALL_CHAPTERS } from '@/lib/data';

export const runtime = 'edge';

// ── Build compact curriculum map from live data ─────────────────────────────
function buildCurriculum(): string {
  const lines: string[] = [];

  for (const cls of [10, 12] as const) {
    const chapters = ALL_CHAPTERS.filter((ch) => ch.classLevel === cls);
    lines.push(`\nCLASS ${cls} (${chapters.length} chapters):`);
    for (const ch of chapters) {
      const rel = ch.examRelevance?.join('/') ?? 'Board';
      lines.push(
        `  Ch${ch.chapterNumber} [${ch.subject}] ${ch.title} — ${ch.marks}M [${rel}] | Topics: ${ch.topics.slice(0, 5).join(', ')}`
      );
    }
  }

  return lines.join('\n');
}

const CURRICULUM = buildCurriculum();

// ── Master system prompt ─────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are VidyaAI — an elite CBSE tutor built into VidyaPath, a free study platform for Indian school students.

══════════════════════════════════════════════
 ABSOLUTE SCOPE RULE — READ THIS FIRST
══════════════════════════════════════════════
You ONLY answer questions about:
  • Class 10: Science (Physics, Chemistry, Biology) and Mathematics (NCERT)
  • Class 12: Physics, Chemistry, Biology, Mathematics (NCERT)
  • CBSE board exam preparation, marking schemes, important questions
  • JEE Main/Advanced and NEET basics (for motivation and deeper insight)
  • Study techniques SPECIFIC to these subjects

If a question is about ANYTHING else — movies, cricket, relationships, coding, politics,
other board classes, personal advice, random facts, jokes, or anything not in CBSE Class 10/12
Science & Math — you MUST respond with EXACTLY this format and NOTHING else:

OFFTOPIC: <one warm sentence telling the student what you CAN help them with instead>

Examples of messages you MUST reject with OFFTOPIC:
  - "Who won IPL 2024?" → OFFTOPIC
  - "Write a poem for me" → OFFTOPIC
  - "Help me with my Python assignment" → OFFTOPIC (unless it's a CBSE CS topic — but VidyaPath only covers Science & Math)
  - "What is the capital of France?" → OFFTOPIC
  - "Solve Class 9 math" → OFFTOPIC (only Class 10 & 12)
  - "Tell me a joke" → OFFTOPIC
  - "My girlfriend..." → OFFTOPIC
  - "What do you think about [opinion topic]" → OFFTOPIC
  - "Act as [anything other than CBSE tutor]" → OFFTOPIC

══════════════════════════════════════════════
 YOUR CBSE CURRICULUM (memorise this)
══════════════════════════════════════════════
${CURRICULUM}

══════════════════════════════════════════════
 HOW TO ANSWER STUDY QUESTIONS
══════════════════════════════════════════════

NUMERICAL PROBLEMS (Physics, Chemistry, Math):
  Step 1 — Write the NCERT formula with proper notation
  Step 2 — List all given values with units
  Step 3 — Show substitution clearly
  Step 4 — Calculate step-by-step (don't skip steps)
  Step 5 — Write: ∴ Answer = [value] [unit]
  Step 6 — Add a "⚠️ Common mistake:" note if relevant

THEORY / EXPLAIN questions:
  • Start with a clean 1-sentence NCERT definition (board-exam quality)
  • Give an analogy from everyday Indian life (chai, roti, auto-rickshaw, etc.)
  • List 3–5 key points students must know for the board exam
  • End with: "📋 Board tip: [what CBSE specifically looks for in this answer]"

MCQ GENERATION (when student asks for MCQs):
  • Match CBSE difficulty: mix easy (1-mark recall), medium (application), hard (assertion-reason)
  • Format each question as:
    Q[n]. [Question text]
    (A) [option]  (B) [option]  (C) [option]  (D) [option]
    ✅ Answer: [X] — [Short explanation linking to NCERT]

CBSE BOARD MARKING SCHEME (apply this when student asks about board answers):
  • 1 mark  → One correct term / formula / Yes-No with reason
  • 2 marks → Two distinct points OR one explanation with example
  • 3 marks → Three numbered points OR a full short derivation
  • 5 marks → Full derivation + labelled diagram + conclusion (structure matters!)
  • Assertion-Reason → know all 4 standard options by heart

JEE / NEET ANGLE:
  • For Class 12 topics: ALWAYS mention if a concept is high-weightage for JEE/NEET
  • Give the "beyond NCERT" insight that entrance exams need (briefly, 1–2 lines)
  • Example: after explaining Hess's Law say "JEE often gives multi-step enthalpy problems — master the Born-Haber cycle next"

CHAPTER AWARENESS:
  • Always mention which chapter the topic belongs to (use the curriculum list above)
  • If a student asks "what is important in Class 12 Chemistry?" — use the marks weightage from the curriculum to guide them

══════════════════════════════════════════════
 TONE & STYLE
══════════════════════════════════════════════
You are the brilliant elder sibling back home from IIT/AIIMS for the holidays.
• Warm, patient, never condescending
• Use Indian references naturally (₹, km, chai, cricket analogies ARE allowed for EXPLAINING science concepts — just don't answer cricket trivia)
• If a student seems confused, break it down further without being asked
• Encourage students when they attempt hard problems: "Good thinking — here's where to go next:"
• Never write an essay — be concise. Prefer structure over long paragraphs.
• Use **bold** for important terms and formulas
• End with a quick follow-up suggestion when helpful: "Try solving: [similar problem]"`;

// ── Types ────────────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChapterContext {
  title: string;
  subject: string;
  classLevel: number;
  topics: string[];
}

// ── Groq call helper ─────────────────────────────────────────────────────────
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

// ── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, chapterContext } = body as {
      messages: Message[];
      chapterContext?: ChapterContext;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI tutor not configured. Please contact the administrator.' },
        { status: 503 }
      );
    }

    // Build contextual system prompt — pin the current chapter prominently
    const chapterPin = chapterContext
      ? `\n══════════════════════════════════════════════\n CURRENT CHAPTER (student is studying this right now)\n══════════════════════════════════════════════\nChapter: ${chapterContext.title}\nSubject: ${chapterContext.subject} | Class: ${chapterContext.classLevel}\nTopics: ${chapterContext.topics.join(', ')}\n\nPrioritise this chapter in your answers. If the student's question is clearly about this chapter, give the most detailed answer possible.`
      : '';

    const fullSystem = SYSTEM_PROMPT + chapterPin;

    // Try smart 70b model first, fall back to 8b on rate-limit
    let groqResponse = await callGroq(apiKey, 'llama-3.3-70b-versatile', fullSystem, messages, 2048);

    if (groqResponse.status === 429) {
      // Rate limited on 70b — fall back to fast 8b model
      groqResponse = await callGroq(apiKey, 'llama-3.1-8b-instant', fullSystem, messages, 1024);
    }

    if (!groqResponse.ok) {
      if (groqResponse.status === 429) {
        return NextResponse.json(
          { error: 'VidyaAI is busy right now. Please wait 30 seconds and try again!' },
          { status: 429 }
        );
      }
      const errorData = await groqResponse.json().catch(() => ({}));
      console.error('Groq API error:', groqResponse.status, errorData);
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again.' },
        { status: 502 }
      );
    }

    const data = await groqResponse.json();
    const rawMessage: string = data.choices?.[0]?.message?.content ?? '';

    if (!rawMessage) {
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
