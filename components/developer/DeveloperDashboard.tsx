'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, LogOut, RefreshCw, Search } from 'lucide-react';
import type { DeveloperOverview } from '@/lib/developer/overview';
import ProvidersPanel from '@/components/developer/ProvidersPanel';
import EndpointTester from '@/components/developer/EndpointTester';
import { Badge, Button, Panel, Stat, Table, devFetch, formatBytes, formatDuration, formatNumber } from '@/components/developer/ui';

interface RagCheck {
  chapterTitle: string;
  latencyMs: number;
  snippetCount: number;
  retrieval: { confidence?: number; confidenceLevel?: string; sourceMix?: string[] } | null;
  snippets: Array<{ sourcePath: string; sourceType: string; relevanceScore: number; preview: string }>;
}

export default function DeveloperDashboard({ onLogout }: { onLogout: () => void }) {
  const [overview, setOverview] = useState<DeveloperOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ragChapter, setRagChapter] = useState('c10-chem-1');
  const [ragResult, setRagResult] = useState<RagCheck | null>(null);
  const [ragError, setRagError] = useState('');
  const [ragBusy, setRagBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await devFetch<DeveloperOverview>('/api/developer/overview');
    if (result.status === 401) {
      onLogout();
      return;
    }
    if (result.ok && result.data) {
      setOverview(result.data);
      setError('');
    } else {
      setError(result.message || `Failed to load (${result.status})`);
    }
    setLoading(false);
  }, [onLogout]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  async function logout() {
    await fetch('/api/developer/session', { method: 'DELETE' }).catch(() => undefined);
    onLogout();
  }

  async function runRagCheck() {
    setRagBusy(true);
    setRagError('');
    const result = await devFetch<RagCheck>('/api/developer/rag-check', { method: 'POST', body: JSON.stringify({ chapterId: ragChapter.trim() }) });
    if (result.ok && result.data) setRagResult(result.data);
    else setRagError(result.message || `Failed (${result.status})`);
    setRagBusy(false);
  }

  if (!overview) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--color-text-muted)]">
        {error ? <span className="text-rose-600">{error}</span> : <Loader2 className="h-5 w-5 animate-spin" />}
      </div>
    );
  }

  const { runtime, config, budget, usage, models, rag, content, quality } = overview;
  const today = usage.days[0];
  const budgetPct = budget.limit > 0 ? Math.min(100, Math.round((budget.used / budget.limit) * 100)) : 0;
  const configuredProviders = config.providers.filter((provider) => provider.configured).length;
  const errorRate = today.requests > 0 ? Math.round((today.errors / today.requests) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-[var(--color-text)]">Developer console</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            {config.siteUrl} · {runtime.env} · region {runtime.region}
            {runtime.commit ? ` · ${runtime.commit}` : ''} · updated {new Date(overview.generatedAt).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </Button>
          <Button onClick={logout} variant="danger">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </div>

      {config.warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">Configuration warnings</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {config.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="AI requests today" value={formatNumber(today.requests)} hint={`${today.ok} ok · ${today.limited} limited`} />
        <Stat label="AI errors today" value={`${errorRate}%`} hint={`${today.errors} server errors`} tone={errorRate > 10 ? 'bad' : errorRate > 2 ? 'warn' : 'good'} />
        <Stat label="Avg AI latency" value={today.avgLatencyMs ? `${(today.avgLatencyMs / 1000).toFixed(1)} s` : '—'} tone={today.avgLatencyMs > 30_000 ? 'warn' : 'neutral'} />
        <Stat label="Budget reserved today" value={formatNumber(budget.used)} hint={`${budgetPct}% of daily budget · ${formatNumber(today.tokens)} actually used`} tone={budgetPct > 90 ? 'bad' : budgetPct > 70 ? 'warn' : 'good'} />
        <Stat label="AI providers" value={`${configuredProviders}/${config.providers.length}`} hint="keys configured" tone={configuredProviders === 0 ? 'bad' : 'good'} />
        <Stat label="Uptime" value={formatDuration(runtime.uptimeSeconds)} hint={`${runtime.memoryMb.rss} MB RSS · ${runtime.node}`} />
      </div>

      <Panel
        title="Daily AI budget"
        subtitle={`Shared by all visitors. Resets ${new Date(budget.resetsAt).toLocaleString()} · counters in ${budget.backend}${budget.backend === 'memory' ? ' (per server instance — set Upstash for a hard global cap)' : ''}`}
      >
        <div className="h-3 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
          <div
            className={budgetPct > 90 ? 'h-full bg-rose-500' : budgetPct > 70 ? 'h-full bg-amber-500' : 'h-full bg-emerald-500'}
            style={{ width: `${budgetPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          {formatNumber(budget.used)} / {formatNumber(budget.limit)} tokens reserved (each request reserves its projected maximum up front, so this runs ahead of actual usage) · max {formatNumber(budget.maxTokensPerRequest)} per request ·{' '}
          {formatNumber(config.limits.aiRequestsPerIpPerDay)} AI requests per IP per day
        </p>
      </Panel>

      <Panel title="AI usage (last 7 days)" subtitle={`Counters stored in ${usage.backend}${usage.backend === 'memory' ? ' — reset when the server restarts' : ''}.`}>
        <Table head={['Day (UTC)', 'Requests', 'OK', 'Rejected (4xx)', 'Rate-limited', 'Errors (5xx)', 'Tokens', 'Avg latency']}>
          {usage.days.map((day) => (
            <tr key={day.day}>
              <td className="px-2 py-1.5">{day.day}</td>
              <td className="px-2 py-1.5">{formatNumber(day.requests)}</td>
              <td className="px-2 py-1.5">{formatNumber(day.ok)}</td>
              <td className="px-2 py-1.5">{formatNumber(day.rejected)}</td>
              <td className="px-2 py-1.5">{formatNumber(day.limited)}</td>
              <td className="px-2 py-1.5">{day.errors > 0 ? <Badge tone="bad">{day.errors}</Badge> : 0}</td>
              <td className="px-2 py-1.5">{formatNumber(day.tokens)}</td>
              <td className="px-2 py-1.5">{day.avgLatencyMs ? `${(day.avgLatencyMs / 1000).toFixed(1)} s` : '—'}</td>
            </tr>
          ))}
        </Table>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--color-text)]">Endpoints today</p>
            {usage.today.endpoints.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">No AI requests yet today.</p>
            ) : (
              <Table head={['Endpoint', 'Req', 'OK', '429', '5xx', 'Avg', 'Tokens']}>
                {usage.today.endpoints.map((row) => (
                  <tr key={row.endpoint}>
                    <td className="px-2 py-1.5 font-mono">{row.endpoint}</td>
                    <td className="px-2 py-1.5">{row.requests}</td>
                    <td className="px-2 py-1.5">{row.ok}</td>
                    <td className="px-2 py-1.5">{row.limited}</td>
                    <td className="px-2 py-1.5">{row.errors > 0 ? <Badge tone="bad">{row.errors}</Badge> : 0}</td>
                    <td className="px-2 py-1.5">{(row.avgLatencyMs / 1000).toFixed(1)} s</td>
                    <td className="px-2 py-1.5">{formatNumber(row.tokens)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--color-text)]">Models that answered today</p>
            {usage.today.models.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">No model calls yet today.</p>
            ) : (
              <Table head={['Provider', 'Model', 'Calls', 'Tokens']}>
                {usage.today.models.map((row) => (
                  <tr key={`${row.provider}-${row.model}`}>
                    <td className="px-2 py-1.5">{row.provider}</td>
                    <td className="px-2 py-1.5 font-mono">{row.model}</td>
                    <td className="px-2 py-1.5">{row.calls}</td>
                    <td className="px-2 py-1.5">{formatNumber(row.tokens)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      </Panel>

      <ProvidersPanel onChanged={() => void load()} />

      <Panel title="Model routing" subtitle="Order in which models are tried per AI task (the quality store may promote models that perform better).">
        <Table head={['Task', 'Fallback chain']}>
          {models.routing.map((row) => (
            <tr key={row.task}>
              <td className="px-2 py-1.5 font-semibold">{row.task}</td>
              <td className="px-2 py-1.5">
                <div className="flex flex-wrap gap-1">
                  {row.chain.map((entry, index) => {
                    const paused = models.circuitBreaker.some((item) => item.model === entry.model && item.provider === entry.provider);
                    return (
                      <Badge key={entry.alias} tone={paused ? 'bad' : index === 0 ? 'good' : 'neutral'}>
                        {index + 1}. {entry.provider}/{entry.model}
                      </Badge>
                    );
                  })}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <EndpointTester />

      <Panel
        title="RAG index"
        subtitle={`${rag.chunkCount ? `${formatNumber(rag.chunkCount)} chunks · ` : ''}CDN ${rag.cdnConfigured ? 'configured' : 'not configured'} · reranker ${rag.rerank.enabled ? `on (${rag.rerank.model})` : rag.rerank.pausedUntil ? `paused until ${new Date(rag.rerank.pausedUntil).toLocaleTimeString()} — ${rag.rerank.reason}` : 'off'}`}
      >
        <Table head={['File', 'Role', 'Source', 'Local', '.gz']}>
          {rag.files.map((file) => (
            <tr key={file.file}>
              <td className="px-2 py-1.5 font-mono">{file.file}</td>
              <td className="px-2 py-1.5">{file.role}</td>
              <td className="px-2 py-1.5">
                <Badge tone={file.source === 'missing' ? (file.file === 'chunk_vectors.jsonl' ? 'neutral' : 'bad') : file.source === 'cdn' ? 'warn' : 'good'}>{file.source}</Badge>
              </td>
              <td className="px-2 py-1.5">{formatBytes(file.localBytes)}</td>
              <td className="px-2 py-1.5">{formatBytes(file.gzBytes)}</td>
            </tr>
          ))}
        </Table>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={ragChapter}
            onChange={(event) => setRagChapter(event.target.value)}
            aria-label="Chapter id for retrieval test"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 font-mono text-xs"
          />
          <Button onClick={runRagCheck} disabled={ragBusy || !ragChapter.trim()} variant="primary">
            {ragBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Test retrieval (no AI tokens)
          </Button>
          {ragError && <span className="text-xs text-rose-600">{ragError}</span>}
        </div>
        {ragResult && (
          <div className="mt-3 text-xs">
            <p className="text-[var(--color-text)]">
              <strong>{ragResult.chapterTitle}</strong> · {ragResult.snippetCount} snippets · {ragResult.latencyMs} ms · confidence{' '}
              {ragResult.retrieval?.confidence ?? '—'} ({ragResult.retrieval?.confidenceLevel ?? '—'}) · sources {ragResult.retrieval?.sourceMix?.join(', ') ?? '—'}
            </p>
            <ul className="mt-2 space-y-1.5">
              {ragResult.snippets.map((snippet, index) => (
                <li key={`${snippet.sourcePath}-${index}`} className="rounded-lg bg-[var(--color-surface-soft)] p-2">
                  <span className="font-mono text-[var(--color-text-muted)]">
                    [{snippet.sourceType}] {snippet.sourcePath}
                  </span>
                  <p className="mt-0.5 text-[var(--color-text)]">{snippet.preview}…</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Content" subtitle="Static study material shipped with this build.">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Chapters" value={content.chapters} hint={`${content.chaptersWithBuiltInFlashcards} with built-in flashcards`} />
            <Stat label="Papers" value={content.papers.total} hint={`${content.papers.board} board · ${content.papers.sample} sample · ${content.papers.yearsSpanned} years`} />
            <Stat label="Formulas" value={content.formulas} />
            <Stat label="Career" value={content.careerTracks} hint={`${content.careerExams} exams`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {content.chaptersByClassSubject.map((row) => (
              <Badge key={row.group} tone="neutral">
                {row.group}: {row.count}
              </Badge>
            ))}
          </div>
        </Panel>

        <Panel title="Configuration" subtitle="Values are never shown — only whether they are set.">
          <ul className="space-y-1.5 text-xs">
            {config.providers.map((provider) => (
              <li key={provider.provider} className="flex items-center justify-between">
                <span className="font-mono">{provider.envKey}</span>
                {provider.configured ? <Badge tone="good">set</Badge> : <Badge tone="neutral">not set</Badge>}
              </li>
            ))}
            <li className="flex items-center justify-between"><span>Upstash Redis</span>{config.upstash ? <Badge tone="good">set</Badge> : <Badge tone="warn">not set</Badge>}</li>
            <li className="flex items-center justify-between"><span>Sentry</span>{config.sentry ? <Badge tone="good">set</Badge> : <Badge tone="neutral">not set</Badge>}</li>
            <li className="flex items-center justify-between"><span>Analytics</span><Badge tone={config.analytics === 'none' ? 'neutral' : 'good'}>{config.analytics}</Badge></li>
            <li className="flex items-center justify-between"><span>CONTEXT_CDN_URL</span>{config.contextCdn ? <Badge tone="good">set</Badge> : <Badge tone="neutral">not set</Badge>}</li>
            <li className="flex items-center justify-between"><span>AI request timeout</span><span>{config.limits.requestTimeoutMs} ms</span></li>
            <li className="flex items-center justify-between"><span>Self-verify / response cache</span><span>{config.flags.selfVerify ? 'on' : 'off'} / {config.flags.responseCache ? 'on' : 'off'}</span></li>
            <li className="flex items-center justify-between"><span>Custom task routing (AI_TASK_MODEL_MAP)</span><span>{config.flags.customTaskRouting ? 'yes' : 'no'}</span></li>
          </ul>
        </Panel>
      </div>

      {quality && (
        <Panel title="AI answer quality (7 days)" subtitle="From this server's quality log: grounding in retrieved NCERT/PYQ context and repair/rejection rates.">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Generations" value={quality.records} hint={`${quality.failures} failed`} />
            <Stat label="Groundedness" value={`${quality.avgGroundednessScore}`} tone={quality.avgGroundednessScore >= 60 ? 'good' : 'warn'} />
            <Stat label="Citation coverage" value={`${quality.avgCitationCoverageScore}`} />
            <Stat label="Repaired" value={`${quality.repairRatePercent}%`} />
            <Stat label="Rejected" value={`${quality.rejectionRatePercent}%`} tone={quality.rejectionRatePercent > 10 ? 'warn' : 'neutral'} />
          </div>
          {quality.providerStats.length > 0 && (
            <div className="mt-4">
              <Table head={['Task', 'Provider', 'Model', 'Events', 'Successes', 'Failures']}>
                {quality.providerStats.map((row) => (
                  <tr key={`${row.task}-${row.provider}-${row.model}`}>
                    <td className="px-2 py-1.5">{row.task}</td>
                    <td className="px-2 py-1.5">{row.provider}</td>
                    <td className="px-2 py-1.5 font-mono">{row.model}</td>
                    <td className="px-2 py-1.5">{row.events}</td>
                    <td className="px-2 py-1.5">{row.successes}</td>
                    <td className="px-2 py-1.5">{row.failures > 0 ? <Badge tone="warn">{row.failures}</Badge> : 0}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
