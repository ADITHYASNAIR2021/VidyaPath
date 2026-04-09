import { NextResponse } from 'next/server';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';

interface ImageSolveRequest {
  imageBase64?: string;
  mimeType?: string;
  prompt?: string;
  classLevel?: number;
  subject?: string;
}

function isValidMimeType(value: string): boolean {
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(value.toLowerCase());
}

function cleanBase64(value: string): string {
  return value.replace(/^data:[^;]+;base64,/, '').trim();
}

export async function POST(req: Request) {
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const body = (await req.json().catch(() => null)) as ImageSolveRequest | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
    }

    const rawBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    const imageBase64 = cleanBase64(rawBase64);
    const mimeType = typeof body.mimeType === 'string' && isValidMimeType(body.mimeType)
      ? body.mimeType
      : 'image/jpeg';
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const classLevel = Number.isFinite(Number(body.classLevel)) ? Number(body.classLevel) : undefined;
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 is required.' }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured.' }, { status: 503 });
    }

    const instruction = [
      'You are VidyaAI Image Solver for CBSE students.',
      'Read the uploaded question image and solve it step-by-step.',
      'If the image is unclear, state the ambiguity and solve the most likely interpretation.',
      'Keep it board-friendly with numbered steps and final boxed answer.',
      classLevel ? `Target class level: ${classLevel}.` : '',
      subject ? `Subject context: ${subject}.` : '',
      prompt ? `Student request: ${prompt}` : '',
      'Use plain markdown and include formulas in LaTeX where useful.',
      'Return only JSON in shape: {"solution":"...","detectedTopic":"...","confidence":"high|medium|low","followUp":"..."}',
    ]
      .filter(Boolean)
      .join('\n');

    const model = 'gemini-1.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: instruction },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 1800,
            topP: 0.9,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      return NextResponse.json(
        { error: `Gemini image solve failed: ${response.status} ${err.slice(0, 150)}` },
        { status: 502 }
      );
    }

    const geminiJson = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = geminiJson.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
    if (!text) {
      return NextResponse.json({ error: 'No solution generated from image.' }, { status: 502 });
    }

    const parsed = (() => {
      try {
        return JSON.parse(
          text
            .replace(/^```json/i, '')
            .replace(/^```/i, '')
            .replace(/```$/i, '')
            .trim()
        ) as { solution?: string; detectedTopic?: string; confidence?: string; followUp?: string };
      } catch {
        return {
          solution: text,
          detectedTopic: 'Detected from image',
          confidence: 'medium',
          followUp: 'Try uploading a clearer image if any symbol looked unreadable.',
        };
      }
    })();

    const resultPayload = {
      solution: String(parsed.solution ?? '').trim(),
      detectedTopic: String(parsed.detectedTopic ?? 'Detected from image').trim(),
      confidence: ['high', 'medium', 'low'].includes(String(parsed.confidence ?? '').toLowerCase())
        ? String(parsed.confidence).toLowerCase()
        : 'medium',
      followUp: String(parsed.followUp ?? 'Practice one similar question to lock this concept.').trim(),
    };
    await logAiUsage({
      context,
      endpoint: '/api/image-solve',
      provider: 'gemini',
      model,
      promptText: `${instruction}\n${prompt}`,
      completionText: resultPayload.solution,
      estimated: true,
    });

    return NextResponse.json(resultPayload);
  } catch (error) {
    console.error('[image-solve] error', error);
    return NextResponse.json({ error: 'Failed to solve the image question.' }, { status: 500 });
  }
}
