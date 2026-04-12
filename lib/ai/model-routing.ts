import type { ContextTask } from '@/lib/ai/context-retriever';

export type LlmProvider = 'nvidia' | 'gemini' | 'groq';
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
  {
    alias: 'G4',
    provider: 'nvidia',
    mode: 'chat',
    model: 'google/gemma-3n-e4b-it',
    description: 'General multilingual multimodal model for tutoring and generation.',
    defaultParams: { temperature: 0.2, top_p: 0.7, max_tokens: 8192 },
  },
  {
    alias: 'M27',
    provider: 'nvidia',
    mode: 'chat',
    model: 'minimaxai/minimax-m2.7',
    description: 'Strong for code and complex office-style tasks.',
    defaultParams: { temperature: 0.4, top_p: 0.95, max_tokens: 16384 },
  },
  {
    alias: 'GLM5',
    provider: 'nvidia',
    mode: 'chat',
    model: 'z-ai/glm5',
    description: 'Long-context reasoning and agentic task execution.',
    defaultParams: {
      temperature: 0.4,
      top_p: 1,
      max_tokens: 32000,
      chat_template_kwargs: { enable_thinking: true, clear_thinking: false },
    },
  },
  {
    alias: 'K2',
    provider: 'nvidia',
    mode: 'chat',
    model: 'moonshotai/kimi-k2.5',
    description: 'General chat/comprehension model with optional thinking traces.',
    defaultParams: {
      temperature: 1,
      top_p: 1,
      max_tokens: 16384,
      chat_template_kwargs: { thinking: true },
    },
  },
  {
    alias: 'CODE',
    provider: 'nvidia',
    mode: 'chat',
    model: 'google/gemma-4-31b-it',
    description: 'Coding-focused generation assistant.',
    defaultParams: { temperature: 0.35, top_p: 0.95, max_tokens: 32000 },
  },
  {
    alias: 'GEMINI_FLASH',
    provider: 'gemini',
    mode: 'chat',
    model: 'gemini-2.0-flash',
    description: 'Low-latency Gemini model for tutoring/generation fallback.',
    defaultParams: { temperature: 0.2, topP: 0.9, maxOutputTokens: 1800 },
  },
  {
    alias: 'GEMINI_15_FLASH',
    provider: 'gemini',
    mode: 'chat',
    model: 'gemini-1.5-flash',
    description: 'Secondary Gemini fallback.',
    defaultParams: { temperature: 0.2, topP: 0.9, maxOutputTokens: 1800 },
  },
  {
    alias: 'GROQ_LLAMA_70B',
    provider: 'groq',
    mode: 'chat',
    model: 'llama-3.3-70b-versatile',
    description: 'Groq high-quality fallback.',
    defaultParams: { temperature: 0.2, top_p: 0.9, max_tokens: 1600 },
  },
  {
    alias: 'GROQ_LLAMA_8B',
    provider: 'groq',
    mode: 'chat',
    model: 'llama-3.1-8b-instant',
    description: 'Groq fast fallback.',
    defaultParams: { temperature: 0.2, top_p: 0.9, max_tokens: 1600 },
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

const DEFAULT_TASK_MODEL_ALIASES: Record<ContextTask, string[]> = {
  chat: ['G4', 'M27', 'GLM5', 'GEMINI_FLASH', 'GEMINI_15_FLASH', 'GROQ_LLAMA_70B', 'GROQ_LLAMA_8B'],
  flashcards: ['G4', 'GLM5', 'GEMINI_FLASH', 'GROQ_LLAMA_70B'],
  mcq: ['G4', 'GLM5', 'GEMINI_FLASH', 'GROQ_LLAMA_70B'],
  'adaptive-test': ['GLM5', 'G4', 'GEMINI_FLASH', 'GROQ_LLAMA_70B'],
  'revision-plan': ['G4', 'GLM5', 'GEMINI_FLASH', 'GROQ_LLAMA_70B'],
  'paper-evaluate': ['GLM5', 'M27', 'G4', 'GEMINI_FLASH', 'GROQ_LLAMA_70B'],
  'chapter-pack': ['G4', 'GLM5', 'GEMINI_FLASH', 'GROQ_LLAMA_70B'],
  'chapter-drill': ['G4', 'GLM5', 'GEMINI_FLASH', 'GROQ_LLAMA_70B'],
  'chapter-diagnose': ['G4', 'GLM5', 'GEMINI_FLASH', 'GROQ_LLAMA_70B'],
  'chapter-remediate': ['G4', 'GLM5', 'GEMINI_FLASH', 'GROQ_LLAMA_70B'],
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

export function listRegisteredModels(): LlmModelConfig[] {
  return [...REGISTERED_MODELS];
}
