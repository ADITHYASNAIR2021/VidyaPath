import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Panel({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-fraunces text-lg font-bold text-[var(--color-text)]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = 'neutral' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  return (
    <div
      className={clsx(
        'rounded-xl border p-3',
        tone === 'good' && 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30',
        tone === 'warn' && 'border-amber-200 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30',
        tone === 'bad' && 'border-rose-200 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/30',
        tone === 'neutral' && 'border-[var(--color-border)] bg-[var(--color-surface-soft)]'
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 text-xl font-bold text-[var(--color-text)]">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">{hint}</div>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'neutral'; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tone === 'good' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
        tone === 'warn' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
        tone === 'bad' && 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
        tone === 'neutral' && 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'secondary',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-saffron-500 text-white hover:bg-saffron-600',
        variant === 'secondary' && 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-soft)]',
        variant === 'danger' && 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200'
      )}
    >
      {children}
    </button>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
            {head.map((cell) => (
              <th key={cell} className="px-2 py-2 font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">{children}</tbody>
      </table>
    </div>
  );
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-IN');
}

export function formatBytes(value: number | null): string {
  if (value === null) return '—';
  if (value > 1048576) return `${(value / 1048576).toFixed(1)} MB`;
  if (value > 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${seconds % 60}s`;
}

export async function devFetch<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; message?: string }> {
  try {
    const response = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const payload = (await response.json().catch(() => null)) as { data?: T; message?: string } | null;
    return { ok: response.ok, status: response.status, data: (payload?.data ?? null) as T | null, message: payload?.message };
  } catch (error) {
    return { ok: false, status: 0, data: null, message: error instanceof Error ? error.message : 'Network error' };
  }
}
