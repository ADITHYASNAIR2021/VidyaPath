import { createHash } from 'node:crypto';
import type { ContextSnippet, ContextTask } from '@/lib/ai/context-retriever';
import { getTaskChatModelCandidates, type LlmProvider, type LlmModelConfig } from '@/lib/ai/model-routing';
import { callNvidiaChatCompletion, isUsableNvidiaApiKey, type LlmUsageCounts } from '@/lib/ai/nvidia-client';
import { recordAiQualityRecord } from '@/lib/ai/quality-store';

export type { LlmUsageCounts };

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
  usage: LlmUsageCounts | null;
  latencyMs: number;
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

const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS) || 30_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
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
): Promise<{ text: string; usage: LlmUsageCounts | null }> {
  const contents =
    messages && messages.length > 0
      ? messages.slice(-12).map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        }))
      : [{ role: 'user', parts: [{ text: userPrompt }] }];

  const response = await fetchWithTimeout(
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
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim() ?? '';
  if (!text) throw new Error(`Gemini ${model} returned empty output`);

  let usage: LlmUsageCounts | null = null;
  const m = payload.usageMetadata;
  if (m && typeof m.promptTokenCount === 'number' && typeof m.candidatesTokenCount === 'number') {
    usage = {
      promptTokens: m.promptTokenCount,
      completionTokens: m.candidatesTokenCount,
      totalTokens: m.totalTokenCount ?? m.promptTokenCount + m.candidatesTokenCount,
    };
  }
  return { text, usage };
}

