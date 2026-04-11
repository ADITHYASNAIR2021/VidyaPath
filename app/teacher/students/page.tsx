'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TeacherAssignmentPack, TeacherSubmissionSummary, TeacherScope } from '@/lib/teacher-types';
import { ALL_CHAPTERS } from '@/lib/data';
import { Users, TrendingDown, TrendingUp, Minus, RefreshCw } from 'lucide-react';
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

export default function StudentsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [packs, setPacks] = useState<TeacherAssignmentPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [summary, setSummary] = useState<TeacherSubmissionSummary | null>(null);
  const [scopes, setScopes] = useState<TeacherScope[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [sessionRes, configRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { router.replace('/teacher/login'); return; }
      const sessionBody = unwrap<{ effectiveScopes?: TeacherScope[] } | null>(await sessionRes.json().catch(() => null));
      setScopes(Array.isArray(sessionBody?.effectiveScopes) ? sessionBody.effectiveScopes : []);
      const cfgBody = await configRes.json().catch(() => null);
      const cfg = unwrap<{ assignmentPacks?: TeacherAssignmentPack[] } | null>(cfgBody);
      const sorted = [...(cfg?.assignmentPacks ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setPacks(sorted);
      if (!selectedPackId && sorted.length > 0) setSelectedPackId(sorted[0].packId);
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <Users className="w-6 h-6 text-amber-600" /> Students
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Track student performance and identify areas needing support.</p>
      </div>

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

      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {!loading && selectedPackId && studentRows.length > 0 && (
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

      {!loading && selectedPackId && studentRows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No submissions for this assignment yet.</p>
        </div>
      )}
    </div>
  );
}
