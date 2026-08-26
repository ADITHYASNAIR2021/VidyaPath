export type GeminiEmbeddingTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

const DEFAULT_MODEL = 'gemini-embedding-001';
const DEFAULT_DIMENSIONS = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

function normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? values.map((value) => value / norm) : values;
}

export function isUsableGeminiApiKey(key: string | undefined): key is string {
  if (!key?.trim()) return false;
  const compact = key.trim().toLowerCase().replace(/\s+/g, '');
  return !['placeholder', 'replace', 'changeme', 'your_gemini_api_key_here'].some((fragment) =>
    compact.includes(fragment)
  );
}

export async function createGeminiRetrievalEmbeddings(options: {
  apiKey: string;
  input: string[];
  taskType: GeminiEmbeddingTask;
  dimensions?: number;
  model?: string;
}): Promise<number[][]> {
  const model = (options.model || process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_MODEL)
    .trim()
    .replace(/^models\//, '');
  const dimensions = options.dimensions ?? DEFAULT_DIMENSIONS;
  const timeoutMs = Math.max(5_000, Number(process.env.EMBEDDING_REQUEST_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'x-goog-api-key': options.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: options.input.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType: options.taskType,
          outputDimensionality: dimensions,
        })),
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini embedding ${model} failed: ${response.status} ${body.slice(0, 400)}`);
  }

  const payload = (await response.json()) as {
    embeddings?: Array<{ values?: number[] }>;
  };
  return (payload.embeddings ?? [])
    .map((embedding) => normalize(Array.isArray(embedding.values) ? embedding.values : []))
    .filter((embedding) => embedding.length === dimensions);
}
