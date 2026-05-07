'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleDashed, ClipboardList, RefreshCw } from 'lucide-react';
import BackButton from '@/components/BackButton';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  metric: string;
  href: string;
  manualCompleted?: boolean;
  manualNote?: string;
  manualCompletedAt?: string;
}

interface OnboardingPayload {
  generatedAt: string;
  progress: {
    totalSteps: number;
    autoCompleted: number;
    manualCompleted: number;
    completionPercent: number;
  };
  steps: OnboardingStep[];
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function extractApiMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'message' in (payload as Record<string, unknown>)) {
    const maybe = (payload as Record<string, unknown>).message;
    if (typeof maybe === 'string' && maybe.trim()) return maybe.trim();
  }
  return fallback;
}

export default function AdminOnboardingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<OnboardingPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingStepId, setSavingStepId] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, onboardingRes] = await Promise.all([
        fetch('/api/admin/session/me', { cache: 'no-store' }),
        fetch('/api/admin/onboarding', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        setError('Session expired. Please sign in again.');
        return;
      }
      const body = unwrap<OnboardingPayload | null>(await onboardingRes.json().catch(() => null));
      if (!onboardingRes.ok || !body) {
        setError('Failed to load onboarding wizard.');
        return;
      }
      setPayload(body);
      const nextDrafts: Record<string, string> = {};
      for (const step of body.steps) {
        nextDrafts[step.id] = step.manualNote || '';
      }
      setDrafts(nextDrafts);
    } catch {
      setError('Failed to load onboarding wizard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const completed = useMemo(() => payload?.steps.filter((step) => step.done).length ?? 0, [payload]);

  async function updateStep(stepId: string, completedValue: boolean) {
    setSavingStepId(stepId);
    setError('');
    try {
      const res = await fetch('/api/admin/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId, completed: completedValue, note: drafts[stepId] || '' }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(extractApiMessage(body, 'Failed to update onboarding step.'));
        return;
      }
      await load();
    } catch {
      setError('Failed to update onboarding step.');
    } finally {
      setSavingStepId('');
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <BackButton href="/admin" label="Dashboard" />
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700">School Onboarding Wizard</h1>
          <p className="mt-1 text-sm text-gray-500">Track setup completeness for school, admin, teachers, students, and parents.</p>
        </div>
        <button
          onClick={() => void load()}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50"
        >
          <span className="inline-flex items-center gap-1.5"><RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> Refresh</span>
        </button>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Completed Steps</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1C2E]">{completed}</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Steps</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1C2E]">{payload?.progress.totalSteps ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Completion</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1C2E]">{payload?.progress.completionPercent ?? 0}%</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Snapshot</p>
          <p className="mt-1 text-xs font-semibold text-[#1C1C2E]">{payload?.generatedAt ? new Date(payload.generatedAt).toLocaleString() : '-'}</p>
        </div>
      </div>

      <div className="space-y-3">
        {payload?.steps.map((step) => {
          const saving = savingStepId === step.id;
          return (
            <div key={step.id} className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                  <p className="mt-0.5 text-xs text-gray-600">{step.description}</p>
                  <p className="mt-1 text-xs text-indigo-700">{step.metric}</p>
                </div>
                {step.done ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Complete</span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"><CircleDashed className="h-3.5 w-3.5" />Pending</span>
                )}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
                <input
                  value={drafts[step.id] ?? ''}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [step.id]: event.target.value }))}
                  className="rounded-lg border border-[#E8E4DC] bg-white px-2.5 py-2 text-xs"
                  placeholder="Optional implementation note"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void updateStep(step.id, true)}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-60"
                >
                  Mark complete
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void updateStep(step.id, false)}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-700 disabled:opacity-60"
                >
                  Keep open
                </button>
                <Link
                  href={step.href}
                  className="rounded-lg border border-[#E8E4DC] bg-white px-2.5 py-2 text-center text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Open
                </Link>
              </div>

              {step.manualCompletedAt ? <p className="mt-1 text-[11px] text-gray-500">Manual update: {new Date(step.manualCompletedAt).toLocaleString()}</p> : null}
            </div>
          );
        })}
      </div>

      {!payload?.steps?.length && !loading ? (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
          <ClipboardList className="mx-auto mb-2 h-5 w-5 text-gray-400" />
          No onboarding steps available.
        </div>
      ) : null}
    </div>
  );
}
