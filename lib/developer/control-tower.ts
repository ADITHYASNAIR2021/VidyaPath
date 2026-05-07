import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getAnalyticsSummary } from '@/lib/analytics-store';
import { listRegisteredModels, getTaskModelAliases } from '@/lib/ai/model-routing';
import { getAiQualitySummary } from '@/lib/ai/quality-store';
import { validateEnv } from '@/lib/config/env-validation';
import { isLegacySessionAuthEnabled } from '@/lib/auth/guards';
import { getObservabilitySummary } from '@/lib/observability-summary';
import { getTokenUsageRollup } from '@/lib/platform-rbac-db';
import { isSupabaseStateEnabled } from '@/lib/persistence/supabase-state';
import { isSupabaseServiceConfigured, supabaseSelect } from '@/lib/supabase-rest';

interface AuditEventRow {
  endpoint: string;
  action: string;
  status_code: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AppStateRow {
  state_key: string;
  updated_at: string;
}

function sanitizeText(value: string, max = 200): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function isUsableGroqApiKey(key: string | undefined): boolean {
  const normalized = (key || '').trim();
  return normalized.startsWith('gsk_') && !normalized.toLowerCase().includes('placeholder');
}

function isUsableGeminiApiKey(key: string | undefined): boolean {
  const normalized = (key || '').trim();
  return normalized.startsWith('AIza') && !normalized.toLowerCase().includes('placeholder');
}

function isUsableNvidiaApiKey(key: string | undefined): boolean {
  const normalized = (key || '').trim();
  return normalized.startsWith('nvapi-') && !normalized.toLowerCase().includes('placeholder');
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTaskList(): Array<
  'chat' | 'flashcards' | 'mcq' | 'adaptive-test' | 'revision-plan' | 'paper-evaluate' | 'chapter-pack' | 'chapter-drill' | 'chapter-diagnose' | 'chapter-remediate'
> {
  return [
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
}

async function getServiceWorkerFreshness() {
  const swPath = path.join(process.cwd(), 'public', 'sw.js');
  try {
    const stat = await fs.stat(swPath);
    const ageMs = Math.max(0, Date.now() - stat.mtimeMs);
    return {
      exists: true,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      ageMinutes: Math.round(ageMs / 60000),
    };
  } catch {
    return {
      exists: false,
      updatedAt: null as string | null,
      ageMinutes: -1,
    };
  }
}

async function getValidationFailureBoard(windowHours = 168) {
  if (!isSupabaseServiceConfigured()) return [];
  const cutoffIso = new Date(Date.now() - Math.max(1, windowHours) * 60 * 60 * 1000).toISOString();
  const rows = await supabaseSelect<AuditEventRow>('audit_events', {
    select: 'endpoint,action,status_code,metadata,created_at',
    filters: [{ column: 'created_at', op: 'gte', value: cutoffIso }],
    orderBy: 'created_at',
    ascending: false,
    limit: 6000,
  }).catch(() => []);
  const board = new Map<string, {
    endpoint: string;
    schema: string;
    failures: number;
    sampleErrorCode: string;
    lastSeenAt: string;
  }>();
  for (const row of rows) {
    const action = String(row.action || '').toLowerCase();
    const status = Number(row.status_code) || 0;
    const metadata = row.metadata || {};
    const errorCode = sanitizeText(String(metadata.errorCode || ''), 120);
    const schema = sanitizeText(String(metadata.schema || metadata.validator || 'request-body'), 140) || 'request-body';
    const looksLikeValidation =
      status === 400 ||
      status === 422 ||
      action.includes('validation') ||
      action.includes('invalid') ||
      errorCode.includes('invalid') ||
      errorCode.includes('body-');
    if (!looksLikeValidation) continue;
    const endpoint = sanitizeText(row.endpoint || 'unknown-endpoint', 180) || 'unknown-endpoint';
    const key = `${endpoint}::${schema}`;
    const current = board.get(key) ?? {
      endpoint,
      schema,
      failures: 0,
      sampleErrorCode: errorCode || 'validation-failed',
      lastSeenAt: row.created_at,
    };
    current.failures += 1;
    if (!current.sampleErrorCode && errorCode) current.sampleErrorCode = errorCode;
    if (row.created_at > current.lastSeenAt) current.lastSeenAt = row.created_at;
    board.set(key, current);
  }
  return [...board.values()].sort((a, b) => b.failures - a.failures).slice(0, 20);
}

export async function getDeveloperControlTower(windowHours = 24) {
  const safeWindow = Math.max(1, Math.min(24 * 14, Number(windowHours) || 24));
  const [observability, analytics, usage, aiQuality, validationBoard, swFreshness] = await Promise.all([
    getObservabilitySummary(safeWindow).catch(() => null),
    getAnalyticsSummary(20).catch(() => null),
    getTokenUsageRollup({ limit: 1500 }).catch(() => ({ events: 0, totalTokens: 0, records: [] })),
    getAiQualitySummary(Math.max(24, safeWindow * 3)).catch(() => null),
    getValidationFailureBoard(Math.max(24, safeWindow * 3)).catch(() => []),
    getServiceWorkerFreshness(),
  ]);

  const models = listRegisteredModels();
  const providerConfigured: Record<string, boolean> = {
    nvidia: isUsableNvidiaApiKey(process.env.NVIDIA_API_KEY),
    gemini: isUsableGeminiApiKey(process.env.GEMINI_API_KEY),
    groq: isUsableGroqApiKey(process.env.GROQ_API_KEY),
    cerebras: !!(process.env.CEREBRAS_API_KEY?.trim().startsWith('csk-')),
    mistral: !!(process.env.MISTRAL_API_KEY?.trim() && process.env.MISTRAL_API_KEY.trim().length >= 16),
  };

  const usageByModel = new Map<string, { events: number; tokens: number; failures: number; latencyMs: number; latencySamples: number }>();
  for (const record of usage.records) {
    const model = sanitizeText(record.model || 'unknown', 140) || 'unknown';
    const key = `${record.provider || 'unknown'}::${model}`;
    const bucket = usageByModel.get(key) ?? { events: 0, tokens: 0, failures: 0, latencyMs: 0, latencySamples: 0 };
    bucket.events += 1;
    bucket.tokens += Math.max(0, Number(record.totalTokens) || 0);
    usageByModel.set(key, bucket);
  }

  const taskAssignments = getTaskList().map((task) => ({
    task,
    aliases: getTaskModelAliases(task),
  }));

  const modelHealth = models.map((model) => {
    const key = `${model.provider}::${model.model}`;
    const usageStats = usageByModel.get(key) ?? { events: 0, tokens: 0, failures: 0, latencyMs: 0, latencySamples: 0 };
    const assignedTasks = taskAssignments
      .filter((entry) => entry.aliases.includes(model.alias))
      .map((entry) => entry.task);
    return {
      alias: model.alias,
      provider: model.provider,
      mode: model.mode,
      model: model.model,
      configured: providerConfigured[model.provider],
      assignedTasks,
      events: usageStats.events,
      totalTokens: usageStats.tokens,
      failureRatePercent: usageStats.events > 0 ? Math.round((usageStats.failures / usageStats.events) * 10000) / 100 : 0,
    };
  });

  const envReport = validateEnv('report');
  const appStateRows = isSupabaseServiceConfigured()
    ? await supabaseSelect<AppStateRow>('app_state', {
        select: 'state_key,updated_at',
        orderBy: 'updated_at',
        ascending: false,
        limit: 120,
      }).catch(() => [])
    : [];

  const hasContextState = appStateRows.some((row) => row.state_key?.includes('context'));
  const hasVectorState = appStateRows.some((row) => row.state_key?.includes('vector'));
  const vectorCoveragePercent = hasContextState ? (hasVectorState ? 100 : 55) : 20;
  const migrationSignals = {
    hasAppStateRows: appStateRows.length > 0,
    latestStateUpdateAt: appStateRows[0]?.updated_at ?? null,
  };

  const topApiErrors = analytics?.topUxApiErrors ?? [];
  const topApiRequests = analytics?.topUxApiRequests ?? [];
  const requestMap = new Map(topApiRequests.map((entry) => [entry.endpoint, entry.count]));
  const slowestApiRoutes = topApiErrors.slice(0, 12).map((entry) => {
    const total = requestMap.get(entry.endpoint) ?? 0;
    const errorRate = total > 0 ? Math.round((entry.count / total) * 10000) / 100 : 0;
    return {
      endpoint: entry.endpoint,
      errors: entry.count,
      requests: total,
      errorRatePercent: errorRate,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    windowHours: safeWindow,
    modelHealth: {
      providerConfigured,
      taskAssignments,
      models: modelHealth,
    },
    validationBoard,
    routeSignals: {
      slowestApiRoutes,
      routeDropoffs: analytics?.topUxRouteDropoffs ?? [],
      pageLoadBuckets: analytics?.topUxPageLoadBuckets ?? [],
      avgPageLoadMs: analytics?.avgUxPageLoadMs ?? 0,
    },
    deploymentReadiness: {
      envOk: envReport.ok,
      envMissing: envReport.missing,
      envWarnings: envReport.warnings,
      supabaseServiceConfigured: isSupabaseServiceConfigured(),
      supabaseStateEnabled: isSupabaseStateEnabled(),
      migrationSignals,
      rlsHealth: {
        status: isSupabaseServiceConfigured() ? 'review-required' : 'unavailable',
        note: isSupabaseServiceConfigured()
          ? 'Service-role access is active. Verify RLS with anon/user-level smoke tests before release.'
          : 'Supabase service role is not configured.',
      },
      pgvectorCoverage: {
        percent: vectorCoveragePercent,
        hasContextState,
        hasVectorState,
      },
      serviceWorker: swFreshness,
      legacySessionsEnabled: isLegacySessionAuthEnabled(),
      singleEnvModeEnabled: (process.env.SINGLE_ENV_MODE || '').trim() === '1',
    },
    aiQuality: aiQuality ?? {
      generatedAt: new Date().toISOString(),
      windowHours: Math.max(24, safeWindow * 3),
      records: 0,
      successes: 0,
      failures: 0,
      repairRatePercent: 0,
      rejectionRatePercent: 0,
      retrievalMissRatePercent: 0,
      avgGroundednessScore: 0,
      avgCitationCoverageScore: 0,
      hallucinationFlags: 0,
      providerStats: [],
      taskStats: [],
      recentFlags: [],
      feedback: {
        total: 0,
        unsafeAnswer: 0,
        weakGrounding: 0,
        missingCitation: 0,
        hallucinationFlag: 0,
        other: 0,
      },
    },
    observabilityCounters: observability?.counters ?? null,
  };
}