async function callOpenAICompatibleEndpoint(
  apiUrl: string,
  providerTag: string,
  apiKey: string,
  model: string,
  fullSystemPrompt: string,
  userPrompt: string,
  messages: ChatMessage[] | undefined,
  temperature: number,
  maxOutputTokens: number,
  topP: number
): Promise<{ text: string; usage: LlmUsageCounts | null }> {
  const response = await fetchWithTimeout(apiUrl, {
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
    throw new Error(`${providerTag}/${model} failed: ${response.status} ${err.slice(0, 140)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error(`${providerTag}/${model} returned empty output`);

  let usage: LlmUsageCounts | null = null;
  const u = payload.usage;
  if (u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number') {
    usage = {
      promptTokens: u.prompt_tokens,
      completionTokens: u.completion_tokens,
      totalTokens: u.total_tokens ?? u.prompt_tokens + u.completion_tokens,
    };
  }
  return { text, usage };
}

async function callGroq(
  apiKey: string, model: string, fullSystemPrompt: string, userPrompt: string,
  messages: ChatMessage[] | undefined, temperature: number, maxOutputTokens: number, topP: number
): Promise<{ text: string; usage: LlmUsageCounts | null }> {
  return callOpenAICompatibleEndpoint(
    'https://api.groq.com/openai/v1/chat/completions', 'Groq',
    apiKey, model, fullSystemPrompt, userPrompt, messages, temperature, maxOutputTokens, topP
  );
}

async function callCerebras(
  apiKey: string, model: string, fullSystemPrompt: string, userPrompt: string,
  messages: ChatMessage[] | undefined, temperature: number, maxOutputTokens: number, topP: number
): Promise<{ text: string; usage: LlmUsageCounts | null }> {
  return callOpenAICompatibleEndpoint(
    'https://api.cerebras.ai/v1/chat/completions', 'Cerebras',
    apiKey, model, fullSystemPrompt, userPrompt, messages, temperature, maxOutputTokens, topP
  );
}

async function callMistral(
  apiKey: string, model: string, fullSystemPrompt: string, userPrompt: string,
  messages: ChatMessage[] | undefined, temperature: number, maxOutputTokens: number, topP: number
): Promise<{ text: string; usage: LlmUsageCounts | null }> {
  return callOpenAICompatibleEndpoint(
    'https://api.mistral.ai/v1/chat/completions', 'Mistral',
    apiKey, model, fullSystemPrompt, userPrompt, messages, temperature, maxOutputTokens, topP
  );
}

function isUsableCerebrasApiKey(key: string | undefined): key is string {
  if (!key) return false;
  const normalized = key.trim();
  if (!normalized.startsWith('csk-')) return false;
  return !['placeholder', 'replace_me', 'changeme', 'your_cerebras'].some((t) => normalized.toLowerCase().includes(t));
}

function isUsableMistralApiKey(key: string | undefined): key is string {
  if (!key) return false;
  const normalized = key.trim();
  if (normalized.length < 16) return false;
  return !['placeholder', 'replace_me', 'changeme', 'your_mistral'].some((t) => normalized.toLowerCase().includes(t));
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

function collectStringLeaves(value: unknown, output: string[], budget: { chars: number }): void {
  if (budget.chars <= 0) return;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      output.push(trimmed.slice(0, 800));
      budget.chars -= trimmed.length;
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringLeaves(item, output, budget);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStringLeaves(item, output, budget);
    }
  }
}

function tokenizeForGrounding(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((token) => {
    return !['with', 'from', 'that', 'this', 'your', 'their', 'which', 'about', 'chapter'].includes(token);
  });
}

function evaluateJsonGrounding(
  jsonValue: unknown,
  snippets: ContextSnippet[],
  includeCitations: boolean | undefined
): {
  groundednessScore: number;
  citationCoverageScore: number;
  retrievalMiss: boolean;
} {
  if (!Array.isArray(snippets) || snippets.length === 0) {
    return {
      groundednessScore: 0,
      citationCoverageScore: includeCitations ? 0 : 100,
      retrievalMiss: true,
    };
  }
  const leaves: string[] = [];
  collectStringLeaves(jsonValue, leaves, { chars: 12000 });
  const outputTokens = tokenizeForGrounding(leaves.join(' '));
  const snippetTokens = new Set(tokenizeForGrounding(snippets.map((snippet) => snippet.text || '').join(' ')));
  let overlap = 0;
  for (const token of outputTokens) {
    if (snippetTokens.has(token)) overlap += 1;
  }
  const overlapRatio = outputTokens.length > 0 ? overlap / outputTokens.length : 0;
  const groundednessScore = Math.max(0, Math.min(100, Math.round((35 + overlapRatio * 75) * 100) / 100));

  if (!includeCitations) {
    return {
      groundednessScore,
      citationCoverageScore: groundednessScore,
      retrievalMiss: false,
    };
  }

  const rendered = JSON.stringify(jsonValue);
  const refs = new Set((rendered.match(/\[S(\d+)\]/g) ?? []).map((value) => Number(value.replace(/\D/g, ''))));
  const citationCoverageRatio = snippets.length > 0 ? Math.min(1, refs.size / snippets.length) : 0;
  return {
    groundednessScore,
    citationCoverageScore: Math.round(citationCoverageRatio * 10000) / 100,
    retrievalMiss: false,
  };
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
        usage: null,
        latencyMs: 0,
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
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY;
  const errors: string[] = [];
  const missingProviderNotice = new Set<LlmProvider>();
  const candidates = getTaskChatModelCandidates(options.task);

  if (candidates.length === 0) {
    throw new Error(`No chat model configured for task ${options.task}.`);
  }

  for (const candidate of candidates) {
    const candidateStart = now();
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
        const nvidiaResult = await callNvidiaChatCompletion({
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
            text: nvidiaResult.text,
            provider: 'nvidia',
            model: candidate.model,
            expiresAt: now() + CACHE_TTL_MS,
          });
        }
        const latencyMs = now() - candidateStart;
        void recordAiQualityRecord({
          task: options.task,
          provider: 'nvidia',
          model: candidate.model,
          latencyMs,
          promptTokens: nvidiaResult.usage?.promptTokens,
          completionTokens: nvidiaResult.usage?.completionTokens,
          totalTokens: nvidiaResult.usage?.totalTokens,
          contextSnippetCount: options.contextSnippets.length,
          success: true,
        });
        return {
          text: nvidiaResult.text,
          provider: 'nvidia',
          model: candidate.model,
          cacheHit: false,
          usage: nvidiaResult.usage,
          latencyMs,
        };
      }

      if (candidate.provider === 'gemini') {
        if (!isUsableGeminiApiKey(geminiKey)) {
          if (!missingProviderNotice.has('gemini')) {
            missingProviderNotice.add('gemini');
            errors.push('GEMINI_API_KEY missing or invalid.');
          }
          continue;
        }
        const geminiResult = await callGemini(
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
            text: geminiResult.text,
            provider: 'gemini',
            model: candidate.model,
            expiresAt: now() + CACHE_TTL_MS,
          });
        }
        const latencyMs = now() - candidateStart;
        void recordAiQualityRecord({
          task: options.task,
          provider: 'gemini',
          model: candidate.model,
          latencyMs,
          promptTokens: geminiResult.usage?.promptTokens,
          completionTokens: geminiResult.usage?.completionTokens,
          totalTokens: geminiResult.usage?.totalTokens,
          contextSnippetCount: options.contextSnippets.length,
          success: true,
        });
        return {
          text: geminiResult.text,
          provider: 'gemini',
          model: candidate.model,
          cacheHit: false,
          usage: geminiResult.usage,
          latencyMs,
        };
      }

      if (candidate.provider === 'groq') {
        if (!isUsableGroqApiKey(groqKey)) {
          if (!missingProviderNotice.has('groq')) {
            missingProviderNotice.add('groq');
            errors.push('GROQ_API_KEY missing or invalid.');
          }
          continue;
        }
        const groqResult = await callGroq(
          groqKey, candidate.model, fullSystemPrompt, options.userPrompt,
          options.messages, temperature, maxOutputTokens, topP
        );
        if (cacheEnabled) {
          RESPONSE_CACHE.set(cacheKey, { text: groqResult.text, provider: 'groq', model: candidate.model, expiresAt: now() + CACHE_TTL_MS });
        }
        const latencyMs = now() - candidateStart;
        void recordAiQualityRecord({ task: options.task, provider: 'groq', model: candidate.model, latencyMs, promptTokens: groqResult.usage?.promptTokens, completionTokens: groqResult.usage?.completionTokens, totalTokens: groqResult.usage?.totalTokens, contextSnippetCount: options.contextSnippets.length, success: true });
        return { text: groqResult.text, provider: 'groq', model: candidate.model, cacheHit: false, usage: groqResult.usage, latencyMs };
      }

      if (candidate.provider === 'cerebras') {
        if (!isUsableCerebrasApiKey(cerebrasKey)) {
          if (!missingProviderNotice.has('cerebras')) {
            missingProviderNotice.add('cerebras');
            errors.push('CEREBRAS_API_KEY missing or invalid (format: csk-...).');
          }
          continue;
        }
        const result = await callCerebras(
          cerebrasKey, candidate.model, fullSystemPrompt, options.userPrompt,
          options.messages, temperature, maxOutputTokens, topP
        );
        if (cacheEnabled) {
          RESPONSE_CACHE.set(cacheKey, { text: result.text, provider: 'cerebras', model: candidate.model, expiresAt: now() + CACHE_TTL_MS });
        }
        const latencyMs = now() - candidateStart;
        void recordAiQualityRecord({ task: options.task, provider: 'cerebras', model: candidate.model, latencyMs, promptTokens: result.usage?.promptTokens, completionTokens: result.usage?.completionTokens, totalTokens: result.usage?.totalTokens, contextSnippetCount: options.contextSnippets.length, success: true });
        return { text: result.text, provider: 'cerebras', model: candidate.model, cacheHit: false, usage: result.usage, latencyMs };
      }

      if (candidate.provider === 'mistral') {
        if (!isUsableMistralApiKey(mistralKey)) {
          if (!missingProviderNotice.has('mistral')) {
            missingProviderNotice.add('mistral');
            errors.push('MISTRAL_API_KEY missing or invalid.');
          }
          continue;
        }
        const result = await callMistral(
          mistralKey, candidate.model, fullSystemPrompt, options.userPrompt,
          options.messages, temperature, maxOutputTokens, topP
        );
        if (cacheEnabled) {
          RESPONSE_CACHE.set(cacheKey, { text: result.text, provider: 'mistral', model: candidate.model, expiresAt: now() + CACHE_TTL_MS });
        }
        const latencyMs = now() - candidateStart;
        void recordAiQualityRecord({ task: options.task, provider: 'mistral', model: candidate.model, latencyMs, promptTokens: result.usage?.promptTokens, completionTokens: result.usage?.completionTokens, totalTokens: result.usage?.totalTokens, contextSnippetCount: options.contextSnippets.length, success: true });
        return { text: result.text, provider: 'mistral', model: candidate.model, cacheHit: false, usage: result.usage, latencyMs };
      }
    } catch (error) {
      errors.push(String(error));
      void recordAiQualityRecord({
        task: options.task,
        provider: candidate.provider,
        model: candidate.model,
        latencyMs: now() - candidateStart,
        contextSnippetCount: options.contextSnippets.length,
        success: false,
        errorCode: 'provider-generation-failed',
        errorMessage: String(error),
      });
    }
  }

  throw new Error(
    `No model could generate a response. Configure at least one of: NVIDIA_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, MISTRAL_API_KEY. Details: ${errors.slice(0, 6).join(' | ')}`
  );
}

export async function generateTaskText(options: GenerateTextOptions): Promise<GenerationResult> {
  return runGeneration(options);
}

export async function generateTaskJson<T>(options: GenerateJsonOptions<T>): Promise<{
  data: T;
  result: GenerationResult;
  quality: {
    groundednessScore: number;
    citationCoverageScore: number;
    retrievalMiss: boolean;
    repaired: boolean;
  };
}> {
  const evaluateAndAccept = (value: unknown) => {
    if (!options.validate(value)) return null;
    const quality = evaluateJsonGrounding(value, options.contextSnippets, options.includeCitations);
    return { data: value as T, quality };
  };

  const firstResult = await runGeneration(options);
  const firstParsed = tryParseJsonCandidates(firstResult.text);
  const acceptedFirst = firstParsed.parsed ? evaluateAndAccept(firstParsed.parsed) : null;
  if (acceptedFirst && (acceptedFirst.quality.retrievalMiss || acceptedFirst.quality.groundednessScore >= 52)) {
    void recordAiQualityRecord({
      task: options.task,
      provider: firstResult.provider,
      model: firstResult.model,
      latencyMs: firstResult.latencyMs,
      promptTokens: firstResult.usage?.promptTokens,
      completionTokens: firstResult.usage?.completionTokens,
      totalTokens: firstResult.usage?.totalTokens,
      contextSnippetCount: options.contextSnippets.length,
      groundednessScore: acceptedFirst.quality.groundednessScore,
      citationCoverageScore: acceptedFirst.quality.citationCoverageScore,
      retrievalMiss: acceptedFirst.quality.retrievalMiss,
      repaired: false,
      rejected: false,
      success: true,
    });
    return { data: acceptedFirst.data, result: firstResult, quality: { ...acceptedFirst.quality, repaired: false } };
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
- Do not add any explanatory text before or after JSON.
- Facts must stay grounded in the retrieved context snippets.`,
  };

  const retryResult = await runGeneration(retryOptions);
  const retryParsed = tryParseJsonCandidates(retryResult.text);
  const acceptedRetry = retryParsed.parsed ? evaluateAndAccept(retryParsed.parsed) : null;
  if (acceptedRetry && (acceptedRetry.quality.retrievalMiss || acceptedRetry.quality.groundednessScore >= 45)) {
    void recordAiQualityRecord({
      task: options.task,
      provider: retryResult.provider,
      model: retryResult.model,
      latencyMs: retryResult.latencyMs,
      promptTokens: retryResult.usage?.promptTokens,
      completionTokens: retryResult.usage?.completionTokens,
      totalTokens: retryResult.usage?.totalTokens,
      contextSnippetCount: options.contextSnippets.length,
      groundednessScore: acceptedRetry.quality.groundednessScore,
      citationCoverageScore: acceptedRetry.quality.citationCoverageScore,
      retrievalMiss: acceptedRetry.quality.retrievalMiss,
      repaired: true,
      rejected: false,
      success: true,
    });
    return { data: acceptedRetry.data, result: retryResult, quality: { ...acceptedRetry.quality, repaired: true } };
  }

  void recordAiQualityRecord({
    task: options.task,
    provider: retryResult.provider,
    model: retryResult.model,
    latencyMs: retryResult.latencyMs,
    promptTokens: retryResult.usage?.promptTokens,
    completionTokens: retryResult.usage?.completionTokens,
    totalTokens: retryResult.usage?.totalTokens,
    contextSnippetCount: options.contextSnippets.length,
    groundednessScore: acceptedRetry?.quality.groundednessScore,
    citationCoverageScore: acceptedRetry?.quality.citationCoverageScore,
    retrievalMiss: acceptedRetry?.quality.retrievalMiss,
    repaired: true,
    rejected: true,
    success: false,
    errorCode: 'json-grounding-rejected',
    errorMessage: `first=${firstParsed.error ?? 'schema-or-grounding'}; retry=${retryParsed.error ?? 'schema-or-grounding'}`,
  });

  if (firstParsed.parsed && !options.validate(firstParsed.parsed)) {
    throw new Error(`Model returned schema-invalid JSON for task ${options.task}.`);
  }

  throw new Error(
    `Model returned invalid/weakly-grounded JSON for task ${options.task}: first=${firstParsed.error ?? 'unknown'}; retry=${retryParsed.error ?? 'unknown'}`
  );
}
