'use client';

import { useEffect, useMemo, useState } from 'react';
import { Shield, UserPlus, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { StudentProfile, TeacherProfile, TeacherScope } from '@/lib/teacher-types';

interface AdminOverviewResponse {
  totalTeachers: number;
  activeTeachers: number;
  scopesByClass: Array<{ classLevel: 10 | 12; count: number }>;
  scopesBySubject: Array<{ subject: string; count: number }>;
  scopesBySection: Array<{ section: string; count: number }>;
  topWeakTopics: Array<{ topic: string; count: number }>;
  topChapters: Array<{ chapterId: string; count: number }>;
  assignmentCompletionsThisWeek: number;
  storageStatus?: { mode: 'connected' | 'degraded'; message: string };
  highRiskExamSessions?: number;
}

const CLASS10_SUBJECT_OPTIONS: Array<TeacherScope['subject']> = ['Physics', 'Chemistry', 'Biology', 'Math', 'English Core'];
const CLASS12_SUBJECT_OPTIONS: Array<TeacherScope['subject']> = [
  'Physics',
  'Chemistry',
  'Biology',
  'Math',
  'Accountancy',
  'Business Studies',
  'Economics',
  'English Core',
];

function getSubjectsForClass(classLevel: 10 | 12): Array<TeacherScope['subject']> {
  return classLevel === 10 ? CLASS10_SUBJECT_OPTIONS : CLASS12_SUBJECT_OPTIONS;
}

export default function AdminPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newTeacher, setNewTeacher] = useState({
    phone: '',
    name: '',
    pin: '',
    classLevel: 12 as 10 | 12,
    subject: 'Physics' as TeacherScope['subject'],
    section: '',
  });
  const [pendingScopes, setPendingScopes] = useState<
    Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }>
  >([]);
  const [pinReset, setPinReset] = useState<Record<string, string>>({});
  const [scopeDrafts, setScopeDrafts] = useState<
    Record<string, { classLevel: 10 | 12; subject: TeacherScope['subject']; section: string }>
  >({});
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [newStudent, setNewStudent] = useState({
    name: '',
    rollCode: '',
    classLevel: 12 as 10 | 12,
    section: '',
    pin: '',
  });

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [teachersRes, overviewRes, studentsRes] = await Promise.all([
        fetch('/api/admin/teachers', { cache: 'no-store' }),
        fetch('/api/admin/overview', { cache: 'no-store' }),
        fetch('/api/admin/students', { cache: 'no-store' }),
      ]);
      const teachersJson = await teachersRes.json().catch(() => null);
      const overviewJson = await overviewRes.json().catch(() => null);
      const studentsJson = await studentsRes.json().catch(() => null);
      if (teachersRes.status === 401 || overviewRes.status === 401 || studentsRes.status === 401) {
        router.replace('/admin/login');
        return;
      }
      if (!teachersRes.ok || !teachersJson) {
        setError(teachersJson?.error || 'Failed to load teachers.');
        return;
      }
      if (!overviewRes.ok || !overviewJson) {
        setError(overviewJson?.error || 'Failed to load overview.');
        return;
      }
      if (!studentsRes.ok || !studentsJson) {
        setError(studentsJson?.error || 'Failed to load students.');
        return;
      }
      setTeachers(Array.isArray(teachersJson.teachers) ? teachersJson.teachers : []);
      setOverview(overviewJson as AdminOverviewResponse);
      setStudents(Array.isArray(studentsJson.students) ? studentsJson.students : []);
    } catch {
      setError('Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      await load();
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTeacher() {
    setLoading(true);
    setError('');
    try {
      const baseScope = {
        classLevel: newTeacher.classLevel,
        subject: newTeacher.subject,
        section: newTeacher.section.trim() || undefined,
      };
      const dedupe = new Set<string>();
      const scopes = [...pendingScopes, baseScope].filter((scope) => {
        const key = `${scope.classLevel}|${scope.subject}|${scope.section || ''}`;
        if (dedupe.has(key)) return false;
        dedupe.add(key);
        return true;
      });
      const response = await fetch('/api/admin/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: newTeacher.phone,
          name: newTeacher.name,
          pin: newTeacher.pin,
          scopes,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Failed to create teacher.');
        return;
      }
      setNewTeacher({ phone: '', name: '', pin: '', classLevel: 12, subject: 'Physics', section: '' });
      setPendingScopes([]);
      await load();
    } catch {
      setError('Failed to create teacher.');
    } finally {
      setLoading(false);
    }
  }

  async function createStudent() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStudent.name,
          rollCode: newStudent.rollCode,
          classLevel: newStudent.classLevel,
          section: newStudent.section || undefined,
          pin: newStudent.pin || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Failed to create student.');
        return;
      }
      setNewStudent({ name: '', rollCode: '', classLevel: 12, section: '', pin: '' });
      await load();
    } catch {
      setError('Failed to create student.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleStudentStatus(student: StudentProfile) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/students/${student.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: student.status === 'active' ? 'inactive' : 'active' }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Failed to update student.');
        return;
      }
      await load();
    } catch {
      setError('Failed to update student.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleTeacherStatus(teacher: TeacherProfile) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/teachers/${teacher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: teacher.status === 'active' ? 'inactive' : 'active' }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Failed to update teacher.');
        return;
      }
      await load();
    } catch {
      setError('Failed to update teacher.');
    } finally {
      setLoading(false);
    }
  }

  async function resetPin(teacherId: string) {
    const pin = pinReset[teacherId]?.trim();
    if (!pin) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/teachers/${teacherId}/reset-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Failed to reset PIN.');
        return;
      }
      setPinReset((prev) => ({ ...prev, [teacherId]: '' }));
    } catch {
      setError('Failed to reset PIN.');
    } finally {
      setLoading(false);
    }
  }

  function getScopeDraft(teacherId: string): { classLevel: 10 | 12; subject: TeacherScope['subject']; section: string } {
    return (
      scopeDrafts[teacherId] ?? {
        classLevel: 12,
        subject: 'Physics',
        section: '',
      }
    );
  }

  async function addScope(teacherId: string) {
    const draft = getScopeDraft(teacherId);
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/teachers/${teacherId}/scopes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classLevel: draft.classLevel,
          subject: draft.subject,
          section: draft.section.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Failed to add scope.');
        return;
      }
      await load();
    } catch {
      setError('Failed to add scope.');
    } finally {
      setLoading(false);
    }
  }

  async function removeScope(teacherId: string, scopeId: string) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/teachers/${teacherId}/scopes/${scopeId}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Failed to remove scope.');
        return;
      }
      await load();
    } catch {
      setError('Failed to remove scope.');
    } finally {
      setLoading(false);
    }
  }

  function addPendingScope() {
    const next = {
      classLevel: newTeacher.classLevel,
      subject: newTeacher.subject,
      section: newTeacher.section.trim() || undefined,
    };
    const key = `${next.classLevel}|${next.subject}|${next.section || ''}`;
    if (pendingScopes.some((scope) => `${scope.classLevel}|${scope.subject}|${scope.section || ''}` === key)) {
      return;
    }
    setPendingScopes((prev) => [...prev, next]);
  }

  const activeTeachers = useMemo(
    () => teachers.filter((teacher) => teacher.status === 'active').length,
    [teachers]
  );

  async function logout() {
    await fetch('/api/admin/session/logout', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
    }).catch(() => undefined);
    window.location.assign('/admin/login?logout=1');
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white px-5 py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-fraunces text-3xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6 text-indigo-100" />
                Admin Control Plane
              </h1>
              <p className="text-indigo-100 text-sm mt-1.5">Manage teachers, scopes, and classroom intelligence metrics.</p>
            </div>
            <button onClick={logout} className="text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg border border-white/30">
              Logout
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-6 gap-3">
          <Stat label="Total teachers" value={overview?.totalTeachers ?? teachers.length} />
          <Stat label="Active teachers" value={overview?.activeTeachers ?? activeTeachers} />
          <Stat label="Assignments this week" value={overview?.assignmentCompletionsThisWeek ?? 0} />
          <Stat label="Subjects scoped" value={overview?.scopesBySubject.length ?? 0} />
          <Stat label="High-risk exam sessions" value={overview?.highRiskExamSessions ?? 0} />
          <Stat
            label="Storage status"
            value={overview?.storageStatus?.mode === 'connected' ? 'Connected' : 'Degraded'}
          />
        </div>

        {overview?.storageStatus && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${overview.storageStatus.mode === 'connected' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            <span className="font-semibold">Storage:</span> {overview.storageStatus.message}
          </div>
        )}

        <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
          <h2 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-600" />
            Add Teacher
          </h2>
          <div className="grid md:grid-cols-6 gap-2 mt-3">
            <input value={newTeacher.name} onChange={(e) => setNewTeacher((prev) => ({ ...prev, name: e.target.value }))} placeholder="Name" className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
            <input value={newTeacher.phone} onChange={(e) => setNewTeacher((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Phone" className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
            <input value={newTeacher.pin} onChange={(e) => setNewTeacher((prev) => ({ ...prev, pin: e.target.value }))} placeholder="PIN" className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
            <select
              value={newTeacher.classLevel}
              onChange={(e) => {
                const nextClass = Number(e.target.value) as 10 | 12;
                const allowed = getSubjectsForClass(nextClass);
                setNewTeacher((prev) => ({
                  ...prev,
                  classLevel: nextClass,
                  subject: allowed.includes(prev.subject) ? prev.subject : allowed[0],
                }));
              }}
              className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2"
            >
              <option value={10}>Class 10</option>
              <option value={12}>Class 12</option>
            </select>
            <select value={newTeacher.subject} onChange={(e) => setNewTeacher((prev) => ({ ...prev, subject: e.target.value as TeacherScope['subject'] }))} className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2">
              {getSubjectsForClass(newTeacher.classLevel).map((subject) => (
                <option key={subject}>{subject}</option>
              ))}
            </select>
            <input value={newTeacher.section} onChange={(e) => setNewTeacher((prev) => ({ ...prev, section: e.target.value }))} placeholder="Section (optional)" className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addPendingScope}
              className="text-xs font-semibold border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg"
            >
              Add scope to teacher
            </button>
            <span className="text-xs text-[#6E6984]">
              Added scopes: {pendingScopes.length + 1} (including current selection)
            </span>
          </div>
          {pendingScopes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pendingScopes.map((scope, index) => (
                <span key={`${scope.classLevel}-${scope.subject}-${scope.section || 'all'}-${index}`} className="inline-flex items-center gap-1 rounded-full border border-[#DCD7CC] bg-white px-2 py-0.5 text-xs">
                  Class {scope.classLevel} {scope.subject}{scope.section ? ` (${scope.section})` : ''}
                  <button
                    type="button"
                    onClick={() =>
                      setPendingScopes((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                    }
                    className="text-rose-700 hover:text-rose-800 font-bold"
                    aria-label="Remove pending scope"
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          )}
          <button disabled={loading} onClick={createTeacher} className="mt-3 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl disabled:opacity-50">
            Create teacher
          </button>
        </div>

        <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
          <h2 className="font-fraunces text-lg font-bold text-navy-700">Teachers</h2>
          <div className="mt-3 space-y-3">
            {teachers.map((teacher) => (
              <div key={teacher.id} className="rounded-xl border border-[#E8E4DC] bg-[#FAF9F5] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#21213A]">{teacher.name}</p>
                    <p className="text-xs text-[#6E6984]">{teacher.phone}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleTeacherStatus(teacher)} className="text-xs font-semibold border border-[#DCD7CC] bg-white px-3 py-1.5 rounded-lg hover:bg-[#F1EEE8]">
                      {teacher.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-[#5F5A73]">
                  <div className="font-semibold text-[#4D4963] mb-1">Active scopes</div>
                  <div className="flex flex-wrap gap-1.5">
                    {teacher.scopes.filter((scope) => scope.isActive).map((scope) => (
                      <span key={scope.id} className="inline-flex items-center gap-1 rounded-full border border-[#DCD7CC] bg-white px-2 py-0.5">
                        Class {scope.classLevel} {scope.subject}{scope.section ? ` (${scope.section})` : ''}
                        <button
                          onClick={() => removeScope(teacher.id, scope.id)}
                          className="text-rose-700 hover:text-rose-800 font-bold"
                          aria-label={`Remove scope ${scope.id}`}
                        >
                          x
                        </button>
                      </span>
                    ))}
                    {teacher.scopes.filter((scope) => scope.isActive).length === 0 && <span>No active scopes</span>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={pinReset[teacher.id] ?? ''}
                    onChange={(event) => setPinReset((prev) => ({ ...prev, [teacher.id]: event.target.value }))}
                    placeholder="New PIN"
                    className="text-xs border border-[#E8E4DC] rounded-lg px-2 py-1.5"
                  />
                  <button
                    onClick={() => resetPin(teacher.id)}
                    className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1"
                  >
                    <KeyRound className="w-3 h-3" />
                    Reset PIN
                  </button>
                </div>
                <div className="mt-3 rounded-lg border border-[#E8E4DC] bg-white p-2.5">
                  <p className="text-[11px] font-semibold text-[#4D4963] mb-1.5">Assign new scope</p>
                  <div className="grid sm:grid-cols-4 gap-2">
                    <select
                      value={getScopeDraft(teacher.id).classLevel}
                      onChange={(event) =>
                        setScopeDrafts((prev) => {
                          const nextClass = Number(event.target.value) as 10 | 12;
                          const currentDraft = getScopeDraft(teacher.id);
                          const allowed = getSubjectsForClass(nextClass);
                          return {
                            ...prev,
                            [teacher.id]: {
                              ...currentDraft,
                              classLevel: nextClass,
                              subject: allowed.includes(currentDraft.subject) ? currentDraft.subject : allowed[0],
                            },
                          };
                        })
                      }
                      className="text-xs border border-[#E8E4DC] rounded-lg px-2 py-1.5"
                    >
                      <option value={10}>Class 10</option>
                      <option value={12}>Class 12</option>
                    </select>
                    <select
                      value={getScopeDraft(teacher.id).subject}
                      onChange={(event) =>
                        setScopeDrafts((prev) => ({
                          ...prev,
                          [teacher.id]: {
                            ...getScopeDraft(teacher.id),
                            subject: event.target.value as TeacherScope['subject'],
                          },
                        }))
                      }
                      className="text-xs border border-[#E8E4DC] rounded-lg px-2 py-1.5"
                    >
                      {getSubjectsForClass(getScopeDraft(teacher.id).classLevel).map((subject) => (
                        <option key={`${teacher.id}-${subject}`}>{subject}</option>
                      ))}
                    </select>
                    <input
                      value={getScopeDraft(teacher.id).section}
                      onChange={(event) =>
                        setScopeDrafts((prev) => ({
                          ...prev,
                          [teacher.id]: {
                            ...getScopeDraft(teacher.id),
                            section: event.target.value,
                          },
                        }))
                      }
                      placeholder="Section (optional)"
                      className="text-xs border border-[#E8E4DC] rounded-lg px-2 py-1.5"
                    />
                    <button
                      onClick={() => addScope(teacher.id)}
                      className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5 rounded-lg"
                    >
                      Add scope
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {teachers.length === 0 && <p className="text-sm text-[#6E6984]">No teachers yet.</p>}
          </div>
        </div>

        <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
          <h2 className="font-fraunces text-lg font-bold text-navy-700">Student Roster</h2>
          <div className="grid md:grid-cols-6 gap-2 mt-3">
            <input value={newStudent.name} onChange={(e) => setNewStudent((prev) => ({ ...prev, name: e.target.value }))} placeholder="Student name" className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
            <input value={newStudent.rollCode} onChange={(e) => setNewStudent((prev) => ({ ...prev, rollCode: e.target.value }))} placeholder="Roll code" className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
            <select value={newStudent.classLevel} onChange={(e) => setNewStudent((prev) => ({ ...prev, classLevel: Number(e.target.value) as 10 | 12 }))} className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2">
              <option value={10}>Class 10</option>
              <option value={12}>Class 12</option>
            </select>
            <input value={newStudent.section} onChange={(e) => setNewStudent((prev) => ({ ...prev, section: e.target.value }))} placeholder="Section (optional)" className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
            <input value={newStudent.pin} onChange={(e) => setNewStudent((prev) => ({ ...prev, pin: e.target.value }))} placeholder="PIN (optional)" className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
            <button disabled={loading} onClick={createStudent} className="text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl disabled:opacity-50">Create student</button>
          </div>

          <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
            {students.map((student) => (
              <div key={student.id} className="rounded-xl border border-[#E8E4DC] bg-[#FAF9F5] px-3 py-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#21213A]">{student.name}</p>
                  <p className="text-xs text-[#6E6984]">{student.rollCode} | Class {student.classLevel}{student.section ? ` | Section ${student.section}` : ''}</p>
                </div>
                <button onClick={() => toggleStudentStatus(student)} className="text-xs font-semibold border border-[#DCD7CC] bg-white px-3 py-1.5 rounded-lg hover:bg-[#F1EEE8]">
                  {student.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ))}
            {students.length === 0 && <p className="text-sm text-[#6E6984]">No students yet.</p>}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <InfoCard title="Top weak topics" items={(overview?.topWeakTopics ?? []).map((item) => `${item.topic} (${item.count})`)} />
          <InfoCard title="Top chapters in assignments" items={(overview?.topChapters ?? []).map((item) => `${item.chapterId} (${item.count})`)} />
          <InfoCard title="Scopes by section" items={(overview?.scopesBySection ?? []).map((item) => `${item.section} (${item.count})`)} />
        </div>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
      <p className="text-xs text-[#6E6984]">{label}</p>
      <p className="text-2xl font-bold text-navy-700 mt-1">{value}</p>
    </div>
  );
}

function InfoCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
      <h3 className="font-fraunces text-lg font-bold text-navy-700">{title}</h3>
      <ul className="mt-2 space-y-1">
        {items.slice(0, 8).map((item) => (
          <li key={item} className="text-sm text-[#4C4860]">{item}</li>
        ))}
        {items.length === 0 && <li className="text-sm text-[#6E6984]">No data yet.</li>}
      </ul>
    </div>
  );
}
