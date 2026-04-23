'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  TeacherAssignmentPack,
  TeacherSubmissionSummary,
  TeacherSubmissionAttemptRow,
} from '@/lib/teacher-types';
import type { MCQItem } from '@/lib/ai/validators';
import { ALL_CHAPTERS } from '@/lib/data';
import { PenSquare, RefreshCw, CheckCircle, Send, ChevronDown, ChevronUp, Star, Eye } from 'lucide-react';
import BackButton from '@/components/BackButton';
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

function parseAnswerTokenToIndex(token: string, optionCount: number): number | null {
  const clean = token.trim().toUpperCase();
  if (!clean) return null;
  if (/^[A-Z]$/.test(clean)) {
    const letterIndex = clean.charCodeAt(0) - 'A'.charCodeAt(0);
    return letterIndex >= 0 && letterIndex < optionCount ? letterIndex : null;
  }
  if (/^\d+$/.test(clean)) {
    const value = Number(clean);
    if (value >= 0 && value < optionCount) return value;
    if (value >= 1 && value <= optionCount) return value - 1;
  }
  return null;
}

function parseMcqSelections(answerText: string, optionCount: number): number[] {
  const clean = answerText.trim();
  if (!clean) return [];
  const explicitList = clean.match(/options?\s*[:=-]\s*(.+)$/i);
  if (explicitList) {
    const explicitIndexes = explicitList[1]
      .split(/[^A-Za-z0-9]+/)
      .map((token) => parseAnswerTokenToIndex(token, optionCount))
      .filter((entry): entry is number => entry !== null);
    return Array.from(new Set(explicitIndexes)).sort((a, b) => a - b);
  }
  if (/^\d+$/.test(clean)) {
    const numeric = Number(clean);
    if (numeric >= 1 && numeric <= optionCount) return [numeric - 1];
  }
  const direct = parseAnswerTokenToIndex(clean, optionCount);
  if (direct !== null) return [direct];
  const letterMatches = [...clean.toUpperCase().matchAll(/\b([A-Z])\b/g)]
    .map((match) => parseAnswerTokenToIndex(match[1], optionCount))
    .filter((entry): entry is number => entry !== null);
  return Array.from(new Set(letterMatches)).sort((a, b) => a - b);
}

interface SubmissionDetail {
  submissionId: string;
  packId: string;
  studentName: string;
  answers: Array<{ questionNo: string; answerText: string }>;
  grading: Record<string, unknown> | null;
  createdAt: string;
}

