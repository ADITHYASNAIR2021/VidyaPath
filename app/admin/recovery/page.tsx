'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, HardDriveDownload, History, RefreshCw, Wrench } from 'lucide-react';
import BackButton from '@/components/BackButton';

interface RecoveryPayload {
  generatedAt: string;
  backupStatus: {
    supabaseServiceConfigured: boolean;
    supabaseStateEnabled: boolean;
    checkpoints: number;
    latestCheckpointAt?: string;
    serviceWorker?: {
      exists: boolean;
      updatedAt?: string | null;
      ageMinutes?: number | null;
    };
    coreEntityCounts?: {
      teachers: number;
      students: number;
      parents: number;
      assignmentPacks: number;
    };
  };
  corrections: Array<{
    id: string;
    createdAt: string;
    updatedAt: string;
    status: 'open' | 'in_progress' | 'resolved';
    title: string;
    description: string;
    owner?: string;
    note?: string;
  }>;
  checkpoints: Array<{
    id: string;
    createdAt: string;
    createdBy?: string;
    note?: string;
  }>;
  auditTimeline: Array<{
    id: string;
    action: string;
    endpoint: string;
    createdAt: string;
    statusCode: number;
  }>;
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

export default function AdminRecoveryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<RecoveryPayload | null>(null);

  const [checkpointNote, setCheckpointNote] = useState('');
  const [correctionTitle, setCorrectionTitle] = useState('');
  const [correctionDescription, setCorrectionDescription] = useState('');
  const [correctionOwner, setCorrectionOwner] = useState('');
  const [submitting, setSubmitting] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, recoveryRes] = await Promise.all([
        fetch('/api/admin/session/me', { cache: 'no-store' }),
        fetch('/api/admin/recovery', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        setError('Session expired. Please sign in again.');
        return;
      }
      const body = unwrap<RecoveryPayload | null>(await recoveryRes.json().catch(() => null));
      if (!recoveryRes.ok || !body) {
        setError('Failed to load recovery dashboard.');
        return;
      }
      setPayload(body);
    } catch {
      setError('Failed to load recovery dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createCheckpoint() {
    setSubmitting('checkpoint');
    setError('');
    try {
      const res = await fetch('/api/admin/recovery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-checkpoint', note: checkpointNote || undefined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(extractApiMessage(body, 'Failed to create checkpoint.'));
        return;
      }
      setCheckpointNote('');
      await load();
    } catch {
      setError('Failed to create checkpoint.');
    } finally {
      setSubmitting('');
    }
  }

  async function createCorrection() {
    if (!correctionTitle.trim() || !correctionDescription.trim()) {
      setError('Correction title and description are required.');
      return;
    }
    setSubmitting('correction');
    setError('');
    try {
      const res = await fetch('/api/admin/recovery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-correction',
          title: correctionTitle,
          description: correctionDescription,
          owner: correctionOwner || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(extractApiMessage(body, 'Failed to create correction.'));
        return;
      }
      setCorrectionTitle('');
      setCorrectionDescription('');
      setCorrectionOwner('');
      await load();
    } catch {
      setError('Failed to create correction.');
    } finally {
      setSubmitting('');
    }
  }

  async function updateCorrectionStatus(correctionId: string, status: 'open' | 'in_progress' | 'resolved') {
    setSubmitting(correctionId);
    setError('');
    try {
      const res = await fetch('/api/admin/recovery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-correction', correctionId, status }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(extractApiMessage(body, 'Failed to update correction.'));
        return;
      }
      await load();
    } catch {
      setError('Failed to update correction.');
    } finally {
      setSubmitting('');
    }
  }

  const unresolvedCorrections = useMemo(
    () => (payload?.corrections || []).filter((item) => item.status !== 'resolved').length,
    [payload?.corrections]
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <BackButton href="/admin" label="Dashboard" />
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700">Recovery and Admin Tools</h1>
          <p className="mt-1 text-sm text-gray-500">Backup status, audit timeline, checkpoints, and data correction workflow.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50"
        >
          <span className="inline-flex items-center gap-1.5"><RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> Refresh</span>
        </button>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Supabase Service</p>
          <p className="mt-1 text-sm font-semibold text-[#1C1C2E]">{payload?.backupStatus.supabaseServiceConfigured ? 'Configured' : 'Missing'}</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">State Persistence</p>
          <p className="mt-1 text-sm font-semibold text-[#1C1C2E]">{payload?.backupStatus.supabaseStateEnabled ? 'Enabled' : 'Fallback mode'}</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Recovery Checkpoints</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1C2E]">{payload?.backupStatus.checkpoints ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Open Corrections</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1C2E]">{unresolvedCorrections}</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Create Recovery Checkpoint</h2>
          <p className="mt-1 text-xs text-gray-500">Capture a reversible milestone before major imports/mutations.</p>
          <textarea
            value={checkpointNote}
            onChange={(event) => setCheckpointNote(event.target.value)}
            rows={3}
            className="mt-3 w-full rounded-lg border border-[#E8E4DC] px-2.5 py-2 text-xs"
            placeholder="Checkpoint note: what changed and why"
          />
          <button
            type="button"
            disabled={submitting === 'checkpoint'}
            onClick={() => void createCheckpoint()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-60"
          >
            <HardDriveDownload className="h-3.5 w-3.5" /> Save checkpoint
          </button>
        </section>

        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Log Data Correction</h2>
          <p className="mt-1 text-xs text-gray-500">Track data fixes with status, owner, and notes.</p>
          <input
            value={correctionTitle}
            onChange={(event) => setCorrectionTitle(event.target.value)}
            className="mt-3 w-full rounded-lg border border-[#E8E4DC] px-2.5 py-2 text-xs"
            placeholder="Correction title"
          />
          <textarea
            value={correctionDescription}
            onChange={(event) => setCorrectionDescription(event.target.value)}
            rows={2}
            className="mt-2 w-full rounded-lg border border-[#E8E4DC] px-2.5 py-2 text-xs"
            placeholder="What needs correction"
          />
          <input
            value={correctionOwner}
            onChange={(event) => setCorrectionOwner(event.target.value)}
            className="mt-2 w-full rounded-lg border border-[#E8E4DC] px-2.5 py-2 text-xs"
            placeholder="Owner (optional)"
          />
          <button
            type="button"
            disabled={submitting === 'correction'}
            onClick={() => void createCorrection()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 disabled:opacity-60"
          >
            <Wrench className="h-3.5 w-3.5" /> Add correction
          </button>
        </section>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Correction Queue</h2>
          <div className="mt-3 space-y-2">
            {payload?.corrections?.map((item) => (
              <div key={item.id} className="rounded-xl border border-[#E8E4DC] bg-[#FCFBF8] px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                    <p className="mt-0.5 text-xs text-gray-700">{item.description}</p>
                    <p className="mt-1 text-[11px] text-gray-500">Owner: {item.owner || 'Unassigned'} | Updated: {new Date(item.updatedAt).toLocaleString()}</p>
                  </div>
                  <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-700">{item.status}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" disabled={submitting === item.id} onClick={() => void updateCorrectionStatus(item.id, 'open')} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">Open</button>
                  <button type="button" disabled={submitting === item.id} onClick={() => void updateCorrectionStatus(item.id, 'in_progress')} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">In progress</button>
                  <button type="button" disabled={submitting === item.id} onClick={() => void updateCorrectionStatus(item.id, 'resolved')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Resolved</button>
                </div>
              </div>
            ))}
            {payload?.corrections?.length === 0 ? <p className="text-xs text-gray-500">No correction items logged.</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Recent Checkpoints</h2>
          <div className="mt-3 space-y-2">
            {payload?.checkpoints?.map((item) => (
              <div key={item.id} className="rounded-xl border border-[#E8E4DC] bg-[#FCFBF8] px-3 py-2">
                <p className="text-xs font-semibold text-gray-900">{new Date(item.createdAt).toLocaleString()}</p>
                <p className="mt-0.5 text-xs text-gray-700">{item.note || 'No note attached.'}</p>
                <p className="mt-1 text-[11px] text-gray-500">By: {item.createdBy || 'system'}</p>
              </div>
            ))}
            {payload?.checkpoints?.length === 0 ? <p className="text-xs text-gray-500">No checkpoints yet.</p> : null}
          </div>
        </section>
      </div>

      <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Audit Timeline</h2>
        <div className="mt-3 space-y-2">
          {payload?.auditTimeline?.map((event) => (
            <div key={event.id} className="rounded-xl border border-[#E8E4DC] bg-[#FCFBF8] px-3 py-2">
              <p className="text-xs font-semibold text-gray-900">{event.action}</p>
              <p className="mt-0.5 text-[11px] text-gray-600">{event.endpoint} | Status {event.statusCode} | {new Date(event.createdAt).toLocaleString()}</p>
            </div>
          ))}
          {payload?.auditTimeline?.length === 0 ? <p className="text-xs text-gray-500">No audit events available for this school.</p> : null}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />Use checkpoints before bulk imports, and keep corrections tracked until resolved for clean incident review.</span>
      </div>

      {!loading ? (
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Recovery panel synced
        </div>
      ) : (
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading recovery signals
        </div>
      )}

      <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
        <History className="h-3.5 w-3.5" /> Last snapshot: {payload?.generatedAt ? new Date(payload.generatedAt).toLocaleString() : '-'}
      </div>
    </div>
  );
}
