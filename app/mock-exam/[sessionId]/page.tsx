'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface ExamQuestion {
  id: string;
  prompt: string;
  options: string[];
  chapterId?: string;
}

interface SessionData {
  sessionId: string;
  subject: string;
  classLevel: number;
  durationMinutes: number;
  questionCount: number;
  status: 'active' | 'submitted';
  createdAt: string;
  submittedAt?: string;
  score?: number | null;
  questions: ExamQuestion[];
  answers: Record<string, number>;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function MockExamSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : '';

  const [session, setSession] = useState<SessionData | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!sessionId) return;
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/mock-exam/session?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        const data = unwrap<SessionData | null>(body);
        if (!res.ok || !data) {
          if (active) setError(body?.message || 'Failed to load exam session.');
          return;
        }
        if (!active) return;
        setSession(data);
        setAnswers(data.answers || {});
        if (data.status === 'submitted') {
          router.replace(`/mock-exam/${sessionId}/results`);
        }
      } catch {
        if (active) setError('Failed to load exam session.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router, sessionId]);

  useEffect(() => {
    if (!session || !session.createdAt || session.status !== 'active') return;
    const startedAt = new Date(session.createdAt).getTime();
    const durationMs = Math.max(1, session.durationMinutes) * 60 * 1000;
    function tick() {
      const remaining = Math.max(0, Math.ceil((startedAt + durationMs - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        void submitExam();
      }
    }
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [session, answers, submitting]);

  const timeLabel = useMemo(() => {
    if (secondsLeft == null) return '--:--';
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [secondsLeft]);

  function setAnswer(questionId: string, optionIndex: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  }

  async function submitExam() {
    if (!session || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/mock-exam/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, answers }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message || 'Failed to submit exam.');
        return;
      }
      router.replace(`/mock-exam/${session.sessionId}/results`);
    } catch {
      setError('Failed to submit exam.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-[#FDFAF6] px-4 py-8">Loading exam...</div>;

  if (!session) {
    return <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 text-rose-700">{error || 'Exam session not found.'}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-fraunces text-xl font-bold text-navy-700">{session.subject} Mock Exam</h1>
              <p className="text-sm text-[#6D6A7C]">Class {session.classLevel} • {session.questionCount} questions</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Time left: {timeLabel}</div>
          </div>

          {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          <div className="mt-5 space-y-4">
            {session.questions.map((question, index) => (
              <div key={question.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm font-semibold text-navy-700">Q{index + 1}. {question.prompt}</p>
                <div className="mt-3 grid gap-2">
                  {question.options.map((option, optionIndex) => {
                    const checked = answers[question.id] === optionIndex;
                    return (
                      <label key={`${question.id}-${optionIndex}`} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-saffron-400 bg-saffron-50' : 'border-gray-200 bg-white'}`}>
                        <input
                          type="radio"
                          name={question.id}
                          checked={checked}
                          onChange={() => setAnswer(question.id, optionIndex)}
                          className="mt-0.5"
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={submitExam} disabled={submitting} className="mt-5 rounded-xl bg-navy-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50">
            {submitting ? 'Submitting...' : 'Submit Exam'}
          </button>
        </div>
      </div>
    </div>
  );
}

