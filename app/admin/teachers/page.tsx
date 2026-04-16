'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TeacherProfile, TeacherScope } from '@/lib/teacher-types';
import { Users, Plus, RefreshCw, KeyRound, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

type Subject = TeacherScope['subject'];

const CLASS10_SUBJECTS: Subject[] = ['Physics', 'Chemistry', 'Biology', 'Math', 'English Core'];
const CLASS12_SUBJECTS: Subject[] = ['Physics', 'Chemistry', 'Biology', 'Math', 'Accountancy', 'Business Studies', 'Economics', 'English Core'];

export default function AdminTeachersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pinReset, setPinReset] = useState<Record<string, string>>({});
  const [scopeDrafts, setScopeDrafts] = useState<Record<string, { classLevel: 10 | 12; subject: Subject; section: string }>>({});

  const [showCreate, setShowCreate] = useState(false);
  const [newTeacher, setNewTeacher] = useState({ phone: '', name: '', pin: '', classLevel: 12 as 10 | 12, subject: 'Physics' as Subject, section: '' });
  const [pendingScopes, setPendingScopes] = useState<Array<{ classLevel: 10 | 12; subject: Subject; section?: string }>>([]);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, teachersRes] = await Promise.all([
        fetch('/api/admin/session/me', { cache: 'no-store' }),
        fetch('/api/admin/teachers', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { router.replace('/admin/login'); return; }
      const body = await teachersRes.json().catch(() => null);
      const data = unwrap<{ teachers?: TeacherProfile[] } | null>(body);
      setTeachers(data?.teachers ?? (Array.isArray(unwrap(body)) ? unwrap<TeacherProfile[]>(body) : []));
    } catch {
      setError('Failed to load teachers.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function addTeacher() {
    if (!newTeacher.phone.trim() || !newTeacher.pin.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newTeacher, scopes: pendingScopes }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.message ?? 'Failed to add teacher.'); return; }
      setShowCreate(false);
      setNewTeacher({ phone: '', name: '', pin: '', classLevel: 12, subject: 'Physics', section: '' });
      setPendingScopes([]);
      await load();
    } catch {
      setError('Failed to add teacher.');
    } finally {
      setCreating(false);
    }
  }

  async function resetPin(teacherId: string) {
    const newPin = pinReset[teacherId]?.trim();
    if (!newPin) return;
    const res = await fetch(`/api/admin/teachers/${teacherId}/reset-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPin }),
    });
    if (res.ok) { setPinReset((p) => ({ ...p, [teacherId]: '' })); await load(); }
    else setError('Failed to reset PIN.');
  }

  async function addScope(teacherId: string) {
    const draft = scopeDrafts[teacherId];
    if (!draft) return;
    const res = await fetch(`/api/admin/teachers/${teacherId}/scopes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classLevel: draft.classLevel, subject: draft.subject, section: draft.section || undefined }),
    });
    if (res.ok) { await load(); }
    else setError('Failed to add scope.');
  }

  async function removeScope(teacherId: string, scopeId: string) {
    const res = await fetch(`/api/admin/teachers/${teacherId}/scopes/${scopeId}`, { method: 'DELETE' });
    if (res.ok) await load();
    else setError('Failed to remove scope.');
  }

  const subjectOptions = newTeacher.classLevel === 10 ? CLASS10_SUBJECTS : CLASS12_SUBJECTS;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <BackButton href="/admin" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" /> Teachers
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage teacher accounts and their teaching scopes.</p>
        </div>
        <button onClick={() => setShowCreate((s) => !s)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> Add Teacher
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {showCreate && (
        <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 space-y-4">
          <h2 className="font-semibold text-indigo-800">New Teacher</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
              <input value={newTeacher.name} onChange={(e) => setNewTeacher((p) => ({ ...p, name: e.target.value }))} placeholder="Full name" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Phone (Login ID)</label>
              <input value={newTeacher.phone} onChange={(e) => setNewTeacher((p) => ({ ...p, phone: e.target.value }))} placeholder="10-digit phone" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">PIN</label>
              <input type="password" value={newTeacher.pin} onChange={(e) => setNewTeacher((p) => ({ ...p, pin: e.target.value }))} placeholder="4–8 digit PIN" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Initial Teaching Scope (optional)</p>
            <div className="flex gap-2 flex-wrap">
              <select value={newTeacher.classLevel} onChange={(e) => setNewTeacher((p) => ({ ...p, classLevel: Number(e.target.value) as 10 | 12 }))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                <option value={10}>Class 10</option>
                <option value={12}>Class 12</option>
              </select>
              <select value={newTeacher.subject} onChange={(e) => setNewTeacher((p) => ({ ...p, subject: e.target.value as Subject }))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                {subjectOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input value={newTeacher.section} onChange={(e) => setNewTeacher((p) => ({ ...p, section: e.target.value }))} placeholder="Section (opt)" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm w-32" />
              <button
                type="button"
                onClick={() => { setPendingScopes((p) => [...p, { classLevel: newTeacher.classLevel, subject: newTeacher.subject, section: newTeacher.section || undefined }]); }}
                className="px-3 py-2 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-medium hover:bg-indigo-200"
              >+ Add Scope</button>
            </div>
            {pendingScopes.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {pendingScopes.map((s, i) => (
                  <span key={i} className="flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                    Class {s.classLevel} {s.subject}{s.section ? ` §${s.section}` : ''}
                    <button type="button" onClick={() => setPendingScopes((p) => p.filter((_, j) => j !== i))} className="ml-1 hover:text-rose-600">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={addTeacher} disabled={!newTeacher.phone.trim() || !newTeacher.pin.trim() || creating} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {creating ? 'Adding…' : 'Add Teacher'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {loading && teachers.length === 0 && (
        <div className="flex items-center justify-center h-40 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
      )}

      {!loading && teachers.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No teachers yet</p>
        </div>
      )}

      <div className="space-y-3">
        {teachers.map((teacher) => {
          const isExpanded = expandedId === teacher.id;
          const draft = scopeDrafts[teacher.id] ?? { classLevel: 12 as 10 | 12, subject: 'Physics' as Subject, section: '' };
          const draftSubjects = draft.classLevel === 10 ? CLASS10_SUBJECTS : CLASS12_SUBJECTS;
          return (
            <div key={teacher.id} className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedId(isExpanded ? null : teacher.id)}>
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                  {(teacher.name ?? 'T')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{teacher.name || 'Unnamed'}</p>
                  <p className="text-xs text-gray-400">{teacher.phone ?? teacher.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full border', teacher.status !== 'inactive' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200')}>
                    {teacher.status !== 'inactive' ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-xs text-gray-400">{(teacher.scopes ?? []).length} scope{(teacher.scopes ?? []).length !== 1 ? 's' : ''}</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-[#E8E4DC] px-5 py-4 bg-gray-50 space-y-4">
                  {/* Scopes */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">Teaching Scopes</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(teacher.scopes ?? []).map((scope) => (
                        <span key={scope.id} className="flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-700 px-2.5 py-1 rounded-full">
                          Class {scope.classLevel} {scope.subject}{scope.section ? ` §${scope.section}` : ''}
                          <button onClick={() => removeScope(teacher.id, scope.id)} className="ml-1 text-gray-400 hover:text-rose-600 transition-colors"><Trash2 className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <select
                        value={draft.classLevel}
                        onChange={(e) => setScopeDrafts((p) => ({ ...p, [teacher.id]: { ...draft, classLevel: Number(e.target.value) as 10 | 12 } }))}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs"
                      >
                        <option value={10}>Class 10</option>
                        <option value={12}>Class 12</option>
                      </select>
                      <select
                        value={draft.subject}
                        onChange={(e) => setScopeDrafts((p) => ({ ...p, [teacher.id]: { ...draft, subject: e.target.value as Subject } }))}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs"
                      >
                        {draftSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input
                        placeholder="Section"
                        value={draft.section}
                        onChange={(e) => setScopeDrafts((p) => ({ ...p, [teacher.id]: { ...draft, section: e.target.value } }))}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs w-24"
                      />
                      <button onClick={() => addScope(teacher.id)} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700">Add Scope</button>
                    </div>
                  </div>

                  {/* PIN reset */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">Reset PIN</p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="New PIN"
                        value={pinReset[teacher.id] ?? ''}
                        onChange={(e) => setPinReset((p) => ({ ...p, [teacher.id]: e.target.value }))}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs w-36"
                      />
                      <button onClick={() => resetPin(teacher.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-600 text-white text-xs font-semibold hover:bg-gray-700">
                        <KeyRound className="w-3 h-3" /> Reset
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
