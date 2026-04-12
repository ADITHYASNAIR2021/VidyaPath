import { createHash } from 'node:crypto';
import type { ContextSnippet, ContextTask } from '@/lib/ai/context-retriever';
import { getTaskChatModelCandidates, type LlmProvider, type LlmModelConfig } from '@/lib/ai/model-routing';
import { callNvidiaChatCompletion, isUsableNvidiaApiKey } from '@/lib/ai/nvidia-client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CachedResponse {
  expiresAt: number;
  text: string;
  provider: LlmProvider;
  model: string;
}

export interface GenerationResult {
  text: string;
  provider: LlmProvider;
  model: string;
  cacheHit: boolean;
}

interface BaseGenerateOptions {
  task: ContextTask;
  systemPrompt: string;
  userPrompt: string;
  contextSnippets: ContextSnippet[];
  contextHash: string;
  chapterId?: string;
  difficulty?: string;
  diversityKey?: string;
  includeCitations?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
}

interface GenerateTextOptions extends BaseGenerateOptions {
  messages?: ChatMessage[];
}

interface GenerateJsonOptions<T> extends GenerateTextOptions {
  validate: (value: unknown) => value is T;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const RESPONSE_CACHE = new Map<string, CachedResponse>();

function isResponseCacheEnabled(): boolean {
  if (process.env.AI_RESPONSE_CACHE === '1') return true;
  if (process.env.AI_RESPONSE_CACHE === '0') return false;
  return process.env.NODE_ENV !== 'production';
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

function now(): number {
  return Date.now();
}

function parseNumeric(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveTemperature(candidate: LlmModelConfig, requestValue: number | undefined): number {
  if (typeof requestValue === 'number' && Number.isFinite(requestValue)) return requestValue;
  const configured = parseNumeric(candidate.defaultParams?.temperature);
  return configured ?? 0.2;
}

function resolveTopP(candidate: LlmModelConfig): number {
  const configured = parseNumeric(candidate.defaultParams?.top_p) ?? parseNumeric(candidate.defaultParams?.topP);
  return configured ?? 0.9;
}

function resolveMaxTokens(candidate: LlmModelConfig, requestValue: number | undefined): number {
  if (typeof requestValue === 'number' && Number.isFinite(requestValue)) return requestValue;
  const configured =
    parseNumeric(candidate.defaultParams?.max_tokens) ??
    parseNumeric(candidate.defaultParams?.maxOutputTokens);
  return configured ?? 1600;
}

function buildContextSection(snippets: ContextSnippet[]): string {
  if (snippets.length === 0) return 'No retrieved paper context available for this request.';
  return snippets
    .map((snippet, idx) => {
      const source = [
        `Source ${idx + 1}: ${snippet.sourcePath}`,
        snippet.year ? `Year ${snippet.year}` : null,
        snippet.paperType ? `Type ${snippet.paperType}` : null,
        snippet.chapterId ? `Chapter ${snippet.chapterId}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
      return `${source}\n${snippet.text}`;
    })
    .join('\n\n');
}

function buildCacheKey(options: GenerateTextOptions): string {
  const digest = createHash('sha1');
  digest.update(options.task);
  digest.update('|');
  digest.update(options.chapterId ?? '');
  digest.update('|');
  digest.update(options.difficulty ?? '');
  digest.update('|');
  digest.update(options.contextHash);
  digest.update('|');
  digest.update(options.diversityKey ?? '');
  digest.update('|');
  digest.update(options.userPrompt);
  digest.update('|');
  if (options.messages && options.messages.length > 0) {
    for (const message of options.messages.slice(-8)) {
      digest.update(message.role);
      digest.update(':');
      digest.update(message.content);
      digest.update('|');
    }
  }
  return digest.digest('hex');
}

async function callGemini(
  apiKey: string,
  model: string,
  fullSystemPrompt: string,
  userPrompt: string,
  messages: ChatMessage[] | undefined,
  temperature: number,
  maxOutputTokens: number,
  topP: number
): Promise<string> {
  const contents =
    messages && messages.length > 0
      ? messages.slice(-12).map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        }))
      : [{ role: 'user', parts: [{ text: userPrompt }] }];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: fullSystemPrompt }] },
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens,
          topP,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Gemini ${model} failed: ${response.status} ${err.slice(0, 140)}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim() ?? '';
  if (!text) throw new Error(`Gemini ${model} returned empty output`);
  return text;
}

async function callGroq(
  apiKey: string,
  model: string,
  fullSystemPrompt: string,
  userPrompt: string,
  messages: ChatMessage[] | undefined,
  temperature: number,
  maxOutputTokens: number,
  topP: number
): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages:
        messages && messages.length > 0
          ? [{ role: 'system', content: fullSystemPrompt }, ...messages.slice(-12)]
          : [
              { role: 'system', content: fullSystemPrompt },
              { role: 'user', content: userPrompt },
            ],
      temperature,
      top_p: topP,
      max_tokens: maxOutputTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Groq ${model} failed: ${response.status} ${err.slice(0, 140)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error(`Groq ${model} returned empty output`);
  return text;
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function normalizeJsonText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function extractBalancedJsonBlock(text: string): string | null {
  const firstObject = text.indexOf('{');
  const firstArray = text.indexOf('[');
  const startCandidates = [firstObject, firstArray].filter((idx) => idx >= 0);
  if (startCandidates.length === 0) return null;
  const start = Math.min(...startCandidates);
  const opening = text[start];
  const expectedClosing = opening === '{' ? '}' : ']';

  let inString = false;
  let escaped = false;
  const stack: string[] = [expectedClosing];

  for (let idx = start + 1; idx < text.length; idx++) {
    const char = text[idx];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      stack.push('}');
      continue;
    }
    if (char === '[') {
      stack.push(']');
      continue;
    }
    if (char === '}' || char === ']') {
      const expected = stack[stack.length - 1];
      if (char !== expected) continue;
      stack.pop();
      if (stack.length === 0) {
        return text.slice(start, idx + 1);
      }
    }
  }

  return null;
}

function tryParseJsonCandidates(rawText: string): { parsed: unknown | null; error?: string } {
  const normalized = normalizeJsonText(stripCodeFence(rawText));
  const candidates = [normalized];
  const balanced = extractBalancedJsonBlock(normalized);
  if (balanced && balanced !== normalized) {
    candidates.push(balanced);
  }

  let lastError = 'Unknown JSON parse error';
  for (const candidate of candidates) {
    try {
      return { parsed: JSON.parse(candidate) };
    } catch (error) {
      lastError = String(error);
    }
  }

  return { parsed: null, error: lastError };
}

async function runGeneration(options: GenerateTextOptions): Promise<GenerationResult> {
  const cacheKey = buildCacheKey(options);
  const cacheEnabled = isResponseCacheEnabled();
  if (cacheEnabled) {
    const fromCache = RESPONSE_CACHE.get(cacheKey);
    if (fromCache && fromCache.expiresAt > now()) {
      return {
        text: fromCache.text,
        provider: fromCache.provider,
        model: fromCache.model,
        cacheHit: true,
      };
    }
  }

  const contextBlock = buildContextSection(options.contextSnippets);
  const citationBlock = options.includeCitations
    ? `Citation format requirement:
- When using retrieved context, append source tags like [S1], [S2] mapped to the order above.
- Never fabricate source paths.`
    : `Output formatting requirement:
- Do not include source tags like [S1], [S2] in student-facing JSON/text fields.`;
  const fullSystemPrompt = `${options.systemPrompt}

Retrieved Paper Context:
${contextBlock}

${citationBlock}`;

  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const errors: string[] = [];
  const missingProviderNotice = new Set<LlmProvider>();
  const candidates = getTaskChatModelCandidates(options.task);

  if (candidates.length === 0) {
    throw new Error(`No chat model configured for task ${options.task}.`);
  }

  for (const candidate of candidates) {
    const temperature = resolveTemperature(candidate, options.temperature);
    const maxOutputTokens = resolveMaxTokens(candidate, options.maxOutputTokens);
    const topP = resolveTopP(candidate);
    try {
      if (candidate.provider === 'nvidia') {
        if (!isUsableNvidiaApiKey(nvidiaKey)) {
          if (!missingProviderNotice.has('nvidia')) {
            missingProviderNotice.add('nvidia');
            errors.push('NVIDIA_API_KEY missing or invalid.');
          }
          continue;
        }
        const text = await callNvidiaChatCompletion({
          apiKey: nvidiaKey,
          model: candidate.model,
          systemPrompt: fullSystemPrompt,
          userPrompt: options.userPrompt,
          messages: options.messages
            ? options.messages.map((message) => ({
                role: message.role,
                content: message.content,
              }))
            : undefined,
          temperature,
          maxOutputTokens,
          topP,
          extraBody: candidate.defaultParams,
        });
        if (cacheEnabled) {
          RESPONSE_CACHE.set(cacheKey, {
            text,
            provider: 'nvidia',
            model: candidate.model,
            expiresAt: now() + CACHE_TTL_MS,
          });
        }
        return { text, provider: 'nvidia', model: candidate.model, cacheHit: false };
      }

      if (candidate.provider === 'gemini') {
        if (!isUsableGeminiApiKey(geminiKey)) {
          if (!missingProviderNotice.has('gemini')) {
            missingProviderNotice.add('gemini');
            errors.push('GEMINI_API_KEY missing or invalid.');
          }
          continue;
        }
        const text = await callGemini(
          geminiKey,
          candidate.model,
          fullSystemPrompt,
          options.userPrompt,
          options.messages,
          temperature,
          maxOutputTokens,
          topP
        );
        if (cacheEnabled) {
          RESPONSE_CACHE.set(cacheKey, {
            text,
            provider: 'gemini',
            model: candidate.model,
            expiresAt: now() + CACHE_TTL_MS,
          });
        }
        return { text, provider: 'gemini', model: candidate.model, cacheHit: false };
      }

      if (candidate.provider === 'groq') {
        if (!isUsableGroqApiKey(groqKey)) {
          if (!missingProviderNotice.has('groq')) {
            missingProviderNotice.add('groq');
            errors.push('GROQ_API_KEY missing or invalid.');
          }
          continue;
        }
        const text = await callGroq(
          groqKey,
          candidate.model,
          fullSystemPrompt,
          options.userPrompt,
          options.messages,
          temperature,
          maxOutputTokens,
          topP
        );
        if (cacheEnabled) {
          RESPONSE_CACHE.set(cacheKey, {
            text,
            provider: 'groq',
            model: candidate.model,
            expiresAt: now() + CACHE_TTL_MS,
          });
        }
        return { text, provider: 'groq', model: candidate.model, cacheHit: false };
      }
    } catch (error) {
      errors.push(String(error));
    }
  }

  throw new Error(
    `No model could generate a response. Configure NVIDIA_API_KEY (recommended), GEMINI_API_KEY, or GROQ_API_KEY. Details: ${errors
      .slice(0, 5)
      .join(' | ')}`
  );
}

export async function generateTaskText(options: GenerateTextOptions): Promise<GenerationResult> {
  return runGeneration(options);
}

export async function generateTaskJson<T>(options: GenerateJsonOptions<T>): Promise<{
  data: T;
  result: GenerationResult;
}> {
  const firstResult = await runGeneration(options);
  const firstParsed = tryParseJsonCandidates(firstResult.text);
  if (firstParsed.parsed && options.validate(firstParsed.parsed)) {
    return { data: firstParsed.parsed, result: firstResult };
  }

  const retryOptions: GenerateTextOptions = {
    ...options,
    diversityKey: `${options.diversityKey ?? 'default'}:json-retry`,
    temperature: Math.min(options.temperature ?? 0.2, 0.1),
    userPrompt: `${options.userPrompt}

CRITICAL:
- Return only valid JSON.
- No markdown fences.
- Ensure all strings are closed and escaped properly.
- Do not add any explanatory text before or after JSON.`,
  };

  const retryResult = await runGeneration(retryOptions);
  const retryParsed = tryParseJsonCandidates(retryResult.text);
  if (retryParsed.parsed && options.validate(retryParsed.parsed)) {
    return { data: retryParsed.parsed, result: retryResult };
  }

  if (firstParsed.parsed && !options.validate(firstParsed.parsed)) {
    throw new Error(`Model returned schema-invalid JSON for task ${options.task}.`);
  }

  throw new Error(
    `Model returned invalid JSON for task ${options.task}: first=${firstParsed.error ?? 'unknown'}; retry=${retryParsed.error ?? 'unknown'}`
  );
}
