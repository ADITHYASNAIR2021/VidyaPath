import type { ContextTask } from '@/lib/ai/context-retriever';

export type LlmProvider = 'nvidia' | 'gemini' | 'groq' | 'cerebras' | 'mistral';
export type LlmMode = 'chat' | 'embedding' | 'rerank' | 'ocr' | 'table' | 'image';

export interface LlmModelConfig {
  alias: string;
  provider: LlmProvider;
  mode: LlmMode;
  model: string;
  endpoint?: string;
  description?: string;
  defaultParams?: Record<string, unknown>;
}

const CONTEXT_TASKS: ContextTask[] = [
  'chat',
  'flashcards',
  'mcq',
  'adaptive-test',
  'revision-plan',
  'paper-evaluate',
  'chapter-pack',
  'chapter-drill',
  'chapter-diagnose',
  'chapter-remediate',
];

const REGISTERED_MODELS: LlmModelConfig[] = [
  // Chat models verified live on 2026-11-13 via the developer console provider check.
  // Providers retire models often — re-check at /developer → Providers and update this list.
  {
    alias: 'GEMINI_35_FLASH_LITE',
    provider: 'gemini',
    mode: 'chat',
    model: 'gemini-3.5-flash-lite',
    description: 'Fast multimodal Gemini model; primary for grounded generation.',
    defaultParams: { temperature: 0.2, topP: 0.9, maxOutputTokens: 2400 },
  },
  {
    alias: 'GEMINI_31_FLASH_LITE',
    provider: 'gemini',
    mode: 'chat',
    model: 'gemini-3.1-flash-lite',
    description: 'Fast Gemini fallback.',
    defaultParams: { temperature: 0.2, topP: 0.9, maxOutputTokens: 2400 },
  },
  {
    alias: 'GEMINI_FLASH_LITE_LATEST',
    provider: 'gemini',
    mode: 'chat',
    model: 'gemini-flash-lite-latest',
    description: 'Rolling alias to the newest Gemini Flash-Lite.',
    defaultParams: { temperature: 0.2, topP: 0.9, maxOutputTokens: 2400 },
  },
  {
    alias: 'GEMINI_35_FLASH',
    provider: 'gemini',
    mode: 'chat',
    model: 'gemini-3.5-flash',
    description: 'Higher-quality Gemini Flash (slower; thinking model).',
    defaultParams: { temperature: 0.2, topP: 0.9, maxOutputTokens: 3000 },
  },
  {
    alias: 'GEMINI_25_FLASH',
    provider: 'gemini',
    mode: 'chat',
    model: 'gemini-2.5-flash',
    description: 'Gemini 2.5 Flash (separate free-tier quota pool).',
    defaultParams: { temperature: 0.2, topP: 0.9, maxOutputTokens: 2400 },
  },
  {
    alias: 'GEMINI_25_FLASH_LITE',
    provider: 'gemini',
    mode: 'chat',
    model: 'gemini-2.5-flash-lite',
    description: 'Gemini 2.5 Flash-Lite (separate free-tier quota pool).',
    defaultParams: { temperature: 0.2, topP: 0.9, maxOutputTokens: 2400 },
  },
  {
    alias: 'GROQ_GPT_OSS_120B',
    provider: 'groq',
    mode: 'chat',
    model: 'openai/gpt-oss-120b',
    description: 'Groq flagship open-weight reasoning model (free tier rejects very large prompts with 413).',
    defaultParams: { temperature: 0.2, top_p: 0.9, max_tokens: 2400 },
  },
  {
    alias: 'GROQ_QWEN38_27B',
    provider: 'groq',
    mode: 'chat',
    model: 'qwen/qwen3.8-27b',
    description: 'Groq fast multilingual model.',
    defaultParams: { temperature: 0.2, top_p: 0.9, max_tokens: 2400 },
  },
  {
    alias: 'GROQ_GPT_OSS_20B',
    provider: 'groq',
    mode: 'chat',
    model: 'openai/gpt-oss-20b',
    description: 'Groq small reasoning model; fast fallback.',
    defaultParams: { temperature: 0.2, top_p: 0.9, max_tokens: 2400 },
  },
  {
    alias: 'MISTRAL_MINISTRAL_14B',
    provider: 'mistral',
    mode: 'chat',
    model: 'ministral-14b-latest',
    description: 'Mistral Ministral 14B — free tier.',
    defaultParams: { temperature: 0.2, top_p: 0.9, max_tokens: 2400 },
  },
  {
    alias: 'MISTRAL_SMALL',
    provider: 'mistral',
    mode: 'chat',
    model: 'mistral-small-latest',
    description: 'Mistral Small — free tier is heavily rate-limited.',
    defaultParams: { temperature: 0.2, top_p: 0.9, max_tokens: 2048 },
  },
  {
    alias: 'NVIDIA_NEMOTRON_LIGHTNING',
    provider: 'nvidia',
    mode: 'chat',
    model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    description: 'NVIDIA hosted Nemotron (fast; may emit reasoning before the answer).',
    defaultParams: { temperature: 0.2, top_p: 0.9, max_tokens: 2400 },
  },
  {
    alias: 'CEREBRAS_GPT_OSS_120B',
    provider: 'cerebras',
    mode: 'chat',
    model: 'gpt-oss-120b',
    description: 'Cerebras gpt-oss-120b (requires a Cerebras account with billing).',
    defaultParams: { temperature: 0.2, top_p: 0.9, max_tokens: 2400 },
  },
  {
    alias: 'RERANK_V2',
    provider: 'nvidia',
    mode: 'rerank',
    model: 'nvidia/llama-nemotron-rerank-1b-v2',
    endpoint: 'https://ai.api.nvidia.com/v1/retrieval/nvidia/llama-nemotron-rerank-1b-v2/reranking',
    description: 'Passage reranking model for retrieval pipelines.',
  },
  {
    alias: 'EMBED_V2',
    provider: 'nvidia',
    mode: 'embedding',
    model: 'nvidia/llama-nemotron-embed-1b-v2',
    description: 'Embedding model for semantic indexing and retrieval.',
  },
  {
    alias: 'OCR_V1',
    provider: 'nvidia',
    mode: 'ocr',
    model: 'nvidia/nemotron-ocr-v1',
    endpoint: 'https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v1',
    description: 'OCR extraction from document images.',
  },
  {
    alias: 'TABLE_V1',
    provider: 'nvidia',
    mode: 'table',
    model: 'nvidia/nemotron-table-structure-v1',
    endpoint: 'https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-table-structure-v1',
    description: 'Table structure detection from document images.',
  },
  {
    alias: 'IMG_FLUX2',
    provider: 'nvidia',
    mode: 'image',
    model: 'black-forest-labs/flux.2-klein-4b',
    endpoint: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b',
    description: 'Text-to-image generation.',
  },
];

