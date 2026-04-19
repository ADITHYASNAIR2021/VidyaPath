'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TeacherAssignmentPack, TeacherSubmissionSummary, TeacherScope } from '@/lib/teacher-types';
import { ALL_CHAPTERS } from '@/lib/data';
import { Users, TrendingDown, TrendingUp, Minus, RefreshCw, UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

interface StudentRow {
  studentName: string;
  submissionCode: string;
  attempts: number;
  averageScore: number;
  weakTags: string[];
  latestStatus: string;
  latestSubmittedAt: string;
}

interface ClassSection {
  id: string;
  classLevel: 10 | 12;
  section: string;
  batch?: string;
  classTeacherId?: string;
  status: string;
}

export default function StudentsPage() {
  const [loading, setLoading] = useState(true);
  const [packs, setPacks] = useState<TeacherAssignmentPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [summary, setSummary] = useState<TeacherSubmissionSummary | null>(null);
  const [scopes, setScopes] = useState<TeacherScope[]>([]);
  const [activeTab, setActiveTab] = useState<'performance' | 'my-class'>('performance');

  // My class state
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [addName, setAddName] = useState('');
  const [addRollNo, setAddRollNo] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addResult, setAddResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [sessionRes, configRes, sectionsRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher', { cache: 'no-store' }),
        fetch('/api/teacher/class-sections', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { return; }
      const sessionBody = unwrap<{ effectiveScopes?: TeacherScope[] } | null>(await sessionRes.json().catch(() => null));
      setScopes(Array.isArray(sessionBody?.effectiveScopes) ? sessionBody.effectiveScopes : []);
      const cfgBody = await configRes.json().catch(() => null);
      const cfg = unwrap<{ assignmentPacks?: TeacherAssignmentPack[] } | null>(cfgBody);
      const sorted = [...(cfg?.assignmentPacks ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setPacks(sorted);
      if (!selectedPackId && sorted.length > 0) setSelectedPackId(sorted[0].packId);

      const sectionsBody = await sectionsRes.json().catch(() => null);
      const sectionsData = unwrap<{ sections?: ClassSection[] } | ClassSection[] | null>(sectionsBody);
      const sections = Array.isArray(sectionsData)
        ? sectionsData
        : Array.isArray((sectionsData as { sections?: ClassSection[] } | null)?.sections)
          ? (sectionsData as { sections: ClassSection[] }).sections
          : [];
      setClassSections(sections.filter((s) => s.status === 'active' || !s.status));
      if (sections.length > 0 && !selectedSectionId) setSelectedSectionId(sections[0].id);
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary(packId: string) {
    if (!packId) return;
    const res = await fetch(`/api/teacher/submission-summary?packId=${encodeURIComponent(packId)}`, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    setSummary(res.ok ? unwrap<TeacherSubmissionSummary | null>(body) : null);
  }

  async function addStudent() {
    const name = addName.trim();
    if (!name || !selectedSectionId) return;
    setAddLoading(true);
    setAddResult(null);
    try {
      const row: Record<string, unknown> = { name };
      if (addRollNo.trim()) row.rollNo = addRollNo.trim();
      if (addPassword.trim()) row.password = addPassword.trim();
      const res = await fetch('/api/teacher/class-sections/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classSectionId: selectedSectionId, rows: [row] }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        const data = unwrap<{ created?: unknown[]; failed?: unknown[] } | null>(body);
        const failed = Array.isArray(data?.failed) ? data.failed : [];
        if (failed.length > 0) {
          const msg = (failed[0] as Record<string, unknown>)?.reason ?? 'Student could not be added.';
          setAddResult({ ok: false, message: String(msg) });
        } else {
          setAddResult({ ok: true, message: `Student "${name}" added successfully.` });
          setAddName('');
          setAddRollNo('');
          setAddPassword('');
        }
      } else {
        const msg = body?.message || body?.error || 'Failed to add student.';
        setAddResult({ ok: false, message: String(msg) });
      }
    } catch {
      setAddResult({ ok: false, message: 'Network error. Please try again.' });
    } finally {
      setAddLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (selectedPackId) void loadSummary(selectedPackId); }, [selectedPackId]);

  const studentRows = useMemo<StudentRow[]>(() => {
    const attempts = summary?.attemptsByStudent ?? [];
    const grouped = new Map<string, {
      studentName: string; submissionCode: string; attempts: number;
      scoreTotal: number; weakMap: Map<string, number>;
      latestSubmittedAt: string; latestStatus: string;
    }>();
    for (const attempt of attempts) {
      const key = `${attempt.submissionCode}::${attempt.studentName}`;
      const score = Number.isFinite(Number(attempt.grading?.percentage)) ? Number(attempt.grading?.percentage) : Number(attempt.scoreEstimate ?? 0);
      const bucket = grouped.get(key) ?? { studentName: attempt.studentName, submissionCode: attempt.submissionCode, attempts: 0, scoreTotal: 0, weakMap: new Map(), latestSubmittedAt: attempt.submittedAt, latestStatus: attempt.status };
      bucket.attempts += 1;
      bucket.scoreTotal += Math.max(0, Math.min(100, score));
      if (attempt.submittedAt > bucket.latestSubmittedAt) { bucket.latestSubmittedAt = attempt.submittedAt; bucket.latestStatus = attempt.status; }
      for (const weak of attempt.weakTopics ?? []) { const c = weak.trim().toLowerCase(); if (c) bucket.weakMap.set(c, (bucket.weakMap.get(c) ?? 0) + 1); }
      grouped.set(key, bucket);
    }
    return [...grouped.values()].map((b) => ({
      studentName: b.studentName,
      submissionCode: b.submissionCode,
      attempts: b.attempts,
      averageScore: Math.round(b.scoreTotal / Math.max(1, b.attempts)),
      weakTags: [...b.weakMap.entries()].sort((a, c) => c[1] - a[1]).slice(0, 3).map(([t]) => t),
      latestStatus: b.latestStatus,
      latestSubmittedAt: b.latestSubmittedAt,
    })).sort((a, b) => a.averageScore - b.averageScore);
  }, [summary?.attemptsByStudent]);

  const classAvg = studentRows.length > 0 ? Math.round(studentRows.reduce((s, r) => s + r.averageScore, 0) / studentRows.length) : 0;

  const selectedSection = classSections.find((s) => s.id === selectedSectionId);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <Users className="w-6 h-6 text-amber-600" /> Students
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Track performance and manage students in your class.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setActiveTab('performance')}
          className={clsx('px-4 py-1.5 rounded-lg text-sm font-semibold transition-all', activeTab === 'performance' ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
        >
          Performance
        </button>
        <button
          onClick={() => setActiveTab('my-class')}
          className={clsx('px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5', activeTab === 'my-class' ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
        >
          <UserPlus className="w-3.5 h-3.5" /> My Class
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {/* Performance tab */}
      {!loading && activeTab === 'performance' && (
        <>
          <div className="mb-5">
            <label className="text-xs font-medium text-gray-600 block mb-1">Assignment Pack</label>
            <select value={selectedPackId} onChange={(e) => setSelectedPackId(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm w-full max-w-lg">
              <option value="">— Select assignment —</option>
              {packs.map((p) => {
                const ch = ALL_CHAPTERS.find((c) => c.id === p.chapterId);
                return <option key={p.packId} value={p.packId}>{ch ? `${ch.title} (${ch.subject})` : p.chapterId} — {p.status}</option>;
              })}
            </select>
          </div>

          {selectedPackId && studentRows.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="rounded-xl border border-[#E8E4DC] bg-white p-3 text-center">
                  <p className="text-2xl font-bold text-navy-700">{studentRows.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Students</p>
                </div>
                <div className="rounded-xl border border-[#E8E4DC] bg-white p-3 text-center">
                  <p className="text-2xl font-bold text-navy-700">{classAvg}%</p>
                  <p className="text-xs text-gray-500 mt-0.5">Class Average</p>
                </div>
                <div className="rounded-xl border border-[#E8E4DC] bg-white p-3 text-center">
                  <p className="text-2xl font-bold text-rose-600">{studentRows.filter((r) => r.averageScore < 40).length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Below 40%</p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E8E4DC] bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Student</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Score</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 hidden sm:table-cell">Attempts</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Weak Topics</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 hidden lg:table-cell">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentRows.map((row) => (
                      <tr key={row.submissionCode} className="border-b border-[#E8E4DC] last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{row.studentName}</p>
                          <p className="text-xs text-gray-400">{row.submissionCode}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {row.averageScore >= 70 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> :
                             row.averageScore < 40 ? <TrendingDown className="w-3.5 h-3.5 text-rose-500" /> :
                             <Minus className="w-3.5 h-3.5 text-amber-500" />}
                            <span className={clsx('text-sm font-bold', row.averageScore >= 70 ? 'text-emerald-700' : row.averageScore < 40 ? 'text-rose-700' : 'text-amber-700')}>
                              {row.averageScore}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-500 hidden sm:table-cell">{row.attempts}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {row.weakTags.map((t) => (
                              <span key={t} className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100 text-[11px]">{t}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                            row.latestStatus === 'released' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            row.latestStatus === 'graded' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          )}>{row.latestStatus.replace('_', ' ')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {selectedPackId && studentRows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No submissions for this assignment yet.</p>
            </div>
          )}
        </>
      )}

      {/* My Class tab */}
      {!loading && activeTab === 'my-class' && (
        <div className="space-y-6">
          {classSections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No class sections assigned to you yet.</p>
              <p className="text-sm mt-1">Ask your admin to assign you as class teacher for a section.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm p-5">
              <h2 className="font-fraunces text-base font-bold text-navy-700 mb-4 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                Add Student to Class
              </h2>

              <div className="mb-4">
                <label className="text-xs font-medium text-gray-600 block mb-1">Class Section</label>
                <select
                  value={selectedSectionId}
                  onChange={(e) => { setSelectedSectionId(e.target.value); setAddResult(null); }}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm w-full max-w-sm"
                >
                  {classSections.map((s) => (
                    <option key={s.id} value={s.id}>
                      Class {s.classLevel} — Section {s.section}{s.batch ? ` (${s.batch})` : ''}
                    </option>
                  ))}
                </select>
                {selectedSection && (
                  <p className="text-xs text-gray-400 mt-1">
                    Adding to: Class {selectedSection.classLevel}, Section {selectedSection.section}
                  </p>
                )}
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Student Name <span className="text-rose-500">*</span></label>
                  <input
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Full name"
                    className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Roll No <span className="text-gray-400">(optional)</span></label>
                  <input
                    value={addRollNo}
                    onChange={(e) => setAddRollNo(e.target.value)}
                    placeholder="e.g. 2600001"
                    className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Password <span className="text-gray-400">(optional, auto if blank)</span></label>
                  <input
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                    placeholder="Min 8 chars"
                    type="text"
                    className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              {addResult && (
                <div className={clsx('flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm mb-4', addResult.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800')}>
                  {addResult.ok
                    ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                  {addResult.message}
                </div>
              )}

              <button
                onClick={addStudent}
                disabled={addLoading || !addName.trim() || !selectedSectionId}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
              >
                {addLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {addLoading ? 'Adding…' : 'Add Student'}
              </button>

              <p className="mt-3 text-xs text-gray-400">
                To add multiple students at once, ask your admin to use the Roster Import page.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
