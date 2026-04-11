'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

interface QuestionResult {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
}

interface SessionData {
  sessionId: string;
  subject: string;
  classLevel: number;
  questionCount: number;
  status: 'active' | 'submitted';
  score?: number | null;
  questions: QuestionResult[];
  answers: Record<string, number>;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function MockExamResultsPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : '';

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
          if (active) setError(body?.message || 'Failed to load exam results.');
          return;
        }
        if (active) setSession(data);
      } catch {
        if (active) setError('Failed to load exam results.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [sessionId]);

  const scoreSummary = useMemo(() => {
    if (!session) return { correct: 0, total: 0, score: 0 };
    const total = session.questions.length;
    let correct = 0;
    for (const question of session.questions) {
      const selected = session.answers?.[question.id];
      if (Number.isFinite(selected) && selected === question.answerIndex) correct += 1;
    }
    const score = session.score ?? (total > 0 ? Math.round((correct / total) * 10000) / 100 : 0);
    return { correct, total, score };
  }, [session]);

  if (loading) return <div className="min-h-screen bg-[#FDFAF6] px-4 py-8">Loading results...</div>;
  if (!session) return <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 text-rose-700">{error || 'Results unavailable.'}</div>;

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-4xl rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700">Mock Exam Results</h1>
        <p className="mt-1 text-sm text-[#6D6A7C]">{session.subject} • Class {session.classLevel}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs text-emerald-700">Score</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">{scoreSummary.score}%</p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <p className="text-xs text-sky-700">Correct</p>
            <p className="mt-1 text-2xl font-bold text-sky-900">{scoreSummary.correct}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-700">Total Questions</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">{scoreSummary.total}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {session.questions.map((question, index) => {
            const selected = session.answers?.[question.id];
            const isCorrect = Number.isFinite(selected) && selected === question.answerIndex;
            return (
              <div key={question.id} className="rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-navy-700">Q{index + 1}. {question.prompt}</p>
                <p className={`mt-2 text-xs font-semibold ${isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {isCorrect ? 'Correct' : 'Incorrect'}
                </p>
                <p className="mt-1 text-xs text-[#6D6A7C]">Your answer: {Number.isFinite(selected) ? question.options[selected] : 'Not answered'}</p>
                <p className="text-xs text-[#6D6A7C]">Correct answer: {question.options[question.answerIndex]}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

