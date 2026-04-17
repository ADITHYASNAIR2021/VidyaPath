export interface NvidiaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NvidiaChatOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  messages?: NvidiaChatMessage[];
  temperature: number;
  maxOutputTokens: number;
  topP?: number;
  extraBody?: Record<string, unknown>;
}

export interface NvidiaEmbeddingOptions {
  apiKey: string;
  model: string;
  input: string[];
  inputType?: 'query' | 'passage';
  truncate?: 'NONE' | 'START' | 'END';
}

export interface NvidiaRerankOptions {
  apiKey: string;
  model: string;
  query: string;
  passages: string[];
  endpoint?: string;
}

export interface NvidiaImageGenerationOptions {
  apiKey: string;
  modelEndpoint: string;
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
}

export interface LlmUsageCounts {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface NvidiaCompletionResult {
  text: string;
  usage: LlmUsageCounts | null;
}

const DEFAULT_NVIDIA_INTEGRATE_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_NVIDIA_AI_BASE_URL = 'https://ai.api.nvidia.com/v1';

function resolveIntegrateBaseUrl(): string {
  return (process.env.NVIDIA_INTEGRATE_BASE_URL || DEFAULT_NVIDIA_INTEGRATE_BASE_URL).replace(/\/+$/, '');
}

function resolveAiBaseUrl(): string {
  return (process.env.NVIDIA_AI_BASE_URL || DEFAULT_NVIDIA_AI_BASE_URL).replace(/\/+$/, '');
}

function cleanPlaceholderFragments(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

export function isUsableNvidiaApiKey(key: string | undefined): key is string {
  if (!key) return false;
  const normalized = key.trim();
  if (!normalized.startsWith('nvapi-')) return false;
  const compact = cleanPlaceholderFragments(normalized);
  return !['placeholder', 'replace', 'changeme', 'your_nvidia_api_key_here'].some((tag) => compact.includes(tag));
}

async function readErrorText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 400);
  } catch {
    return '';
  }
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const record = part as Record<string, unknown>;
        return typeof record.text === 'string' ? record.text : '';
      })
      .filter((part) => part.length > 0)
      .join('\n')
      .trim();
    return joined;
  }
  return '';
}

export async function callNvidiaChatCompletion(options: NvidiaChatOptions): Promise<NvidiaCompletionResult> {
  const url = `${resolveIntegrateBaseUrl()}/chat/completions`;
  const messages =
    options.messages && options.messages.length > 0
      ? [{ role: 'system', content: options.systemPrompt }, ...options.messages.slice(-14)]
      : [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userPrompt },
        ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      ...(options.extraBody ?? {}),
      model: options.model,
      messages,
      temperature: options.temperature,
      top_p: options.topP ?? 0.95,
      max_tokens: options.maxOutputTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await readErrorText(response);
    throw new Error(`NVIDIA ${options.model} failed: ${response.status} ${err}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
        reasoning_content?: unknown;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const text = normalizeMessageContent(payload.choices?.[0]?.message?.content);
  const outputText = text || normalizeMessageContent(payload.choices?.[0]?.message?.reasoning_content);
  if (!outputText) throw new Error(`NVIDIA ${options.model} returned empty output`);

  let usage: LlmUsageCounts | null = null;
  const u = payload.usage;
  if (u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number') {
    usage = {
      promptTokens: u.prompt_tokens,
      completionTokens: u.completion_tokens,
      totalTokens: u.total_tokens ?? u.prompt_tokens + u.completion_tokens,
    };
  }
  return { text: outputText, usage };
}

export async function createNvidiaEmbeddings(options: NvidiaEmbeddingOptions): Promise<number[][]> {
  const url = `${resolveIntegrateBaseUrl()}/embeddings`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      input: options.input,
      encoding_format: 'float',
      input_type: options.inputType ?? 'query',
      truncate: options.truncate ?? 'NONE',
    }),
  });
  if (!response.ok) {
    const err = await readErrorText(response);
    throw new Error(`NVIDIA embedding ${options.model} failed: ${response.status} ${err}`);
  }
  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  return (payload.data ?? [])
    .map((item) => (Array.isArray(item.embedding) ? item.embedding : []))
    .filter((embedding) => embedding.length > 0);
}

export async function rerankWithNvidia(options: NvidiaRerankOptions): Promise<unknown> {
  const endpoint =
    options.endpoint?.trim() ||
    `${resolveAiBaseUrl()}/retrieval/${options.model}/reranking`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      query: { text: options.query },
      passages: options.passages.map((text) => ({ text })),
    }),
  });
  if (!response.ok) {
    const err = await readErrorText(response);
    throw new Error(`NVIDIA rerank ${options.model} failed: ${response.status} ${err}`);
  }
  return response.json();
}

export async function runNvidiaOcr(options: {
  apiKey: string;
  modelEndpoint?: string;
  imageDataUrl: string;
}): Promise<unknown> {
  const endpoint = options.modelEndpoint?.trim() || `${resolveAiBaseUrl()}/cv/nvidia/nemotron-ocr-v1`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      input: [{ type: 'image_url', url: options.imageDataUrl }],
    }),
  });
  if (!response.ok) {
    const err = await readErrorText(response);
    throw new Error(`NVIDIA OCR failed: ${response.status} ${err}`);
  }
  return response.json();
}

export async function runNvidiaImageGeneration(options: NvidiaImageGenerationOptions): Promise<unknown> {
  const response = await fetch(options.modelEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      prompt: options.prompt,
      width: options.width ?? 1024,
      height: options.height ?? 1024,
      seed: options.seed ?? 0,
      steps: options.steps ?? 4,
    }),
  });
  if (!response.ok) {
    const err = await readErrorText(response);
    throw new Error(`NVIDIA image generation failed: ${response.status} ${err}`);
  }
  return response.json();
}