/* ── Per-submission answer + grading view ─────────────────────────────── */
function SubmissionPanel({
  attempt,
  pack,
  questionRows,
  gradeDraft,
  onDraftChange,
  onSubmitGrades,
  submitting,
}: {
  attempt: TeacherSubmissionAttemptRow;
  pack: TeacherAssignmentPack;
  questionRows: Array<{ questionNo: string; defaultMax: number; kind: 'mcq' | 'short' | 'long' | 'formula' }>;
  gradeDraft: Record<string, { s: string; m: string; f: string }>;
  onDraftChange: (questionNo: string, field: 's' | 'm' | 'f', value: string) => void;
  onSubmitGrades: () => void;
  submitting: boolean;
}) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingDetail(true);
    setDetail(null);
    fetch(`/api/teacher/submission/${encodeURIComponent(attempt.submissionId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (res.ok) setDetail(unwrap<SubmissionDetail>(body));
      })
      .catch((err) => { if (err?.name !== 'AbortError') console.error(err); })
      .finally(() => setLoadingDetail(false));
    return () => controller.abort();
  }, [attempt.submissionId]);

  const answerMap = useMemo(() => {
    const map: Record<string, string> = {};
    (detail?.answers ?? []).forEach(({ questionNo, answerText }) => { map[questionNo] = answerText; });
    return map;
  }, [detail]);

  const mcqs: MCQItem[] = pack.mcqs ?? [];
  const shortAnswers: string[] = pack.shortAnswers ?? [];
  const longAnswers: string[] = pack.longAnswers ?? [];

  return (
    <div className="space-y-3">
      {loadingDetail && (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading answers…
        </div>
      )}

      {questionRows.map(({ questionNo, defaultMax, kind }) => {
        const studentAnswer = answerMap[questionNo] ?? '';
        const draft = gradeDraft[questionNo] ?? {};
        const isGraded = attempt.status !== 'pending_review';

        // Find question text
        let questionText = '';
        if (kind === 'mcq') {
          const idx = Number(questionNo.slice(1)) - 1;
          questionText = mcqs[idx]?.question ?? questionNo;
        } else if (kind === 'short') {
          const idx = Number(questionNo.slice(1)) - 1;
          questionText = shortAnswers[idx] ?? questionNo;
        } else if (kind === 'long') {
          const idx = Number(questionNo.slice(1)) - 1;
          questionText = typeof longAnswers[idx] === 'string'
            ? longAnswers[idx]
            : (longAnswers[idx] as unknown as { question?: string })?.question ?? questionNo;
        }

        return (
          <div key={questionNo} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* Question header */}
            <div className="flex items-start gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
              <span className="flex-shrink-0 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase">{questionNo}</span>
              <p className="text-xs text-gray-700 font-medium leading-snug">{questionText}</p>
            </div>

            {/* MCQ: show options + highlight student pick vs correct */}
            {kind === 'mcq' && (() => {
              const idx = Number(questionNo.slice(1)) - 1;
              const mcq = mcqs[idx];
              if (!mcq) return null;
              const studentPicks = parseMcqSelections(studentAnswer, mcq.options.length);
              const multiAnswers = Array.isArray(mcq.answers)
                ? mcq.answers.filter((entry) => Number.isInteger(entry) && entry >= 0 && entry < mcq.options.length)
                : [];
              const correctIndexes = mcq.answerMode === 'multiple' && multiAnswers.length > 0
                ? multiAnswers
                : [mcq.answer];
              return (
                <div className="grid grid-cols-2 gap-2 px-4 py-3">
                  {mcq.options.map((opt, j) => {
                    const isCorrect = correctIndexes.includes(j);
                    const isStudentPick = studentPicks.includes(j);
                    return (
                      <div
                        key={j}
                        className={clsx(
                          'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                          isCorrect && isStudentPick && 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold',
                          isCorrect && !isStudentPick && 'bg-emerald-50 border-emerald-200 text-emerald-700',
                          !isCorrect && isStudentPick && 'bg-rose-50 border-rose-300 text-rose-700 font-semibold',
                          !isCorrect && !isStudentPick && 'border-gray-100 text-gray-500'
                        )}
                      >
                        <span className={clsx('w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center border',
                          isCorrect ? 'border-emerald-400 bg-emerald-100 text-emerald-700' :
                          isStudentPick ? 'border-rose-400 bg-rose-100 text-rose-700' :
                          'border-gray-300 text-gray-400'
                        )}>
                          {String.fromCharCode(65 + j)}
                        </span>
                        {opt}
                        {isStudentPick && <span className="ml-auto text-[9px] font-bold uppercase tracking-wide opacity-70">{isCorrect ? 'Correct' : 'Wrong'}</span>}
                        {!isStudentPick && isCorrect && <span className="ml-auto text-[9px] font-bold uppercase tracking-wide opacity-70">Answer</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Short / Long: show student written response */}
            {(kind === 'short' || kind === 'long') && (
              <div className="px-4 py-3">
                {studentAnswer ? (
                  <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                    <p className="text-[10px] font-semibold text-blue-600 mb-1 uppercase tracking-wide">Student&apos;s Answer</p>
                    <p className="text-xs text-gray-800 whitespace-pre-line">{studentAnswer}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No answer submitted</p>
                )}
              </div>
            )}

            {/* Formula drill */}
            {kind === 'formula' && (
              <div className="px-4 py-3">
                {studentAnswer ? (
                  <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
                    <p className="text-[10px] font-semibold text-violet-600 mb-1 uppercase tracking-wide">Student&apos;s Answer</p>
                    <p className="text-xs text-gray-800 whitespace-pre-line">{studentAnswer}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic px-0">No answer submitted</p>
                )}
              </div>
            )}

            {/* Marks input — only for pending_review */}
            {!isGraded && (
              <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100 bg-gray-50">
                <input
                  placeholder={`Score /${defaultMax}`}
                  value={draft.s ?? ''}
                  onChange={(e) => onDraftChange(questionNo, 's', e.target.value)}
                  className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                />
                <input
                  placeholder="Teacher feedback…"
                  value={draft.f ?? ''}
                  onChange={(e) => onDraftChange(questionNo, 'f', e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                />
              </div>
            )}

            {/* Show existing grade if already graded */}
            {isGraded && attempt.grading?.questionGrades && (() => {
              const qg = (attempt.grading.questionGrades as Array<{ questionNo: string; scoreAwarded: number; maxScore: number; feedback?: string }>)
                .find((g) => g.questionNo === questionNo);
              if (!qg) return null;
              return (
                <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100 bg-emerald-50 text-xs">
                  <span className="font-semibold text-emerald-700">{qg.scoreAwarded}/{qg.maxScore}</span>
                  {qg.feedback && <span className="text-gray-600">{qg.feedback}</span>}
                </div>
              );
            })()}
          </div>
        );
      })}

      {attempt.status === 'pending_review' && (
        <div className="pt-2">
          <button
            onClick={onSubmitGrades}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" /> {submitting ? 'Saving…' : 'Submit Grades'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────── */
export default function GradingDeskPage() {
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
    const rows: Array<{ questionNo: string; defaultMax: number; kind: 'mcq' | 'short' | 'long' | 'formula' }> = [];
    (selectedPack.mcqs ?? []).forEach((_, i) => rows.push({ questionNo: `Q${i + 1}`, defaultMax: getMax(`Q${i + 1}`, 1), kind: 'mcq' }));
    (selectedPack.shortAnswers ?? []).forEach((_, i) => rows.push({ questionNo: `S${i + 1}`, defaultMax: getMax(`S${i + 1}`, 2), kind: 'short' }));
    (selectedPack.longAnswers ?? []).forEach((_, i) => rows.push({ questionNo: `L${i + 1}`, defaultMax: getMax(`L${i + 1}`, 5), kind: 'long' }));
    (selectedPack.formulaDrill ?? []).forEach((_, i) => rows.push({ questionNo: `F${i + 1}`, defaultMax: getMax(`F${i + 1}`, 1), kind: 'formula' }));
    return rows;
  }, [selectedPack]);

  async function loadPacks() {
    setLoading(true);
    try {
      const [sessionRes, configRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { setError('Session expired. Please sign in again.'); return; }
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

  function updateDraft(submissionId: string, questionNo: string, field: 's' | 'm' | 'f', value: string) {
    setGradeDrafts((prev) => {
      const maxForQ = questionRows.find((r) => r.questionNo === questionNo)?.defaultMax ?? 1;
      return {
        ...prev,
        [submissionId]: {
          ...prev[submissionId],
          [questionNo]: {
            ...prev[submissionId]?.[questionNo],
            [field]: value,
            m: field === 'm' ? value : (prev[submissionId]?.[questionNo]?.m ?? String(maxForQ)),
          },
        },
      };
    });
  }

  async function gradeAttempt(submissionId: string) {
    const rows = gradeDrafts[submissionId] ?? {};
    const questionGrades = Object.entries(rows)
      .map(([questionNo, row]) => ({
        questionNo,
        scoreAwarded: Number(row.s),
        maxScore: Number(row.m) || (questionRows.find((r) => r.questionNo === questionNo)?.defaultMax ?? 1),
        feedback: row.f || undefined,
      }))
      .filter((r) => Number.isFinite(r.scoreAwarded) && r.scoreAwarded >= 0);
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
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <PenSquare className="w-6 h-6 text-amber-600" /> Grading Desk
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Review student answers, enter marks, and release results.</p>
      </div>

      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {/* Pack selector */}
      <div className="mb-5">
        <label className="text-xs font-medium text-gray-600 block mb-1">Select Assignment</label>
        <select
          value={selectedPackId}
          onChange={(e) => { setSelectedPackId(e.target.value); setExpandedSubmission(null); }}
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
              return (
                <div key={attempt.submissionId} className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm overflow-hidden">
                  {/* Attempt header row */}
                  <div
                    className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedSubmission(isExpanded ? null : attempt.submissionId)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{attempt.studentName}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className={clsx(
                          'text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                          attempt.status === 'pending_review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          attempt.status === 'graded' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        )}>{attempt.status.replace('_', ' ')}</span>
                        <span className="text-xs text-gray-400">{attempt.submissionCode}</span>
                        {attempt.grading?.percentage != null && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                            <Star className="w-3 h-3 text-amber-400" /> {(attempt.grading.percentage as number).toFixed(1)}%
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{new Date(attempt.submittedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Eye className="w-3.5 h-3.5" />
                      {isExpanded ? 'Hide' : 'View Answers'}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>

                  {/* Expanded: full answer + marks panel */}
                  {isExpanded && selectedPack && (
                    <div className="border-t border-[#E8E4DC] px-5 py-4 bg-gray-50">
                      {attempt.weakTopics && attempt.weakTopics.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1">
                          <span className="text-xs text-gray-500 mr-1">Weak topics:</span>
                          {attempt.weakTopics.map((t) => (
                            <span key={t} className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs">{t}</span>
                          ))}
                        </div>
                      )}
                      <SubmissionPanel
                        attempt={attempt}
                        pack={selectedPack}
                        questionRows={questionRows}
                        gradeDraft={gradeDrafts[attempt.submissionId] ?? {}}
                        onDraftChange={(qno, field, val) => updateDraft(attempt.submissionId, qno, field, val)}
                        onSubmitGrades={() => gradeAttempt(attempt.submissionId)}
                        submitting={submitting}
                      />
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
