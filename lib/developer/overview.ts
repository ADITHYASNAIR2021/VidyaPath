import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateEnv } from '@/lib/config/env-validation';
import { getGlobalBudgetUsage } from '@/lib/ai/cost-guard';
import { getUsageSummary } from '@/lib/ai/usage-metrics';
import { getUnavailableModels } from '@/lib/ai/generator';
import { getRerankStatus } from '@/lib/ai/context-retriever';
import { getModelConfig, getTaskModelAliases, listContextTasks } from '@/lib/ai/model-routing';
import { getAiQualitySummary } from '@/lib/ai/quality-store';
import { BOARD_CHAPTERS } from '@/lib/data';
import { getPaperStats } from '@/lib/papers';
import { getAllFormulaEntries } from '@/lib/formulas';
import { listCareerTracks, listCareerExams } from '@/lib/career-catalog';
import { getSiteUrl } from '@/lib/site-url';

const PROVIDER_KEYS = [
  { provider: 'gemini', envKey: 'GEMINI_API_KEY' },
  { provider: 'groq', envKey: 'GROQ_API_KEY' },
  { provider: 'mistral', envKey: 'MISTRAL_API_KEY' },
  { provider: 'nvidia', envKey: 'NVIDIA_API_KEY' },
  { provider: 'cerebras', envKey: 'CEREBRAS_API_KEY' },
] as const;

/** Files the RAG retriever reads (local file, .gz copy, or CONTEXT_CDN_URL). */
const RAG_FILES = [
  { file: 'chunks.jsonl', role: 'Board-paper chunks (PYQ grounding)' },
  { file: 'textbook_chunks.jsonl', role: 'NCERT textbook chunks' },
  { file: 'chapter_index.json', role: 'Chapter → paper chunk index' },
  { file: 'textbook_chapter_index.json', role: 'Chapter → textbook chunk index' },
  { file: 'retrieval_index.json', role: 'Hybrid BM25/topic retrieval index' },
  { file: 'chunk_vectors.jsonl', role: 'Dense vectors (optional)' },
];

function has(name: string): boolean {
  return (process.env[name] || '').trim().length > 0;
}

function positiveInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function fileSize(filePath: string): Promise<number | null> {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return null;
  }
}

async function getRagStatus() {
  const dir = path.join(process.cwd(), 'lib', 'context');
  const cdnConfigured = has('CONTEXT_CDN_URL');
  const files = await Promise.all(
    RAG_FILES.map(async ({ file, role }) => {
      const [local, gz] = await Promise.all([fileSize(path.join(dir, file)), fileSize(path.join(dir, `${file}.gz`))]);
      const source = local !== null ? 'local' : gz !== null ? 'local-gz' : cdnConfigured ? 'cdn' : 'missing';
      return { file, role, localBytes: local, gzBytes: gz, source };
    })
  );
  let chunkCount: number | null = null;
  try {
    const raw = await fs.readFile(path.join(dir, '.rag_count.json'), 'utf-8');
    chunkCount = Number((JSON.parse(raw) as { chunks?: number }).chunks) || null;
  } catch {
    chunkCount = null;
  }
  return { cdnConfigured, chunkCount, files, rerank: getRerankStatus() };
}

function getContentStats() {
  const byClassSubject = new Map<string, number>();
  for (const chapter of BOARD_CHAPTERS) {
    const key = `Class ${chapter.classLevel} · ${chapter.subject}`;
    byClassSubject.set(key, (byClassSubject.get(key) ?? 0) + 1);
  }
  const chaptersWithBuiltInFlashcards = BOARD_CHAPTERS.filter((chapter) => (chapter.flashcards?.length ?? 0) > 0).length;
  return {
    chapters: BOARD_CHAPTERS.length,
    chaptersByClassSubject: [...byClassSubject.entries()].map(([group, count]) => ({ group, count })).sort((a, b) => a.group.localeCompare(b.group)),
    chaptersWithBuiltInFlashcards,
    papers: getPaperStats(),
    formulas: getAllFormulaEntries().length,
    careerTracks: listCareerTracks().length,
    careerExams: listCareerExams().length,
  };
}

function getRouting() {
  return listContextTasks().map((task) => ({
    task,
    chain: getTaskModelAliases(task).map((alias) => {
      const model = getModelConfig(alias);
      return { alias, provider: model?.provider ?? 'unknown', model: model?.model ?? 'unknown' };
    }),
  }));
}

export async function getDeveloperOverview() {
  const started = Date.now();
  const env = validateEnv('report');
  const memory = process.memoryUsage();
  const [budget, usage, rag, quality] = await Promise.all([
    getGlobalBudgetUsage(),
    getUsageSummary(7),
    getRagStatus(),
    getAiQualitySummary(24 * 7).catch(() => null),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    runtime: {
      version: process.env.npm_package_version || '0.1.0',
      node: process.version,
      env: process.env.NODE_ENV || 'development',
      region: process.env.VERCEL_REGION || process.env.FLY_REGION || 'local',
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12) || null,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: { rss: Math.round(memory.rss / 1048576), heapUsed: Math.round(memory.heapUsed / 1048576) },
    },
    config: {
      siteUrl: getSiteUrl(),
      providers: PROVIDER_KEYS.map(({ provider, envKey }) => ({ provider, envKey, configured: has(envKey) })),
      upstash: has('UPSTASH_REDIS_REST_URL') && has('UPSTASH_REDIS_REST_TOKEN'),
      sentry: has('SENTRY_DSN') || has('NEXT_PUBLIC_SENTRY_DSN'),
      analytics: has('NEXT_PUBLIC_PLAUSIBLE_DOMAIN') ? 'plausible' : has('NEXT_PUBLIC_UMAMI_WEBSITE_ID') ? 'umami' : 'none',
      contextCdn: has('CONTEXT_CDN_URL'),
      limits: {
        aiRequestsPerIpPerDay: positiveInt('AI_PUBLIC_DAILY_REQUESTS_PER_IP', 120),
        dailyTokenBudget: budget.limit,
        maxTokensPerRequest: budget.maxTokensPerRequest,
        requestTimeoutMs: positiveInt('AI_REQUEST_TIMEOUT_MS', 30_000),
      },
      flags: {
        selfVerify: process.env.AI_ENABLE_SELF_VERIFY === '1',
        responseCache: process.env.AI_RESPONSE_CACHE !== '0',
        onDemandPdfExtraction: process.env.ENABLE_ON_DEMAND_PDF_EXTRACTION === '1',
        customTaskRouting: has('AI_TASK_MODEL_MAP'),
      },
      warnings: env.warnings,
    },
    budget,
    usage,
    models: {
      routing: getRouting(),
      circuitBreaker: getUnavailableModels(),
    },
    rag,
    content: getContentStats(),
    quality: quality
      ? {
          windowHours: quality.windowHours,
          records: quality.records,
          successes: quality.successes,
          failures: quality.failures,
          repairRatePercent: quality.repairRatePercent,
          rejectionRatePercent: quality.rejectionRatePercent,
          retrievalMissRatePercent: quality.retrievalMissRatePercent,
          avgGroundednessScore: quality.avgGroundednessScore,
          avgCitationCoverageScore: quality.avgCitationCoverageScore,
          providerStats: quality.providerStats.slice(0, 20),
        }
      : null,
    elapsedMs: Date.now() - started,
  };
}

export type DeveloperOverview = Awaited<ReturnType<typeof getDeveloperOverview>>;
