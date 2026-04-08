import { NextResponse } from 'next/server';

// Type definition for the expected quiz output
interface QuizQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export async function POST(req: Request) {
  try {
    const { chapterId, subject, chapterTitle, nccontext } = await req.json();

    // In a production environment, we would use strict structured output from Groq/Llama3 or Gemini
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY || GROQ_API_KEY.startsWith("gsk_placeholder")) {
      // Mock Data Generation Fallback (until user supplies real API key)
      console.log("[AI Generator] Missing real API key. Generating placeholder quiz based on context...");
      
      const fallbackQuiz: QuizQuestion[] = [
        {
          question: `Which fundamental principle of ${subject} is highlighted in ${chapterTitle}?`,
          options: [
            "The Principle of Conservation",
            "The Laws of Thermodynamics",
            "The General Theory of Relativity",
            "NCERT Specific Phenomenon XYZ"
          ],
          answer: 0,
          explanation: `According to the NCERT textbook for ${subject}, the principle of conservation applies deeply to the systems discussed in ${chapterTitle}.`
        },
        {
          question: `Based on your NCERT text, what is a key limitation of the model presented?`,
          options: [
            "It only applies in perfectly elastic scenarios.",
            "It is heavily dependent on temperature.",
            "It neglects friction and air resistance.",
            "It cannot be practically tested."
          ],
          answer: 2,
          explanation: "Most theoretical models introduced at this level assume ideal conditions, neglecting real-world variables like friction."
        },
        {
          question: `What would happen if the core variable in ${chapterTitle} were doubled?`,
          options: [
            "The outcome would halve.",
            "The outcome would also double.",
            "The outcome would square.",
            "It would have no effect."
          ],
          answer: 1,
          explanation: "Due to the direct proportional relationship outlined in the chapter, the outcome doubles."
        }
      ];

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return NextResponse.json({ success: true, data: fallbackQuiz });
    }

    // --- REAL AI IMPLEMENTATION ---
    const systemPrompt = `You are an expert CBSE/NCERT curriculum evaluator. 
Your job is to generate 5 multiple-choice questions for the subject: ${subject}, chapter: ${chapterTitle}.
All questions MUST be entirely factual, textbook-accurate, and grounded ONLY in the provided NCERT context.
Return ONLY a strictly valid JSON array of objects with the exact keys: 'question', 'options' (array of 4 strings), 'answer' (0-3 index), 'explanation' (string). 
Do NOT wrap in markdown \`\`\`json blocks. Return pure JSON.`;
    
    const userPrompt = `NCERT Context snippet:\n"""${nccontext || "General chapter logic..."}"""\n\nGenerate the JSON array of quizzes now.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-70b-8192", // High reasoning model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1, // Strict determinism
        response_format: { type: "json_object" } // Assume wrapped in { "data": [...] } for strictness, but we asked for array. 
        // Note: Groq JSON mode works best if we ask it to return { "quiz": [ ... ] }
      })
    });

    if (!response.ok) {
        throw new Error(`Groq API Error: ${response.statusText}`);
    }

    const aiRes = await response.json();
    const contentStr = aiRes.choices[0].message.content;
    
    // Attempt to parse JSON safely
    let parsedData = [];
    try {
        const parsed = JSON.parse(contentStr);
        parsedData = Array.isArray(parsed) ? parsed : (parsed.quiz || parsed.data || parsed.questions || []);
    } catch (e) {
        throw new Error("AI failed to return valid JSON structure.");
    }

    return NextResponse.json({ success: true, data: parsedData });

  } catch (error: any) {
    console.error("[Quiz API Error]:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
