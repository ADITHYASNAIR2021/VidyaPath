'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Plus, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

interface ClassSection {
  id: string;
  classLevel: 10 | 12;
  section: string;
  batch?: string;
  classTeacherId?: string;
  classTeacherName?: string;
  status: 'active' | 'inactive' | 'archived';
}

export default function ClassSectionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ classLevel: 12 as 10 | 12, section: '', batch: '' });

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, sectionsRes] = await Promise.all([
        fetch('/api/admin/session/me', { cache: 'no-store' }),
        fetch('/api/admin/class-sections', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { router.replace('/admin/login'); return; }
      const body = await sectionsRes.json().catch(() => null);
      const data = unwrap<{ sections?: ClassSection[] } | null>(body);
      setSections(Array.isArray(data?.sections) ? data.sections : (Array.isArray(unwrap(body)) ? unwrap<ClassSection[]>(body) : []));
    } catch {
      setError('Failed to load class sections.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createSection() {
    if (!form.section.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/class-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classLevel: form.classLevel, section: form.section.trim(), batch: form.batch.trim() || undefined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.message ?? 'Failed to create section.'); return; }
      setForm({ classLevel: 12, section: '', batch: '' });
      setShowCreate(false);
      await load();
    } catch {
      setError('Failed to create class section.');
    } finally {
      setCreating(false);
    }
  }

  const byClass = {
    10: sections.filter((s) => s.classLevel === 10),
    12: sections.filter((s) => s.classLevel === 12),
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <Layers className="w-6 h-6 text-indigo-600" /> Class Sections
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure class sections and batches for your school.</p>
        </div>
        <button onClick={() => setShowCreate((s) => !s)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> New Section
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {showCreate && (
        <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 space-y-4">
          <h2 className="font-semibold text-indigo-800">New Class Section</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Class</label>
              <select value={form.classLevel} onChange={(e) => setForm((p) => ({ ...p, classLevel: Number(e.target.value) as 10 | 12 }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                <option value={10}>Class 10</option>
                <option value={12}>Class 12</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Section</label>
              <input value={form.section} onChange={(e) => setForm((p) => ({ ...p, section: e.target.value }))} placeholder="e.g. A, B, Science" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Batch (optional)</label>
              <input value={form.batch} onChange={(e) => setForm((p) => ({ ...p, batch: e.target.value }))} placeholder="e.g. 2025" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createSection} disabled={!form.section.trim() || creating} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {creating ? 'Creating…' : 'Create Section'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
      )}

      {!loading && sections.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No class sections configured</p>
          <p className="text-sm mt-1">Create sections to enable attendance, gradebooks, and targeted announcements.</p>
        </div>
      )}

      {([10, 12] as const).map((cl) => (
        byClass[cl].length > 0 && (
          <div key={cl} className="mb-6">
            <h2 className="font-semibold text-gray-700 mb-3 text-sm">Class {cl}</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {byClass[cl].map((sec) => (
                <div key={sec.id} className={clsx(
                  'rounded-2xl border p-4 shadow-sm',
                  sec.status === 'active' ? 'border-[#E8E4DC] bg-white' : 'border-gray-200 bg-gray-50 opacity-70'
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                      <span className="font-bold text-indigo-700 text-sm">{sec.section}</span>
                    </div>
                    <span className={clsx(
                      'text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                      sec.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                    )}>{sec.status}</span>
                  </div>
                  <p className="font-semibold text-gray-900 text-sm">Class {sec.classLevel} — {sec.section}</p>
                  {sec.batch && <p className="text-xs text-gray-400 mt-0.5">Batch: {sec.batch}</p>}
                  {sec.classTeacherName && <p className="text-xs text-indigo-600 mt-1">CT: {sec.classTeacherName}</p>}
                </div>
              ))}
            </div>
          </div>
        )
      ))}
    </div>
  );
}
