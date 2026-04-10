'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { TeacherAssignmentPack } from '@/lib/teacher-types';

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
  const [result, setResult] = useState<SubmissionResponse | null>(null);
  const [latestAttempt, setLatestAttempt] = useState<StudentAttempt | null>(null);

  useEffect(() => {
    async function loadStudentSession() {
      try {
        const response = await fetch('/api/student/session/me', { cache: 'no-store' });
        const body = await response.json().catch(() => null);
        const data = unwrapApiPayload<StudentSessionPayload | null>(body);
        if (!response.ok || !data) {
          setStudentSession(null);
          return;
        }
        setStudentSession(data);
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
          setPack(null);
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
        setLatestAttempt(attempts[0] ?? null);
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
    if (!pack) return;
    if (!studentSession?.studentId || !studentSession?.rollCode) {
      setError('Student login required. Please login as student and retry.');
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
        body: JSON.stringify({
          packId: pack.packId,
          answers,
        }),
      });
      const body = await response.json().catch(() => null);
      const data = unwrapApiPayload<SubmissionResponse | null>(body);
      if (!response.ok || !data) {
        setError(extractApiError(body, 'Submission failed.'));
        return;
      }
      setResult(data);
      const attemptsResponse = await fetch(`/api/student/submission-results?packId=${encodeURIComponent(pack.packId)}`, { cache: 'no-store' });
      const attemptsBody = await attemptsResponse.json().catch(() => null);
      const attemptsData = unwrapApiPayload<Record<string, unknown> | null>(attemptsBody);
      if (attemptsResponse.ok && attemptsData && Array.isArray(attemptsData.attempts)) {
        setLatestAttempt((attemptsData.attempts as StudentAttempt[])[0] ?? null);
      }
    } catch {
      setError('Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FDFAF6] px-4 py-10 text-sm text-[#5F5A73]">Loading assignment pack...</div>;
  }

  if (!pack) {
    return <div className="min-h-screen bg-[#FDFAF6] px-4 py-10 text-sm text-rose-700">{error || 'Assignment pack not found.'}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8">
      <div className="max-w-4xl mx-auto bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="font-fraunces text-2xl font-bold text-navy-700">{pack.title}</h1>
            <p className="text-xs text-[#6A6A84] mt-1">
              Class {pack.classLevel} {pack.subject} | {pack.mcqs.length} MCQs | {pack.shortAnswers.length} short answers | {pack.longAnswers.length} long answers | {pack.estimatedTimeMinutes} min
            </p>
            <p className="text-xs text-[#6A6A84] mt-0.5">Due date: {pack.dueDate || 'Not specified'}</p>
          </div>
          <div className="flex gap-2">
            {!isPrintMode && (
              <Link href={`${pack.printUrl}`} className="text-xs font-semibold border border-indigo-200 text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">
                Printable view
              </Link>
            )}
            {isPrintMode && (
              <button onClick={() => window.print()} className="text-xs font-semibold border border-emerald-200 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
                Print now
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {questionList.map((entry, idx) => (
            <div key={entry.key} className="rounded-xl border border-[#E8E4DC] bg-[#FAF9F5] px-4 py-3">
              <p className="text-sm font-semibold text-[#1F1F35]">
                {idx + 1}. {entry.kind === 'mcq' ? entry.value.question : entry.value}
              </p>

              {entry.kind === 'mcq' && (
                <div className="mt-2 space-y-1.5">
                  {entry.value.options.map((option, optIdx) => (
                    <label key={`${entry.key}-${optIdx}`} className="flex items-start gap-2 text-sm text-[#3D3B4D]">
                      {!isPrintMode && (
                        <input
                          type="radio"
                          name={entry.key}
                          checked={mcqAnswers[entry.key] === optIdx}
                          onChange={() => setMcqAnswers((prev) => ({ ...prev, [entry.key]: optIdx }))}
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
                  onChange={(event) => setShortAnswers((prev) => ({ ...prev, [entry.key]: event.target.value }))}
                  rows={3}
                  placeholder="Write your answer"
                  className="w-full mt-2 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2"
                />
              )}
              {entry.kind === 'long' && !isPrintMode && (
                <textarea
                  value={longAnswers[entry.key] ?? ''}
                  onChange={(event) => setLongAnswers((prev) => ({ ...prev, [entry.key]: event.target.value }))}
                  rows={6}
                  placeholder="Write a detailed board-style answer"
                  className="w-full mt-2 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2"
                />
              )}
            </div>
          ))}
        </div>

        {!isPrintMode && (
        <div className="mt-5 rounded-xl border border-[#E8E4DC] bg-[#F9F8F4] px-4 py-3">
          <p className="text-xs text-[#6A6A84] font-semibold">Student submission</p>
          <div className="w-full mt-2 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 bg-white">
            <p className="text-[#5F5A73]">
              Name: <span className="font-semibold text-navy-700">{studentSession?.studentName || 'Not found'}</span>
            </p>
            <p className="text-[#5F5A73] mt-1">
              Roll code: <span className="font-semibold text-navy-700">{studentSession?.rollCode || 'Not found'}</span>
            </p>
          </div>
          <Link
            href={`/exam/assignment/${pack.packId}`}
            className="mt-2 inline-flex text-xs font-semibold text-indigo-700 hover:text-indigo-800"
          >
            Start Proctored Exam Mode
          </Link>
          <div>
            <Link
              href={`/student/login?force=1&next=${encodeURIComponent(`/practice/assignment/${pack.packId}`)}`}
              className="mt-2 inline-flex text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Switch student login
            </Link>
          </div>
          <button
            disabled={submitting}
            onClick={submit}
              className="mt-3 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit attempt'}
            </button>
          </div>
        )}

        {result && !isPrintMode && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
            <p className="font-semibold text-emerald-800">{result.message || 'Submitted successfully.'}</p>
            <p className="text-emerald-700 mt-1">Status: {result.status}</p>
          </div>
        )}

        {latestAttempt && !isPrintMode && (
          <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm">
            <p className="font-semibold text-indigo-900">Latest result status: {latestAttempt.status}</p>
            <p className="text-indigo-700 mt-1">Submitted: {new Date(latestAttempt.createdAt).toLocaleString()}</p>
            {latestAttempt.status === 'released' && latestAttempt.grading && (
              <p className="text-indigo-700 mt-1">
                Score: {latestAttempt.grading.totalScore}/{latestAttempt.grading.maxScore} ({latestAttempt.grading.percentage}%)
              </p>
            )}
            {latestAttempt.status !== 'released' && (
              <p className="text-indigo-700 mt-1">Marks will appear here after teacher grades and releases results.</p>
            )}
          </div>
        )}

        {error && <div className="mt-4 text-sm text-rose-700">{error}</div>}
      </div>
    </div>
  );
}
