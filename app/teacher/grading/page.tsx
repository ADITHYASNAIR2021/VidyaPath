'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  TeacherAssignmentPack,
  TeacherSubmissionSummary,
} from '@/lib/teacher-types';
import { ALL_CHAPTERS } from '@/lib/data';
import { PenSquare, RefreshCw, CheckCircle, Send, ChevronDown, ChevronUp, Star } from 'lucide-react';
import clsx from 'clsx';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function apiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const r = payload as Record<string, unknown>;
  return String(r.message || r.error || fallback);
}

export default function GradingDeskPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [packs, setPacks] = useState<TeacherAssignmentPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [summary, setSummary] = useState<TeacherSubmissionSummary | null>(null);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, Record<string, { s: string; m: string; f: string }>>>({});
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedPack = packs.find((p) => p.packId === selectedPackId) ?? null;

  const questionRows = useMemo(() => {
    if (!selectedPack) return [];
    const getMax = (q: string, fallback: number) => {
      const m = selectedPack.questionMeta?.[q]?.maxMarks;
      return Number.isFinite(Number(m)) ? Math.max(0.25, Number(m)) : fallback;
    };
    const rows: Array<{ questionNo: string; defaultMax: number }> = [];
    (selectedPack.mcqs ?? []).forEach((_, i) => rows.push({ questionNo: `Q${i + 1}`, defaultMax: getMax(`Q${i + 1}`, 1) }));
    (selectedPack.shortAnswers ?? []).forEach((_, i) => rows.push({ questionNo: `S${i + 1}`, defaultMax: getMax(`S${i + 1}`, 1) }));
    (selectedPack.longAnswers ?? []).forEach((_, i) => rows.push({ questionNo: `L${i + 1}`, defaultMax: getMax(`L${i + 1}`, 2) }));
    return rows;
  }, [selectedPack]);

  async function loadPacks() {
    setLoading(true);
    try {
      const [sessionRes, configRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { router.replace('/teacher/login'); return; }
      const cfgBody = await configRes.json().catch(() => null);
      const cfg = unwrap<{ assignmentPacks?: TeacherAssignmentPack[] } | null>(cfgBody);
      if (!configRes.ok || !cfg) return;
      const sorted = [...(cfg.assignmentPacks ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setPacks(sorted);
      if (!selectedPackId && sorted.length > 0) setSelectedPackId(sorted[0].packId);
    } catch {
      setError('Failed to load packs.');
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary(packId: string) {
    if (!packId) return;
    const res = await fetch(`/api/teacher/submission-summary?packId=${encodeURIComponent(packId)}`, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    const data = unwrap<TeacherSubmissionSummary | null>(body);
    setSummary(res.ok && data ? data : null);
  }

  useEffect(() => { void loadPacks(); }, []);
  useEffect(() => { if (selectedPackId) void loadSummary(selectedPackId); }, [selectedPackId]);

  async function gradeAttempt(submissionId: string) {
    const rows = gradeDrafts[submissionId] ?? {};
    const questionGrades = Object.entries(rows)
      .map(([questionNo, row]) => ({ questionNo, scoreAwarded: Number(row.s), maxScore: Number(row.m), feedback: row.f || undefined }))
      .filter((r) => Number.isFinite(r.scoreAwarded) && Number.isFinite(r.maxScore));
    if (questionGrades.length === 0) { setError('Enter at least one question mark.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/teacher/submission/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, questionGrades }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(apiError(body, 'Failed to grade.')); return; }
      await loadSummary(selectedPackId);
    } catch {
      setError('Failed to grade.');
    } finally {
      setSubmitting(false);
    }
  }

  async function releaseResults() {
    if (!selectedPackId) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/teacher/submission/release-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: selectedPackId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(apiError(body, 'Failed to release results.')); return; }
      await loadSummary(selectedPackId);
    } catch {
      setError('Failed to release results.');
    } finally {
      setSubmitting(false);
    }
  }

  const attempts = summary?.attemptsByStudent ?? [];
  const pendingCount = attempts.filter((a) => a.status === 'pending_review').length;
  const gradedCount = attempts.filter((a) => a.status === 'graded').length;
  const releasedCount = attempts.filter((a) => a.status === 'released').length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <PenSquare className="w-6 h-6 text-amber-600" /> Grading Desk
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Review and grade student submissions. Results release is manual.</p>
      </div>

      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {/* Pack selector */}
      <div className="mb-5">
        <label className="text-xs font-medium text-gray-600 block mb-1">Select Assignment</label>
        <select
          value={selectedPackId}
          onChange={(e) => setSelectedPackId(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm w-full max-w-lg"
        >
          <option value="">— Select an assignment pack —</option>
          {packs.map((p) => {
            const ch = ALL_CHAPTERS.find((c) => c.id === p.chapterId);
            return <option key={p.packId} value={p.packId}>{ch ? `${ch.title} (${ch.subject})` : p.chapterId} — {p.status}</option>;
          })}
        </select>
      </div>

      {selectedPackId && summary && (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Pending Review', count: pendingCount, color: 'bg-amber-50 border-amber-200 text-amber-700' },
              { label: 'Graded', count: gradedCount, color: 'bg-blue-50 border-blue-200 text-blue-700' },
              { label: 'Released', count: releasedCount, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
            ].map(({ label, count, color }) => (
              <div key={label} className={`rounded-xl border p-3 text-center ${color}`}>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs font-medium mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {gradedCount > 0 && releasedCount === 0 && (
            <div className="mb-5 flex justify-end">
              <button
                onClick={releaseResults}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> Release All Results
              </button>
            </div>
          )}

          {attempts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No submissions yet for this assignment.</p>
            </div>
          )}

          <div className="space-y-3">
            {attempts.map((attempt) => {
              const isExpanded = expandedSubmission === attempt.submissionId;
              const draft = gradeDrafts[attempt.submissionId] ?? {};
              return (
                <div key={attempt.submissionId} className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedSubmission(isExpanded ? null : attempt.submissionId)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{attempt.studentName}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className={clsx(
                          'text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                          attempt.status === 'pending_review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          attempt.status === 'graded' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        )}>{attempt.status.replace('_', ' ')}</span>
                        <span className="text-xs text-gray-400">{attempt.submissionCode}</span>
                        {attempt.grading?.percentage != null && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                            <Star className="w-3 h-3 text-amber-400" /> {attempt.grading.percentage.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[#E8E4DC] px-5 py-4 bg-gray-50">
                      {attempt.status === 'pending_review' && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-3">Enter marks per question</p>
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                            {questionRows.map(({ questionNo, defaultMax }) => (
                              <div key={questionNo} className="rounded-lg bg-white border border-gray-200 p-3">
                                <p className="text-xs font-semibold text-gray-600 mb-2">{questionNo}</p>
                                <div className="flex gap-2">
                                  <input
                                    placeholder={`Score /${defaultMax}`}
                                    value={draft[questionNo]?.s ?? ''}
                                    onChange={(e) => setGradeDrafts((prev) => ({
                                      ...prev,
                                      [attempt.submissionId]: { ...prev[attempt.submissionId], [questionNo]: { ...prev[attempt.submissionId]?.[questionNo], s: e.target.value, m: String(defaultMax) } }
                                    }))}
                                    className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs"
                                  />
                                </div>
                                <input
                                  placeholder="Feedback"
                                  value={draft[questionNo]?.f ?? ''}
                                  onChange={(e) => setGradeDrafts((prev) => ({
                                    ...prev,
                                    [attempt.submissionId]: { ...prev[attempt.submissionId], [questionNo]: { ...prev[attempt.submissionId]?.[questionNo], f: e.target.value } }
                                  }))}
                                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1 text-xs"
                                />
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => gradeAttempt(attempt.submissionId)}
                            disabled={submitting}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                          >
                            <CheckCircle className="w-4 h-4" /> {submitting ? 'Saving…' : 'Submit Grades'}
                          </button>
                        </div>
                      )}
                      {attempt.status !== 'pending_review' && attempt.grading && (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div><span className="text-xs text-gray-500">Score</span><p className="font-semibold">{attempt.grading.percentage?.toFixed(1)}%</p></div>
                          <div><span className="text-xs text-gray-500">Submitted</span><p className="font-semibold">{new Date(attempt.submittedAt).toLocaleDateString()}</p></div>
                          {attempt.weakTopics && attempt.weakTopics.length > 0 && (
                            <div className="col-span-2">
                              <span className="text-xs text-gray-500">Weak Topics</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {attempt.weakTopics.map((t) => (
                                  <span key={t} className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs">{t}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}
    </div>
  );
}
