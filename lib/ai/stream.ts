/**
 * AI streaming utilities — wraps provider APIs to emit Server-Sent Events.
 *
 * Usage in route handlers:
 *   const stream = await generateTaskTextStream({ ... });
 *   return new Response(stream, {
 *     headers: {
 *       'Content-Type': 'text/event-stream',
 *       'Cache-Control': 'no-cache, no-store',
 *       Connection: 'keep-alive',
 *     },
 *   });
 *
 * SSE protocol:
 *   data: {"token":"hello"}\n\n
 *   ...
 *   data: [DONE]\n\n
 */
import { logger } from '@/lib/logger';
import { checkAiTokenBudget } from '@/lib/ai/cost-guard';

export interface StreamOptions {
  provider: 'gemini' | 'groq' | 'nvidia';
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  /** Optional school context — used for per-school daily token budget enforcement. */
  schoolId?: string | null;
}

// ── SSE helpers ─────────────────────────────────────────────────────────────

function sseToken(token: string): string {
  return `data: ${JSON.stringify({ token })}\n\n`;
}

const SSE_DONE = 'data: [DONE]\n\n';
const SSE_ERROR = (msg: string) => `data: ${JSON.stringify({ error: msg })}\n\n${SSE_DONE}`;

// ── Gemini streaming ─────────────────────────────────────────────────────────

async function* geminiStream(options: StreamOptions): AsyncGenerator<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
  if (!apiKey) {
    yield SSE_ERROR('Gemini API key not configured');
    return;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const payload = {
    contents: [
      ...(options.systemPrompt
        ? [{ role: 'user', parts: [{ text: options.systemPrompt }] }, { role: 'model', parts: [{ text: 'Understood.' }] }]
        : []),
      { role: 'user', parts: [{ text: options.userPrompt }] },
    ],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 2048,
    },
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.body) {
      yield SSE_ERROR(`Gemini HTTP ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json || json === '[DONE]') continue;
        try {
          const parsed = JSON.parse(json);
          const token: string =
            parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (token) yield sseToken(token);
        } catch {
          // skip malformed SSE chunk
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Gemini stream error');
    yield SSE_ERROR('Gemini stream failed');
  }
}

// ── Groq streaming ───────────────────────────────────────────────────────────

async function* groqStream(options: StreamOptions): AsyncGenerator<string> {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) {
    yield SSE_ERROR('Groq API key not configured');
    return;
  }

  const messages = [
    ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
    { role: 'user', content: options.userPrompt },
  ];

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
      }),
    });
    if (!res.ok || !res.body) {
      yield SSE_ERROR(`Groq HTTP ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json || json === '[DONE]') continue;
        try {
          const parsed = JSON.parse(json);
          const token: string = parsed?.choices?.[0]?.delta?.content ?? '';
          if (token) yield sseToken(token);
        } catch {
          // skip
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Groq stream error');
    yield SSE_ERROR('Groq stream failed');
  }
}

// ── NVIDIA / OpenAI-compat streaming ─────────────────────────────────────────

async function* nvidiaStream(options: StreamOptions): AsyncGenerator<string> {
  const apiKey = process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || '';
  const baseUrl = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');
  if (!apiKey) {
    yield SSE_ERROR('NVIDIA API key not configured');
    return;
  }

  const messages = [
    ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
    { role: 'user', content: options.userPrompt },
  ];

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
      }),
    });
    if (!res.ok || !res.body) {
      yield SSE_ERROR(`NVIDIA HTTP ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json || json === '[DONE]') continue;
        try {
          const parsed = JSON.parse(json);
          const token: string = parsed?.choices?.[0]?.delta?.content ?? '';
          if (token) yield sseToken(token);
        } catch {
          // skip
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'NVIDIA stream error');
    yield SSE_ERROR('NVIDIA stream failed');
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a ReadableStream of SSE events.
 * Automatically selects provider generator; emits [DONE] when finished.
 *
 * @example
 * const stream = await generateTaskTextStream({ provider: 'gemini', model: 'gemini-1.5-flash', userPrompt: '...' });
 * return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
 */
export function generateTaskTextStream(options: StreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const requestedTokens = options.maxTokens ?? 2048;

  let gen: AsyncGenerator<string>;
  switch (options.provider) {
    case 'groq':
      gen = groqStream(options);
      break;
    case 'nvidia':
      gen = nvidiaStream(options);
      break;
    case 'gemini':
    default:
      gen = geminiStream(options);
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // ── Token budget gate ─────────────────────────────────────────────
      const budget = await checkAiTokenBudget({
        schoolId: options.schoolId ?? null,
        requestedTokens,
      }).catch(() => ({ allowed: true, remaining: requestedTokens, requested: requestedTokens, limit: requestedTokens }));

      if (!budget.allowed) {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ error: 'token-budget-exceeded', reason: (budget as { reason?: string }).reason ?? 'daily-limit' })}\n\n${SSE_DONE}`,
        ));
        controller.close();
        return;
      }
    },
    async pull(controller) {
      try {
        const { value, done } = await gen.next();
        if (done) {
          controller.enqueue(encoder.encode(SSE_DONE));
          controller.close();
          return;
        }
        if (value) {
          controller.enqueue(encoder.encode(value));
        }
      } catch (err) {
        logger.error({ err }, 'SSE stream pull error');
        controller.enqueue(encoder.encode(SSE_DONE));
        controller.close();
      }
    },
  });
}

/** SSE response headers for Next.js route handlers. */
export const SSE_HEADERS: HeadersInit = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-store',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no', // disable Nginx buffering
};
