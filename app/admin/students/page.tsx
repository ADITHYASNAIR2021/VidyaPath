'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StudentProfile } from '@/lib/teacher-types';
import { GraduationCap, KeyRound, Plus, RefreshCw, Search } from 'lucide-react';
import BackButton from '@/components/BackButton';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
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
  const [issued, setIssued] = useState<{ loginIdentifier: string; password: string } | null>(null);
  const [newStudent, setNewStudent] = useState({
    name: '',
    rollNo: '',
    batch: '',
    classLevel: 12 as 10 | 12,
    stream: 'pcm' as 'foundation' | 'pcm' | 'pcb' | 'commerce' | 'interdisciplinary',
    section: '',
    pin: '',
  });

  const [resetPinFor, setResetPinFor] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, studentsRes] = await Promise.all([
        fetch('/api/admin/session/me', { cache: 'no-store' }),
        fetch('/api/admin/students', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        router.replace('/admin/login');
        return;
      }
      const body = await studentsRes.json().catch(() => null);
      const data = unwrap<{ students?: StudentProfile[] } | null>(body);
      setStudents(data?.students ?? (Array.isArray(unwrap(body)) ? unwrap<StudentProfile[]>(body) : []));
    } catch {
      setError('Failed to load students.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addStudent() {
    if (!newStudent.name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const response = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStudent),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message ?? 'Failed to add student.');
        return;
      }
      const data = unwrap<Record<string, unknown>>(body);
      const credentials = data?.issuedCredentials as Record<string, unknown> | undefined;
      setIssued({
        loginIdentifier: String(credentials?.loginIdentifier || ''),
        password: String(credentials?.password || ''),
      });
      setShowCreate(false);
      setNewStudent({
        name: '',
        rollNo: '',
        batch: '',
        classLevel: 12,
        stream: 'pcm',
        section: '',
        pin: '',
      });
      await load();
    } catch {
      setError('Failed to add student.');
    } finally {
      setCreating(false);
    }
  }

  async function savePin(studentId: string) {
    if (!newPin.trim() || !/^\d{4,8}$/.test(newPin)) {
      setError('PIN must be 4-8 digits.');
      return;
    }
    setPinSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/students/${studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message ?? 'Failed to reset PIN.');
        return;
      }
      setResetPinFor(null);
      setNewPin('');
    } finally {
      setPinSaving(false);
    }
  }

  const filtered = students.filter((student) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      student.name?.toLowerCase().includes(query) ||
      student.rollCode?.toLowerCase().includes(query) ||
      student.batch?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <BackButton href="/admin" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-indigo-600" /> Students
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Student IDs and initial passwords are auto-generated.</p>
        </div>
        <button onClick={() => setShowCreate((value) => !value)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> Add Student
        </button>
      </div>

      {issued && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">Credentials Issued</p>
          <p>Student ID: {issued.loginIdentifier}</p>
          <p>Password: {issued.password}</p>
        </div>
      )}
      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {showCreate && (
        <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 space-y-4">
          <h2 className="font-semibold text-indigo-800">New Student</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <input value={newStudent.name} onChange={(e) => setNewStudent((p) => ({ ...p, name: e.target.value }))} placeholder="Full name" className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            <input value="" disabled placeholder="Login ID auto-generated" className="rounded-xl border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500" />
            <input value={newStudent.rollNo} onChange={(e) => setNewStudent((p) => ({ ...p, rollNo: e.target.value }))} placeholder="Roll number (optional)" className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            <input type="password" value={newStudent.pin} onChange={(e) => setNewStudent((p) => ({ ...p, pin: e.target.value }))} placeholder="PIN (optional)" className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            <select
              value={newStudent.classLevel}
              onChange={(e) => {
                const classLevel = Number(e.target.value) as 10 | 12;
                setNewStudent((p) => ({
                  ...p,
                  classLevel,
                  stream: classLevel === 10 ? 'foundation' : (p.stream === 'foundation' ? 'pcm' : p.stream),
                }));
              }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value={10}>Class 10</option>
              <option value={12}>Class 12</option>
            </select>
            {newStudent.classLevel === 12 ? (
              <select
                value={newStudent.stream}
                onChange={(e) =>
                  setNewStudent((p) => ({
                    ...p,
                    stream: e.target.value as 'pcm' | 'pcb' | 'commerce' | 'interdisciplinary',
                  }))
                }
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="pcm">Stream: PCM</option>
                <option value="pcb">Stream: PCB</option>
                <option value="commerce">Stream: Commerce</option>
                <option value="interdisciplinary">Stream: Interdisciplinary</option>
              </select>
            ) : (
              <input
                value="Foundation"
                disabled
                className="rounded-xl border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500"
              />
            )}
            <input value={newStudent.section} onChange={(e) => setNewStudent((p) => ({ ...p, section: e.target.value }))} placeholder="Section (e.g. A)" className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            <input value={newStudent.batch} onChange={(e) => setNewStudent((p) => ({ ...p, batch: e.target.value }))} placeholder="Batch (optional)" className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={addStudent} disabled={!newStudent.name.trim() || creating} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {creating ? 'Adding...' : 'Add Student'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, roll code, batch..." className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-2 text-sm" />
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No students found</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E8E4DC]">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 hidden sm:table-cell">Student ID</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 hidden md:table-cell">Class</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 hidden lg:table-cell">Batch</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student) => (
                <tr key={student.id} className="border-b border-[#E8E4DC] last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{student.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{student.rollCode}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">Class {student.classLevel}{student.section ? ` ${student.section}` : ''}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">{student.batch || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    {resetPinFor === student.id ? (
                      <div className="inline-flex items-center gap-2">
                        <input
                          type="password"
                          value={newPin}
                          onChange={(e) => setNewPin(e.target.value)}
                          placeholder="New PIN"
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs w-24"
                        />
                        <button onClick={() => void savePin(student.id)} disabled={pinSaving} className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700">
                          Save
                        </button>
                        <button onClick={() => { setResetPinFor(null); setNewPin(''); }} className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setResetPinFor(student.id)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">
                        <KeyRound className="w-3 h-3" /> Reset PIN
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
