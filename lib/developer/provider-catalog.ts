import { listRegisteredModels, type LlmModelConfig, type LlmProvider } from '@/lib/ai/model-routing';

/**
 * Live view of what each AI provider key can actually use.
 * Providers retire models regularly (HTTP 404/410); the developer console uses this
 * to show which registered models are still served and to test any model on demand.
 */

interface ProviderSpec {
  id: LlmProvider;
  envKey: string;
  listUrl: string;
  chatUrl: string;
}

const NVIDIA_BASE = (process.env.NVIDIA_INTEGRATE_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');

const PROVIDERS: ProviderSpec[] = [
  { id: 'nvidia', envKey: 'NVIDIA_API_KEY', listUrl: `${NVIDIA_BASE}/models`, chatUrl: `${NVIDIA_BASE}/chat/completions` },
  {
    id: 'gemini',
    envKey: 'GEMINI_API_KEY',
    listUrl: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    chatUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  { id: 'groq', envKey: 'GROQ_API_KEY', listUrl: 'https://api.groq.com/openai/v1/models', chatUrl: 'https://api.groq.com/openai/v1/chat/completions' },
  { id: 'cerebras', envKey: 'CEREBRAS_API_KEY', listUrl: 'https://api.cerebras.ai/v1/models', chatUrl: 'https://api.cerebras.ai/v1/chat/completions' },
  { id: 'mistral', envKey: 'MISTRAL_API_KEY', listUrl: 'https://api.mistral.ai/v1/models', chatUrl: 'https://api.mistral.ai/v1/chat/completions' },
];

const TIMEOUT_MS = 15_000;

function providerKey(spec: ProviderSpec): string {
  return (process.env[spec.envKey] || '').trim();
}

function authHeaders(spec: ProviderSpec, key: string): Record<string, string> {
  return spec.id === 'gemini' ? { 'x-goog-api-key': key } : { Authorization: `Bearer ${key}` };
}

async function timedFetch(url: string, init: RequestInit): Promise<{ response: Response; latencyMs: number }> {
  const started = Date.now();
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  return { response, latencyMs: Date.now() - started };
}

function summarizeError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const nested = parsed.error as Record<string, unknown> | string | undefined;
    const message =
      (typeof nested === 'object' && nested && typeof nested.message === 'string' && nested.message) ||
      (typeof nested === 'string' && nested) ||
      (typeof parsed.detail === 'string' && parsed.detail) ||
      (typeof parsed.message === 'string' && parsed.message) ||
      '';
    if (message) return `${status}: ${message.slice(0, 220)}`;
  } catch {
    // fall through to raw text
  }
  return `${status}: ${body.replace(/\s+/g, ' ').slice(0, 220)}`;
}

export interface ProviderCatalogEntry {
  provider: LlmProvider;
  envKey: string;
  configured: boolean;
  reachable: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
  modelCount: number;
  chatModels: string[];
}

async function listProviderModels(spec: ProviderSpec): Promise<ProviderCatalogEntry> {
  const key = providerKey(spec);
  const base: ProviderCatalogEntry = {
    provider: spec.id,
    envKey: spec.envKey,
    configured: !!key,
    reachable: false,
    status: null,
    latencyMs: null,
    error: null,
    modelCount: 0,
    chatModels: [],
  };
  if (!key) return { ...base, error: `${spec.envKey} not set` };

  try {
    const { response, latencyMs } = await timedFetch(spec.listUrl, { headers: authHeaders(spec, key) });
    const text = await response.text();
    if (!response.ok) return { ...base, status: response.status, latencyMs, error: summarizeError(response.status, text) };
    const payload = JSON.parse(text) as { data?: Array<{ id?: string }>; models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
    const models =
      spec.id === 'gemini'
        ? (payload.models ?? [])
            .filter((model) => (model.supportedGenerationMethods ?? []).includes('generateContent'))
            .map((model) => String(model.name || '').replace(/^models\//, ''))
        : (payload.data ?? []).map((model) => String(model.id || ''));
    const chatModels = models.filter(Boolean).sort();
    return { ...base, reachable: true, status: response.status, latencyMs, modelCount: chatModels.length, chatModels };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface RegisteredModelStatus {
  alias: string;
  provider: LlmProvider;
  model: string;
  mode: string;
  /** true = provider lists it, false = provider does not list it, null = provider not checked/unreachable */
  listedByProvider: boolean | null;
}

export async function getProviderCatalog(): Promise<{
  generatedAt: string;
  providers: ProviderCatalogEntry[];
  registered: RegisteredModelStatus[];
}> {
  const providers = await Promise.all(PROVIDERS.map(listProviderModels));
  const byProvider = new Map(providers.map((entry) => [entry.provider, entry]));
  const registered = listRegisteredModels()
    .filter((model) => model.mode === 'chat')
    .map((model) => {
      const entry = byProvider.get(model.provider);
      return {
        alias: model.alias,
        provider: model.provider,
        model: model.model,
        mode: model.mode,
        listedByProvider: entry?.reachable ? entry.chatModels.includes(model.model) : null,
      };
    });
  return { generatedAt: new Date().toISOString(), providers, registered };
}

export interface ModelPingResult {
  provider: LlmProvider;
  model: string;
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  reply: string | null;
  error: string | null;
}

/** One tiny real completion against a specific model ("Reply with OK", ≤8 tokens). */
export async function pingModel(provider: LlmProvider, model: string): Promise<ModelPingResult> {
  const spec = PROVIDERS.find((item) => item.id === provider);
  const result: ModelPingResult = { provider, model, ok: false, status: null, latencyMs: null, reply: null, error: null };
  if (!spec) return { ...result, error: 'Unknown provider' };
  const key = providerKey(spec);
  if (!key) return { ...result, error: `${spec.envKey} not set` };

  const prompt = 'Reply with exactly: OK';
  try {
    const isGemini = provider === 'gemini';
    const url = isGemini ? `${spec.chatUrl}/${encodeURIComponent(model)}:generateContent` : spec.chatUrl;
    const body = isGemini
      ? { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 16, temperature: 0 } }
      : { model, messages: [{ role: 'user', content: prompt }], max_tokens: 16, temperature: 0 };
    const { response, latencyMs } = await timedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(spec, key) },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) return { ...result, status: response.status, latencyMs, error: summarizeError(response.status, text) };
    const payload = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null } }>;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const reply = isGemini
      ? payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
      : payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.message?.reasoning_content ?? '';
    return { ...result, ok: true, status: response.status, latencyMs, reply: reply.trim().slice(0, 80) || '(empty reply)' };
  } catch (error) {
    return { ...result, error: error instanceof Error ? error.message : String(error) };
  }
}

export function findRegisteredModel(alias: string): LlmModelConfig | undefined {
  return listRegisteredModels().find((model) => model.alias.toUpperCase() === alias.trim().toUpperCase());
}
