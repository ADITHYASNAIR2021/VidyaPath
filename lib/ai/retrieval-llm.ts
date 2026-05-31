import { createHash } from 'node:crypto';
import { compressSnippetText } from '@/lib/ai/retrieval-enhancements';

const REQUEST_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 30 * 60 * 1000;

interface CachedTextValue {
  expiresAt: number;
  text: string;
}

const hydeCache = new Map<string, CachedTextValue>();
const compressionCache = new Map<string, CachedTextValue>();

function now(): number {
  return Date.now();
}

function isUsableGroqApiKey(key: string | undefined): key is string {
  if (!key) return false;
  const normalized = key.trim();
  if (!normalized.startsWith('gsk_')) return false;
  const lower = normalized.toLowerCase();
  return !['placeholder', 'your_groq_api_key_here', 'replace_me', 'changeme'].some((tag) => lower.includes(tag));
}

function isUsableGeminiApiKey(key: string | undefined): key is string {
  if (!key) return false;
  const normalized = key.trim();
  if (!normalized.startsWith('AIza')) return false;
  const lower = normalized.toLowerCase();
  return !['placeholder', 'your_gemini_api_key_here', 'replace_me', 'changeme'].some((tag) => lower.includes(tag));
}

function readCached(cache: Map<string, CachedTextValue>, key: string): string | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now()) {
    cache.delete(key);
    return null;
  }
  return hit.text;
}

function writeCached(cache: Map<string, CachedTextValue>, key: string, text: string): void {
  cache.set(key, {
    text,
    expiresAt: now() + CACHE_TTL_MS,
  });
}

function normalizeOutput(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCacheKey(prefix: string, payload: Record<string, unknown>): string {
  return `${prefix}:${createHash('sha1').update(JSON.stringify(payload)).digest('hex')}`;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGeminiLite(systemPrompt: string, userPrompt: string, maxOutputTokens: number): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!isUsableGeminiApiKey(apiKey)) return null;

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          maxOutputTokens,
        },
      }),
    }
  );

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
  return text || null;
}

async function callGroqCacheFriendly(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!isUsableGroqApiKey(apiKey)) return null;

  const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.AI_RETRIEVAL_HELPER_GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      top_p: 0.8,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? '';
  return text || null;
}

async function runRetrievalLlm(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string | null> {
  const preferred = process.env.AI_RETRIEVAL_HELPER_PROVIDER?.trim().toLowerCase();
  if (preferred === 'gemini') {
    return (await callGeminiLite(systemPrompt, userPrompt, maxTokens)) ?? callGroqCacheFriendly(systemPrompt, userPrompt, maxTokens);
  }
  if (preferred === 'groq') {
    return (await callGroqCacheFriendly(systemPrompt, userPrompt, maxTokens)) ?? callGeminiLite(systemPrompt, userPrompt, maxTokens);
  }
  return (await callGeminiLite(systemPrompt, userPrompt, maxTokens)) ?? callGroqCacheFriendly(systemPrompt, userPrompt, maxTokens);
}

export async function buildHyDEPassage(input: {
  query: string;
  subject: string;
  classLevel: number;
  chapterTitle?: string;
  chapterTopics?: string[];
  pyqTopics?: string[];
}): Promise<string | null> {
  const query = String(input.query || '').trim();
  if (!query) return null;
  const cacheKey = buildCacheKey('hyde', input);
  const cached = readCached(hydeCache, cacheKey);
  if (cached) return cached;

  const chapterTopics = (input.chapterTopics ?? []).filter(Boolean).slice(0, 6).join(', ');
  const pyqTopics = (input.pyqTopics ?? []).filter(Boolean).slice(0, 5).join(', ');
  const systemPrompt = `You write short textbook-style NCERT retrieval passages.
Return exactly one compact paragraph in plain text.
Do not answer like a tutor. Do not explain your reasoning. Do not use bullets.`;
  const userPrompt = `Write one hypothetical NCERT-style paragraph for retrieval.
Class: ${input.classLevel}
Subject: ${input.subject}
Chapter: ${input.chapterTitle || 'unspecified'}
Chapter topics: ${chapterTopics || 'none'}
PYQ topics: ${pyqTopics || 'none'}
Student query: ${query}

Requirements:
- 2 to 4 sentences.
- Use textbook wording, key terms, equations, reactions, definitions, or processes if relevant.
- Stay semantically close to what the best source passage should look like.
- Max 90 words.
- Output only the paragraph.`;

  const generated = await runRetrievalLlm(systemPrompt, userPrompt, 120);
  const normalized = generated ? normalizeOutput(generated).slice(0, 700) : '';
  if (!normalized) return null;
  writeCached(hydeCache, cacheKey, normalized);
  return normalized;
}

export async function compressRetrievedSnippet(input: {
  query: string;
  subject: string;
  classLevel: number;
  chapterTitle?: string;
  snippetText: string;
  maxChars?: number;
}): Promise<string> {
  const maxChars = Math.max(220, Math.min(1200, input.maxChars ?? 900));
  const sourceText = String(input.snippetText || '').trim();
  if (!sourceText) return '';
  if (sourceText.length <= Math.min(320, maxChars)) {
    return compressSnippetText(sourceText, input.query, maxChars);
  }

  const cacheKey = buildCacheKey('compress', {
    query: input.query,
    subject: input.subject,
    classLevel: input.classLevel,
    chapterTitle: input.chapterTitle,
    maxChars,
    snippetText: sourceText.slice(0, 2200),
  });
  const cached = readCached(compressionCache, cacheKey);
  if (cached) return cached;

  const systemPrompt = `You compress textbook and exam snippets into key facts for question generation.
Preserve only directly relevant factual content.
Return plain text only with no bullets, no labels, and no commentary.`;
  const userPrompt = `Compress the snippet to only the facts needed for this retrieval focus.
Class: ${input.classLevel}
Subject: ${input.subject}
Chapter: ${input.chapterTitle || 'unspecified'}
Retrieval focus: ${input.query}
Max characters: ${maxChars}

Keep:
- exact definitions, formulae, reaction steps, causes, effects, process stages, diagram labels, and worked-example facts relevant to the focus
- important units and conditions

Remove:
- broad introductions, repetition, instructions, filler, and unrelated facts

Snippet:
"""
${sourceText.slice(0, 2400)}
"""

Output only the compressed factual text.`;

  const generated = await runRetrievalLlm(systemPrompt, userPrompt, 220);
  const normalized = generated ? normalizeOutput(generated).slice(0, maxChars) : '';
  const fallback = compressSnippetText(sourceText, input.query, maxChars);
  const resolved = normalized.length >= 80 ? normalized : fallback;
  writeCached(compressionCache, cacheKey, resolved);
  return resolved;
}
