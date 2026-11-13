'use client';

import { useState } from 'react';
import { Loader2, RefreshCw, Zap } from 'lucide-react';
import { Badge, Button, Panel, Table, devFetch } from '@/components/developer/ui';

interface ProviderEntry {
  provider: string;
  envKey: string;
  configured: boolean;
  reachable: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
  modelCount: number;
  chatModels: string[];
}

interface RegisteredEntry {
  alias: string;
  provider: string;
  model: string;
  listedByProvider: boolean | null;
}

interface Catalog {
  generatedAt: string;
  providers: ProviderEntry[];
  registered: RegisteredEntry[];
  circuitBreaker: Array<{ provider: string; model: string; status: number; reason: string; until: string }>;
}

interface PingResult {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  reply: string | null;
  error: string | null;
}

export default function ProvidersPanel({ onChanged }: { onChanged: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pings, setPings] = useState<Record<string, PingResult | 'running'>>({});
  const [customProvider, setCustomProvider] = useState('gemini');
  const [customModel, setCustomModel] = useState('');

  async function loadCatalog() {
    setLoading(true);
    setError('');
    const result = await devFetch<Catalog>('/api/developer/providers');
    if (result.ok && result.data) setCatalog(result.data);
    else setError(result.message || `Failed (${result.status})`);
    setLoading(false);
  }

  async function ping(key: string, body: Record<string, string>) {
    setPings((prev) => ({ ...prev, [key]: 'running' }));
    const result = await devFetch<PingResult>('/api/developer/providers', { method: 'POST', body: JSON.stringify(body) });
    setPings((prev) => ({
      ...prev,
      [key]: result.data ?? { ok: false, status: result.status, latencyMs: null, reply: null, error: result.message ?? 'Failed' },
    }));
  }

  async function pingAll() {
    if (!catalog) return;
    for (const entry of catalog.registered) {
      await ping(entry.alias, { action: 'ping', alias: entry.alias });
    }
  }

  async function resetBreaker() {
    await devFetch('/api/developer/providers', { method: 'POST', body: JSON.stringify({ action: 'reset-breaker' }) });
    await loadCatalog();
    onChanged();
  }

  return (
    <Panel
      title="AI providers & models"
      subtitle="Live check against each provider's model list. Providers retire models often — if a registered model is not listed or fails a ping, update lib/ai/model-routing.ts."
      actions={
        <>
          <Button onClick={loadCatalog} disabled={loading} variant="primary">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Check providers
          </Button>
          {catalog && (
            <Button onClick={pingAll}>
              <Zap className="h-3.5 w-3.5" /> Ping all models
            </Button>
          )}
          <Button onClick={resetBreaker} variant="danger">Reset circuit breaker</Button>
        </>
      }
    >
      {error && <p className="mb-3 text-xs font-semibold text-rose-600">{error}</p>}
      {!catalog && !loading && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Click “Check providers” to list models each key can use (makes 5 cheap list requests, no tokens).
        </p>
      )}
      {catalog && (
        <div className="space-y-5">
          <Table head={['Provider', 'Key', 'Reachable', 'Models', 'Latency', 'Error']}>
            {catalog.providers.map((entry) => (
              <tr key={entry.provider}>
                <td className="px-2 py-2 font-semibold">{entry.provider}</td>
                <td className="px-2 py-2">{entry.configured ? <Badge tone="good">set</Badge> : <Badge tone="warn">{entry.envKey} missing</Badge>}</td>
                <td className="px-2 py-2">{entry.reachable ? <Badge tone="good">yes</Badge> : <Badge tone={entry.configured ? 'bad' : 'neutral'}>no</Badge>}</td>
                <td className="px-2 py-2">{entry.modelCount}</td>
                <td className="px-2 py-2">{entry.latencyMs !== null ? `${entry.latencyMs} ms` : '—'}</td>
                <td className="px-2 py-2 text-rose-600">{entry.error ?? ''}</td>
              </tr>
            ))}
          </Table>

          <Table head={['Alias', 'Provider', 'Model', 'Listed', 'Ping', '']}>
            {catalog.registered.map((entry) => {
              const result = pings[entry.alias];
              return (
                <tr key={entry.alias}>
                  <td className="px-2 py-2 font-mono">{entry.alias}</td>
                  <td className="px-2 py-2">{entry.provider}</td>
                  <td className="px-2 py-2 font-mono">{entry.model}</td>
                  <td className="px-2 py-2">
                    {entry.listedByProvider === null ? <Badge tone="neutral">unknown</Badge> : entry.listedByProvider ? <Badge tone="good">listed</Badge> : <Badge tone="bad">not listed</Badge>}
                  </td>
                  <td className="px-2 py-2">
                    {result === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : result ? (
                      result.ok ? (
                        <Badge tone="good">OK · {result.latencyMs} ms</Badge>
                      ) : (
                        <span className="text-rose-600">{result.error}</span>
                      )
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <Button onClick={() => ping(entry.alias, { action: 'ping', alias: entry.alias })} disabled={result === 'running'}>
                      Ping
                    </Button>
                  </td>
                </tr>
              );
            })}
          </Table>

          <div className="rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-xs font-semibold text-[var(--color-text)]">Try any model id</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={customProvider}
                onChange={(event) => setCustomProvider(event.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-xs"
                aria-label="Provider"
              >
                {catalog.providers.map((entry) => (
                  <option key={entry.provider} value={entry.provider}>
                    {entry.provider}
                  </option>
                ))}
              </select>
              <input
                list="dev-model-options"
                value={customModel}
                onChange={(event) => setCustomModel(event.target.value)}
                placeholder="model id"
                aria-label="Model id"
                className="min-w-[240px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 font-mono text-xs"
              />
              <datalist id="dev-model-options">
                {(catalog.providers.find((entry) => entry.provider === customProvider)?.chatModels ?? []).map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <Button
                disabled={!customModel.trim() || pings.custom === 'running'}
                onClick={() => ping('custom', { action: 'ping-model', provider: customProvider, model: customModel.trim() })}
              >
                Ping
              </Button>
              {pings.custom && pings.custom !== 'running' && (
                <span className={pings.custom.ok ? 'text-xs text-emerald-600' : 'text-xs text-rose-600'}>
                  {pings.custom.ok ? `OK · ${pings.custom.latencyMs} ms · ${pings.custom.reply}` : pings.custom.error}
                </span>
              )}
            </div>
          </div>

          {catalog.circuitBreaker.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--color-text)]">Models paused by the circuit breaker</p>
              <Table head={['Provider', 'Model', 'HTTP', 'Paused until', 'Reason']}>
                {catalog.circuitBreaker.map((entry) => (
                  <tr key={`${entry.provider}-${entry.model}`}>
                    <td className="px-2 py-2">{entry.provider}</td>
                    <td className="px-2 py-2 font-mono">{entry.model}</td>
                    <td className="px-2 py-2">{entry.status || '—'}</td>
                    <td className="px-2 py-2">{new Date(entry.until).toLocaleTimeString()}</td>
                    <td className="px-2 py-2 text-[var(--color-text-muted)]">{entry.reason.slice(0, 120)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
