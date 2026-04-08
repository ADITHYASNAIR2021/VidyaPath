import { NextResponse } from 'next/server';

interface FlashcardResponse {
  front: string;
  back: string;
}

export async function POST(req: Request) {
  try {
    const { chapterId, subject, chapterTitle, nccontext } = await req.json();

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY || GROQ_API_KEY.startsWith("gsk_placeholder")) {
      console.log("[AI Generator] Missing real API key. Generating placeholder flashcards...");
      
      const fallbackCards: FlashcardResponse[] = [
        {
          front: `Define the core concept of ${chapterTitle} in ${subject}.`,
          back: `It is the foundational mechanism introduced in the NCERT text which dictates how these systems interact.`
        },
        {
          front: `What is the standard unit of measurement associated with phenomena in this chapter?`,
          back: `The SI unit as prescribed by NCERT is heavily utilized in numerical problems here.`
        },
        {
          front: `List the 3 main exceptions to the primary rule taught in this section.`,
          back: `1. Extreme temperatures\n2. Lack of a vacuum\n3. Presence of catalysts (as outlined in the textbook)`
        }
      ];

      await new Promise((resolve) => setTimeout(resolve, 1200));
      return NextResponse.json({ success: true, data: fallbackCards });
    }

    // --- REAL AI IMPLEMENTATION ---
    const systemPrompt = `You are an expert CBSE/NCERT curriculum extractor. 
Your job is to generate 5 high-yield flashcards for the subject: ${subject}, chapter: ${chapterTitle}.
Format as a strictly valid JSON array of objects with the exact keys: 'front' (the question/prompt), 'back' (the direct, accurate answer).
Ensure answers are concise, textbook-accurate, and ideal for spaced repetition learning.
Return ONLY valid JSON. Do not wrap in markdown blocks.`;
    
    const userPrompt = `NCERT Context:\n"""${nccontext || "General chapter logic..."}"""\n\nGenerate the JSON array of flashcards now.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-70b-8192", 
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
        throw new Error(`Groq API Error: ${response.statusText}`);
    }

    const aiRes = await response.json();
    const contentStr = aiRes.choices[0].message.content;
    
    let parsedData = [];
    try {
        const parsed = JSON.parse(contentStr);
        parsedData = Array.isArray(parsed) ? parsed : (parsed.flashcards || parsed.data || parsed.cards || []);
    } catch (e) {
        throw new Error("AI failed to return valid JSON structure.");
    }

    return NextResponse.json({ success: true, data: parsedData });

  } catch (error: any) {
    console.error("[Flashcard API Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
