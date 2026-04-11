'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StudentProfile } from '@/lib/teacher-types';
import { GraduationCap, Plus, RefreshCw, Search, KeyRound } from 'lucide-react';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

export default function AdminStudentsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newStudent, setNewStudent] = useState({
    name: '', rollCode: '', rollNo: '', batch: '',
    classLevel: 12 as 10 | 12, section: '', pin: '',
  });

  // PIN reset state
  const [resetPinFor, setResetPinFor] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSuccess, setPinSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, studentsRes] = await Promise.all([
        fetch('/api/admin/session/me', { cache: 'no-store' }),
        fetch('/api/admin/students', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { router.replace('/admin/login'); return; }
      const body = await studentsRes.json().catch(() => null);
      const data = unwrap<{ students?: StudentProfile[] } | null>(body);
      setStudents(data?.students ?? (Array.isArray(unwrap(body)) ? unwrap<StudentProfile[]>(body) : []));
    } catch {
      setError('Failed to load students.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function addStudent() {
    if (!newStudent.name.trim() || !newStudent.rollCode.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStudent),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.message ?? 'Failed to add student.'); return; }
      setShowCreate(false);
      setNewStudent({ name: '', rollCode: '', rollNo: '', batch: '', classLevel: 12, section: '', pin: '' });
      await load();
    } catch {
      setError('Failed to add student.');
    } finally {
      setCreating(false);
    }
  }

  async function savePin(studentId: string) {
    if (!newPin.trim() || !/^\d{4,8}$/.test(newPin)) { setError('PIN must be 4–8 digits.'); return; }
    setPinSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/students/${studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.message ?? 'Failed to reset PIN.'); return; }
      setPinSuccess('PIN updated successfully.');
      setResetPinFor(null);
      setNewPin('');
      setTimeout(() => setPinSuccess(''), 3000);
    } finally {
      setPinSaving(false);
    }
  }

  function openPinReset(studentId: string) {
    setResetPinFor(studentId);
    setNewPin('');
    setError('');
  }

  function cancelPinReset() {
    setResetPinFor(null);
    setNewPin('');
    setError('');
  }

  const filtered = students.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.rollCode?.toLowerCase().includes(q) || s.batch?.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-indigo-600" /> Students
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage student accounts and enrollments. Use Roster Import for bulk uploads.</p>
        </div>
        <button onClick={() => setShowCreate((s) => !s)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> Add Student
        </button>
      </div>

      {pinSuccess && (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <span className="font-medium">{pinSuccess}</span>
        </div>
      )}

      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {showCreate && (
        <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 space-y-4">
          <h2 className="font-semibold text-indigo-800">New Student</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Full Name</label>
              <input value={newStudent.name} onChange={(e) => setNewStudent((p) => ({ ...p, name: e.target.value }))} placeholder="Student name" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Roll Code (Login ID)</label>
              <input value={newStudent.rollCode} onChange={(e) => setNewStudent((p) => ({ ...p, rollCode: e.target.value }))} placeholder="e.g. STU2025001" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Roll Number</label>
              <input value={newStudent.rollNo} onChange={(e) => setNewStudent((p) => ({ ...p, rollNo: e.target.value }))} placeholder="Class roll no." className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">PIN</label>
              <input type="password" value={newStudent.pin} onChange={(e) => setNewStudent((p) => ({ ...p, pin: e.target.value }))} placeholder="4–8 digit PIN" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Class</label>
              <select value={newStudent.classLevel} onChange={(e) => setNewStudent((p) => ({ ...p, classLevel: Number(e.target.value) as 10 | 12 }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                <option value={10}>Class 10</option>
                <option value={12}>Class 12</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Section</label>
              <input value={newStudent.section} onChange={(e) => setNewStudent((p) => ({ ...p, section: e.target.value }))} placeholder="e.g. A" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Batch (optional)</label>
              <input value={newStudent.batch} onChange={(e) => setNewStudent((p) => ({ ...p, batch: e.target.value }))} placeholder="e.g. Batch 2025" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addStudent} disabled={!newStudent.name.trim() || !newStudent.rollCode.trim() || creating} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {creating ? 'Adding…' : 'Add Student'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, roll code, or batch…"
          className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-2 text-sm"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
      )}

      {!loading && students.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No students yet</p>
          <p className="text-sm mt-1">Add individually or use Roster Import for bulk upload.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E4DC] bg-gray-50">
            <span className="text-xs font-semibold text-gray-500">
              {filtered.length} student{filtered.length !== 1 ? 's' : ''} {search ? '(filtered)' : ''}
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E8E4DC]">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 hidden sm:table-cell">Roll Code</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 hidden md:table-cell">Class</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 hidden lg:table-cell">Batch</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Status</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <>
                  <tr key={s.id} className="border-b border-[#E8E4DC] last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">{(s.name ?? 'S')[0]}</div>
                        <span className="text-sm font-medium text-gray-800">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{s.rollCode}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">Class {s.classLevel}{s.section ? ` §${s.section}` : ''}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">{s.batch ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Active</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => resetPinFor === s.id ? cancelPinReset() : openPinReset(s.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                      >
                        <KeyRound className="w-3 h-3" />
                        {resetPinFor === s.id ? 'Cancel' : 'Reset PIN'}
                      </button>
                    </td>
                  </tr>
                  {resetPinFor === s.id && (
                    <tr key={`${s.id}-pin`} className="border-b border-[#E8E4DC] bg-amber-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <KeyRound className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <span className="text-sm font-medium text-amber-800">Reset PIN for <span className="font-semibold">{s.name}</span></span>
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                            <input
                              type="password"
                              value={newPin}
                              onChange={(e) => setNewPin(e.target.value)}
                              placeholder="New 4–8 digit PIN"
                              maxLength={8}
                              className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                              onKeyDown={(e) => { if (e.key === 'Enter') void savePin(s.id); }}
                            />
                            <button
                              onClick={() => void savePin(s.id)}
                              disabled={pinSaving || !newPin.trim()}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                              {pinSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              onClick={cancelPinReset}
                              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
