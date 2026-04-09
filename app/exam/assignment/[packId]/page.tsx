'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { TeacherAssignmentPack } from '@/lib/teacher-types';

interface ExamSessionResponse {
  session: {
    sessionId: string;
    status: 'active' | 'submitted' | 'abandoned';
  };
}

interface HeartbeatResponse {
  integritySummary: {
    riskLevel: 'low' | 'medium' | 'high';
    totalViolations: number;
  };
}

interface ExamSubmitResponse {
  submissionId: string;
  status: 'pending_review' | 'graded' | 'released';
  message: string;
  integritySummary?: {
    riskLevel: 'low' | 'medium' | 'high';
    totalViolations: number;
  };
}

interface StudentSessionPayload {
  studentId: string;
  studentName: string;
  rollCode: string;
  classLevel: 10 | 12;
  section?: string;
}

type ViolationEvent = {
  type:
    | 'fullscreen-exit'
    | 'tab-hidden'
    | 'window-blur'
    | 'copy-attempt'
    | 'paste-attempt'
    | 'context-menu'
    | 'key-shortcut';
  occurredAt: string;
  detail?: string;
};

export default function ProctoredExamPage() {
  const params = useParams<{ packId: string }>();
  const packId = String(params.packId ?? '').trim();
  const [pack, setPack] = useState<TeacherAssignmentPack | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [studentSession, setStudentSession] = useState<StudentSessionPayload | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [examStarted, setExamStarted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ExamSubmitResponse | null>(null);
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, number>>({});
  const [shortAnswers, setShortAnswers] = useState<Record<string, string>>({});
  const [longAnswers, setLongAnswers] = useState<Record<string, string>>({});
  const [violationCount, setViolationCount] = useState(0);
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('low');
  const violationQueueRef = useRef<ViolationEvent[]>([]);

  useEffect(() => {
    async function loadStudentSession() {
      try {
        const response = await fetch('/api/student/session/me', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) {
          setStudentSession(null);
          return;
        }
        setStudentSession(data as StudentSessionPayload);
      } catch {
        setStudentSession(null);
      }
    }

    async function loadPack() {
      if (!packId) return;
      setLoading(true);
      try {
        const response = await fetch(`/api/teacher/assignment-pack?id=${encodeURIComponent(packId)}`, {
          cache: 'no-store',
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) {
          setError(data?.error || 'Assignment pack not found.');
          setPack(null);
          return;
        }
        setPack(data as TeacherAssignmentPack);
      } catch {
        setError('Failed to load assignment pack.');
      } finally {
        setLoading(false);
      }
    }
    void Promise.all([loadPack(), loadStudentSession()]);
  }, [packId]);

  useEffect(() => {
    if (!examStarted || submitted) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [examStarted, submitted]);

  useEffect(() => {
    if (!examStarted || submitted) return;

    function pushViolation(event: ViolationEvent) {
      violationQueueRef.current.push(event);
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pushViolation({ type: 'tab-hidden', occurredAt: new Date().toISOString() });
      }
    };
    const onBlur = () => pushViolation({ type: 'window-blur', occurredAt: new Date().toISOString() });
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        pushViolation({ type: 'fullscreen-exit', occurredAt: new Date().toISOString() });
      }
    };
    const onCopy = () => pushViolation({ type: 'copy-attempt', occurredAt: new Date().toISOString() });
    const onPaste = () => pushViolation({ type: 'paste-attempt', occurredAt: new Date().toISOString() });
    const onContext = (event: MouseEvent) => {
      event.preventDefault();
      pushViolation({ type: 'context-menu', occurredAt: new Date().toISOString() });
    };
    const onKey = (event: KeyboardEvent) => {
      const blocked =
        (event.ctrlKey || event.metaKey) &&
        ['k', 't', 'n', 'w', 'c', 'v'].includes(event.key.toLowerCase());
      if (blocked) {
        pushViolation({
          type: 'key-shortcut',
          occurredAt: new Date().toISOString(),
          detail: `${event.ctrlKey ? 'Ctrl' : 'Meta'}+${event.key}`,
        });
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey);

    const interval = window.setInterval(async () => {
      if (!sessionId) return;
      const events = violationQueueRef.current.splice(0, violationQueueRef.current.length);
      try {
        const response = await fetch('/api/exam/session/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, events }),
        });
        const data = (await response.json().catch(() => null)) as HeartbeatResponse | null;
        if (response.ok && data?.integritySummary) {
          setViolationCount(data.integritySummary.totalViolations);
          setRiskLevel(data.integritySummary.riskLevel);
          if (data.integritySummary.totalViolations >= 8) {
            void handleSubmit();
          }
        }
      } catch {
        // best effort heartbeat
      }
    }, 12000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKey);
      clearInterval(interval);
    };
  }, [examStarted, submitted, sessionId]);

  const questionList = useMemo(() => {
    const mcq = (pack?.mcqs ?? []).map((item, idx) => ({ kind: 'mcq' as const, key: `Q${idx + 1}`, value: item }));
    const shorts = (pack?.shortAnswers ?? []).map((item, idx) => ({ kind: 'short' as const, key: `S${idx + 1}`, value: item }));
    const longs = (pack?.longAnswers ?? []).map((item, idx) => ({ kind: 'long' as const, key: `L${idx + 1}`, value: item }));
    return [...mcq, ...shorts, ...longs];
  }, [pack]);

  async function startExam() {
    if (!pack || !studentSession?.studentId || !studentSession.rollCode || !agreed) {
      setError('Student session not found. Login again and accept the integrity pledge.');
      return;
    }
    setError('');
    try {
      await document.documentElement.requestFullscreen().catch(() => undefined);
      const response = await fetch('/api/exam/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packId: pack.packId,
        }),
      });
      const data = (await response.json().catch(() => null)) as ExamSessionResponse | null;
      if (!response.ok || !data?.session?.sessionId) {
        setError((data as { error?: string } | null)?.error || 'Failed to start exam session.');
        return;
      }
      setSessionId(data.session.sessionId);
      setExamStarted(true);
    } catch {
      setError('Failed to start exam.');
    }
  }

  async function handleSubmit() {
    if (!pack || !sessionId || submitting || submitted) return;
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

      const response = await fetch('/api/exam/session/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, answers }),
      });
      const data = (await response.json().catch(() => null)) as ExamSubmitResponse | null;
      if (!response.ok || !data) {
        setError((data as { error?: string } | null)?.error || 'Submission failed.');
        return;
      }
      setResult(data);
      setSubmitted(true);
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
      }
    } catch {
      setError('Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FDFAF6] px-4 py-10 text-sm text-[#5F5A73]">Loading exam pack...</div>;
  }

  if (!pack) {
    return <div className="min-h-screen bg-[#FDFAF6] px-4 py-10 text-sm text-rose-700">{error || 'Exam pack not found.'}</div>;
  }

  if (!examStarted) {
    return (
      <div className="min-h-screen bg-[#FDFAF6] px-4 py-8">
        <div className="max-w-2xl mx-auto rounded-2xl border border-[#E8E4DC] bg-white p-6">
          <h1 className="font-fraunces text-2xl font-bold text-navy-700">Proctored Exam Mode</h1>
          <p className="text-sm text-[#5F5A73] mt-2">
            AI tools, tab switching, and copy/paste actions are monitored. This is a board-practice integrity mode.
          </p>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F8F4] px-3 py-2.5 text-sm">
              <p className="text-[#5F5A73]">
                Student: <span className="font-semibold text-navy-700">{studentSession?.studentName || 'Not found'}</span>
              </p>
              <p className="text-[#5F5A73] mt-1">
                Roll code: <span className="font-semibold text-navy-700">{studentSession?.rollCode || 'Not found'}</span>
              </p>
            </div>
            <label className="flex items-start gap-2 text-xs text-[#4A4A6A]">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="mt-0.5"
              />
              I confirm I will not use AI tools or external help during this attempt.
            </label>
            <button
              onClick={startExam}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl px-4 py-2.5"
            >
              Start Exam
            </button>
            {error && <p className="text-xs text-rose-700">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-6">
      <div className="max-w-4xl mx-auto rounded-2xl border border-[#E8E4DC] bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-fraunces text-xl font-bold text-navy-700">{pack.title}</h1>
          <div className="text-xs font-semibold rounded-full px-2.5 py-1 border border-amber-200 bg-amber-50 text-amber-800">
            Integrity: {riskLevel.toUpperCase()} ({violationCount} events)
          </div>
        </div>
        <p className="mt-1 text-xs text-[#6A6A84]">
          Class {pack.classLevel} {pack.subject} | {pack.estimatedTimeMinutes} min
        </p>

        <div className="mt-4 space-y-4 max-h-[62vh] overflow-y-auto pr-1">
          {questionList.map((entry, idx) => (
            <div key={entry.key} className="rounded-xl border border-[#E8E4DC] bg-[#FAF9F5] px-4 py-3">
              <p className="text-sm font-semibold text-[#1F1F35]">
                {idx + 1}. {entry.kind === 'mcq' ? entry.value.question : entry.value}
              </p>
              {entry.kind === 'mcq' && (
                <div className="mt-2 space-y-1.5">
                  {entry.value.options.map((option, optIdx) => (
                    <label key={`${entry.key}-${optIdx}`} className="flex items-start gap-2 text-sm text-[#3D3B4D]">
                      <input
                        type="radio"
                        name={entry.key}
                        checked={mcqAnswers[entry.key] === optIdx}
                        onChange={() => setMcqAnswers((prev) => ({ ...prev, [entry.key]: optIdx }))}
                        className="mt-1"
                      />
                      <span>{String.fromCharCode(65 + optIdx)}. {option}</span>
                    </label>
                  ))}
                </div>
              )}
              {entry.kind === 'short' && (
                <textarea
                  value={shortAnswers[entry.key] ?? ''}
                  onChange={(event) => setShortAnswers((prev) => ({ ...prev, [entry.key]: event.target.value }))}
                  rows={3}
                  placeholder="Write your answer"
                  className="w-full mt-2 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2"
                />
              )}
              {entry.kind === 'long' && (
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

        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl px-4 py-2.5 disabled:opacity-60"
          >
            {submitting ? 'Submitting...' : 'Submit Exam'}
          </button>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-semibold">{result?.message || 'Submitted successfully.'}</p>
            <p className="mt-1 text-emerald-800">Status: {result?.status}</p>
            {result?.integritySummary && (
              <p className="mt-1 text-emerald-800">
                Integrity risk: {result.integritySummary.riskLevel.toUpperCase()} ({result.integritySummary.totalViolations} events)
              </p>
            )}
          </div>
        )}

        {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
