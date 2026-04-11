'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { TeacherAssignmentPack } from '@/lib/teacher-types';
import { CheckCircle2, Clock, Printer } from 'lucide-react';

interface SubmissionResponse {
  submissionId: string;
  status: 'pending_review' | 'graded' | 'released';
  message: string;
  scoreEstimate?: number;
  duplicate?: boolean;
}

interface StudentAttempt {
  submissionId: string;
  status: 'pending_review' | 'graded' | 'released';
  createdAt: string;
  grading?: {
    totalScore: number;
    maxScore: number;
    percentage: number;
  };
  releasedAt?: string;
}

interface StudentSessionPayload {
  studentId: string;
  studentName: string;
  rollCode: string;
  classLevel: 10 | 12;
  section?: string;
}

function unwrapApiPayload<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function extractApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const raw = payload as Record<string, unknown>;
  return String(raw.message || raw.error || fallback);
}

export default function PracticeAssignmentPage() {
  const router = useRouter();
  const params = useParams<{ packId: string }>();
  const searchParams = useSearchParams();
  const packId = String(params.packId ?? '').trim();
  const isPrintMode = searchParams.get('print') === '1';

  const [pack, setPack] = useState<TeacherAssignmentPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [studentSession, setStudentSession] = useState<StudentSessionPayload | null>(null);
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, number>>({});
  const [shortAnswers, setShortAnswers] = useState<Record<string, string>>({});
  const [longAnswers, setLongAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmissionResponse | null>(null);
  const [latestAttempt, setLatestAttempt] = useState<StudentAttempt | null>(null);

  useEffect(() => {
    async function loadStudentSession() {
      try {
        const response = await fetch('/api/student/session/me', { cache: 'no-store' });
        const body = await response.json().catch(() => null);
        const data = unwrapApiPayload<StudentSessionPayload | null>(body);
        setStudentSession(response.ok && data ? data : null);
      } catch {
        setStudentSession(null);
      }
    }

    async function loadPack() {
      if (!packId) return;
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/teacher/assignment-pack?id=${encodeURIComponent(packId)}`, { cache: 'no-store' });
        const body = await response.json().catch(() => null);
        const data = unwrapApiPayload<TeacherAssignmentPack | null>(body);
        if (response.status === 401) {
          router.replace(`/student/login?next=${encodeURIComponent(`/practice/assignment/${packId}`)}&reason=auth-required`);
          return;
        }
        if (!response.ok || !data) {
          setError(extractApiError(body, 'Assignment pack not found.'));
          return;
        }
        setPack(data);
      } catch {
        setError('Failed to load assignment pack.');
      } finally {
        setLoading(false);
      }
    }

    async function loadStudentAttempts() {
      if (!packId) return;
      try {
        const response = await fetch(`/api/student/submission-results?packId=${encodeURIComponent(packId)}`, { cache: 'no-store' });
        const body = await response.json().catch(() => null);
        const data = unwrapApiPayload<Record<string, unknown> | null>(body);
        if (!response.ok || !data) return;
        const attempts = Array.isArray(data.attempts) ? (data.attempts as StudentAttempt[]) : [];
        if (attempts.length > 0) {
          setLatestAttempt(attempts[0]);
          // Already submitted before — lock the form
          setSubmitted(true);
        }
      } catch {
        // no-op
      }
    }

    void Promise.all([loadPack(), loadStudentSession(), loadStudentAttempts()]);
  }, [packId, router]);

  const questionList = useMemo(() => {
    const mcq = (pack?.mcqs ?? []).map((item, idx) => ({ kind: 'mcq' as const, key: `Q${idx + 1}`, value: item }));
    const shorts = (pack?.shortAnswers ?? []).map((item, idx) => ({ kind: 'short' as const, key: `S${idx + 1}`, value: item }));
    const longs = (pack?.longAnswers ?? []).map((item, idx) => ({ kind: 'long' as const, key: `L${idx + 1}`, value: item }));
    return [...mcq, ...shorts, ...longs];
  }, [pack]);

  async function submit() {
    if (!pack || submitted || submitting) return;
    if (!studentSession?.studentId || !studentSession?.rollCode) {
      setError('Student login required. Please login and retry.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const answers = [
        ...(pack.mcqs ?? []).map((_, idx) => ({
          questionNo: `Q${idx + 1}`,
          answerText: typeof mcqAnswers[`Q${idx + 1}`] === 'number' ? `option:${mcqAnswers[`Q${idx + 1}`]}` : '',
        })),
        ...(pack.shortAnswers ?? []).map((_, idx) => ({
          questionNo: `S${idx + 1}`,
          answerText: shortAnswers[`S${idx + 1}`] ?? '',
        })),
        ...(pack.longAnswers ?? []).map((_, idx) => ({
          questionNo: `L${idx + 1}`,
          answerText: longAnswers[`L${idx + 1}`] ?? '',
        })),
      ].filter((item) => item.answerText.trim().length > 0);

      const response = await fetch('/api/teacher/submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: pack.packId, answers }),
      });
      const body = await response.json().catch(() => null);
      const data = unwrapApiPayload<SubmissionResponse | null>(body);

      // 409 = already submitted (server-side duplicate guard)
      if (response.status === 409) {
        setSubmitted(true);
        setError('');
        setResult({ submissionId: '', status: 'pending_review', message: 'You have already submitted this assignment.' });
        return;
      }

      if (!response.ok || !data) {
        setError(extractApiError(body, 'Submission failed.'));
        return;
      }

      setResult(data);
      setSubmitted(true); // Lock: no more submissions

      // Refresh latest attempt
      const attemptsRes = await fetch(`/api/student/submission-results?packId=${encodeURIComponent(pack.packId)}`, { cache: 'no-store' });
      const attemptsBody = await attemptsRes.json().catch(() => null);
      const attemptsData = unwrapApiPayload<Record<string, unknown> | null>(attemptsBody);
      if (attemptsRes.ok && attemptsData && Array.isArray(attemptsData.attempts)) {
        setLatestAttempt((attemptsData.attempts as StudentAttempt[])[0] ?? null);
      }
    } catch {
      setError('Submission failed. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FDFAF6] px-4 py-10 text-sm text-[#5F5A73]">Loading assignment…</div>;
  }

  if (!pack) {
    return <div className="min-h-screen bg-[#FDFAF6] px-4 py-10 text-sm text-rose-700">{error || 'Assignment not found.'}</div>;
  }

  const totalQ = (pack.mcqs?.length ?? 0) + (pack.shortAnswers?.length ?? 0) + (pack.longAnswers?.length ?? 0);

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8">
      <div className="max-w-4xl mx-auto bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-5">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2 mb-5">
          <div>
            <h1 className="font-fraunces text-2xl font-bold text-navy-700">{pack.title}</h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-[#6A6A84]">
              <span>Class {pack.classLevel} · {pack.subject}</span>
              <span>{totalQ} questions</span>
              {pack.estimatedTimeMinutes && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {pack.estimatedTimeMinutes} min
                </span>
              )}
              {pack.dueDate && <span>Due {new Date(pack.dueDate).toLocaleDateString()}</span>}
            </div>
          </div>
          {!isPrintMode && (
            <Link
              href={`/practice/assignment/${pack.packId}?print=1`}
              className="flex items-center gap-1.5 text-xs font-semibold border border-gray-200 text-gray-600 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-50"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </Link>
          )}
        </div>

        {/* Already-submitted banner (loaded from previous attempt) */}
        {submitted && !result && latestAttempt && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm" role="status">
            <p className="font-semibold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Assignment Already Submitted
            </p>
            <p className="text-emerald-700 mt-1">
              Submitted on {new Date(latestAttempt.createdAt).toLocaleString()} · Status: <span className="font-semibold capitalize">{latestAttempt.status.replace('_', ' ')}</span>
            </p>
            {latestAttempt.status === 'released' && latestAttempt.grading && (
              <p className="text-emerald-700 mt-1 font-semibold">
                Score: {latestAttempt.grading.totalScore}/{latestAttempt.grading.maxScore} ({latestAttempt.grading.percentage.toFixed(1)}%)
              </p>
            )}
            {latestAttempt.status !== 'released' && (
              <p className="text-emerald-600 mt-1 text-xs">Your marks will appear here once the teacher grades and releases results.</p>
            )}
          </div>
        )}

        {/* Questions */}
        <div className="space-y-4">
          {questionList.map((entry, idx) => {
            const isLocked = submitted && !isPrintMode;
            return (
              <div key={entry.key} className="rounded-xl border border-[#E8E4DC] bg-[#FAF9F5] px-4 py-3">
                <p className="text-sm font-semibold text-[#1F1F35]">
                  {idx + 1}. {entry.kind === 'mcq' ? entry.value.question : entry.value}
                </p>
                {entry.kind === 'mcq' && (
                  <div className="mt-2 space-y-1.5">
                    {entry.value.options.map((option, optIdx) => (
                      <label
                        key={`${entry.key}-${optIdx}`}
                        className={`flex items-start gap-2 text-sm text-[#3D3B4D] ${isLocked ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
                      >
                        {!isPrintMode && (
                          <input
                            type="radio"
                            name={entry.key}
                            checked={mcqAnswers[entry.key] === optIdx}
                            onChange={() => { if (!isLocked) setMcqAnswers((prev) => ({ ...prev, [entry.key]: optIdx })); }}
                            disabled={isLocked}
                            className="mt-1"
                          />
                        )}
                        <span>{String.fromCharCode(65 + optIdx)}. {option}</span>
                      </label>
                    ))}
                  </div>
                )}
                {entry.kind === 'short' && !isPrintMode && (
                  <textarea
                    value={shortAnswers[entry.key] ?? ''}
                    onChange={(e) => { if (!isLocked) setShortAnswers((prev) => ({ ...prev, [entry.key]: e.target.value })); }}
                    rows={3}
                    disabled={isLocked}
                    placeholder={isLocked ? 'Submitted' : 'Write your answer…'}
                    className="w-full mt-2 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                )}
                {entry.kind === 'long' && !isPrintMode && (
                  <textarea
                    value={longAnswers[entry.key] ?? ''}
                    onChange={(e) => { if (!isLocked) setLongAnswers((prev) => ({ ...prev, [entry.key]: e.target.value })); }}
                    rows={6}
                    disabled={isLocked}
                    placeholder={isLocked ? 'Submitted' : 'Write a detailed board-style answer…'}
                    className="w-full mt-2 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Submit area */}
        {!isPrintMode && (
          <div className="mt-6">
            {/* Student identity */}
            {!submitted && (
              <div className="mb-4 rounded-xl border border-[#E8E4DC] bg-[#F9F8F4] px-4 py-3 text-sm">
                <p className="text-[#5F5A73]">
                  Submitting as: <span className="font-semibold text-navy-700">{studentSession?.studentName || '—'}</span>
                  <span className="ml-2 text-xs text-gray-400">({studentSession?.rollCode || 'not logged in'})</span>
                </p>
                <Link
                  href={`/student/login?force=1&next=${encodeURIComponent(`/practice/assignment/${packId}`)}`}
                  className="mt-1 inline-flex text-xs font-semibold text-amber-600 hover:text-amber-700"
                >
                  Switch student account
                </Link>
              </div>
            )}

            {/* Submitted success banner */}
            {submitted && result && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm" role="status" aria-live="polite">
                <p className="font-semibold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> {result.message || 'Assignment submitted successfully.'}
                </p>
                <p className="text-emerald-700 mt-1 text-xs">Status: <span className="capitalize">{result.status.replace('_', ' ')}</span> · Your result will appear here once the teacher releases marks.</p>
              </div>
            )}

            {/* Submit button — hidden once submitted */}
            {!submitted && (
              <button
                disabled={submitting}
                onClick={submit}
                className="mt-2 w-full sm:w-auto text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit Assignment'}
              </button>
            )}

            {error && (
              <div className="mt-3 text-sm text-rose-700" role="alert">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Released result */}
        {!isPrintMode && latestAttempt?.status === 'released' && latestAttempt.grading && !result && (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm">
            <p className="font-semibold text-indigo-900">
              Score: {latestAttempt.grading.totalScore}/{latestAttempt.grading.maxScore} ({latestAttempt.grading.percentage.toFixed(1)}%)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