const FAST_JSON_CHAIN = ['GEMINI_35_FLASH_LITE', 'GROQ_GPT_OSS_120B', 'GEMINI_31_FLASH_LITE', 'GROQ_QWEN38_27B', 'MISTRAL_MINISTRAL_14B', 'GEMINI_FLASH_LITE_LATEST', 'GEMINI_25_FLASH_LITE', 'GEMINI_25_FLASH', 'GROQ_GPT_OSS_20B', 'NVIDIA_NEMOTRON_LIGHTNING', 'MISTRAL_SMALL', 'CEREBRAS_GPT_OSS_120B', 'GEMINI_35_FLASH'];

const DEFAULT_TASK_MODEL_ALIASES: Record<ContextTask, string[]> = {
  chat: ['GEMINI_35_FLASH_LITE', 'GEMINI_31_FLASH_LITE', 'GROQ_QWEN38_27B', 'GROQ_GPT_OSS_120B', 'MISTRAL_MINISTRAL_14B', 'GEMINI_FLASH_LITE_LATEST', 'GEMINI_25_FLASH_LITE', 'GEMINI_25_FLASH', 'GROQ_GPT_OSS_20B', 'NVIDIA_NEMOTRON_LIGHTNING', 'MISTRAL_SMALL', 'CEREBRAS_GPT_OSS_120B', 'GEMINI_35_FLASH'],
  flashcards: FAST_JSON_CHAIN,
  mcq: FAST_JSON_CHAIN,
  'adaptive-test': FAST_JSON_CHAIN,
  'revision-plan': FAST_JSON_CHAIN,
  'paper-evaluate': FAST_JSON_CHAIN,
  'chapter-pack': FAST_JSON_CHAIN,
  'chapter-drill': FAST_JSON_CHAIN,
  'chapter-diagnose': FAST_JSON_CHAIN,
  'chapter-remediate': FAST_JSON_CHAIN,
};

const MODEL_BY_ALIAS = new Map(REGISTERED_MODELS.map((model) => [model.alias.toUpperCase(), model]));

function parseAliasList(input: string): string[] {
  return input
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
}

function isContextTask(value: string): value is ContextTask {
  return (CONTEXT_TASKS as string[]).includes(value);
}

function parseTaskMapOverrideFromEnv(): Partial<Record<ContextTask, string[]>> {
  const raw = process.env.AI_TASK_MODEL_MAP?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const output: Partial<Record<ContextTask, string[]>> = {};
    for (const [rawTask, rawAliases] of Object.entries(parsed)) {
      if (!isContextTask(rawTask)) continue;
      if (!Array.isArray(rawAliases)) continue;
      const aliases = rawAliases
        .map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : ''))
        .filter((alias) => alias.length > 0);
      if (aliases.length > 0) output[rawTask] = aliases;
    }
    return output;
  } catch {
    return {};
  }
}

function mergeAliases(primary: string[], fallback: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const alias of [...primary, ...fallback]) {
    const normalized = alias.trim().toUpperCase();
    if (!normalized || seen.has(normalized)) continue;
    if (!MODEL_BY_ALIAS.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }
  return merged;
}

export function getModelConfig(alias: string): LlmModelConfig | null {
  return MODEL_BY_ALIAS.get(alias.trim().toUpperCase()) ?? null;
}

export function getTaskModelAliases(task: ContextTask): string[] {
  const envSpecific = process.env[`AI_TASK_MODEL_${task.toUpperCase().replace(/-/g, '_')}`]?.trim() ?? '';
  const directAliases = envSpecific ? parseAliasList(envSpecific) : [];
  const mapOverrides = parseTaskMapOverrideFromEnv();
  const mappedAliases = mapOverrides[task] ?? [];
  const defaults = DEFAULT_TASK_MODEL_ALIASES[task] ?? [];
  return mergeAliases([...directAliases, ...mappedAliases], defaults);
}

export function getTaskChatModelCandidates(task: ContextTask): LlmModelConfig[] {
  const aliases = getTaskModelAliases(task);
  return aliases
    .map((alias) => getModelConfig(alias))
    .filter((model): model is LlmModelConfig => !!model && model.mode === 'chat');
}

export function listContextTasks(): ContextTask[] {
  return [...CONTEXT_TASKS];
}

export function listRegisteredModels(): LlmModelConfig[] {
  return [...REGISTERED_MODELS];
}
