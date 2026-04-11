'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MockExamSetupPage() {
  const router = useRouter();
  const [subject, setSubject] = useState('Physics');
  const [classLevel, setClassLevel] = useState<10 | 12>(12);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [questionCount, setQuestionCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function startExam() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/mock-exam/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, classLevel, durationMinutes, questionCount }),
      });
      const body = await res.json().catch(() => null);
      const data = body && typeof body === 'object' && 'data' in body ? (body as { data?: { sessionId?: string } }).data : (body as { sessionId?: string } | null);
      const sessionId = data?.sessionId;
      if (!res.ok || !sessionId) {
        setError(body?.message || 'Failed to start mock exam.');
        return;
      }
      router.push(`/mock-exam/${sessionId}`);
    } catch {
      setError('Failed to start mock exam.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700">Mock Exam Center</h1>
        <p className="mt-1 text-sm text-[#6D6A7C]">Configure and start a timed practice exam.</p>

        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <div className="mt-5 grid gap-4">
          <label className="text-sm font-medium text-navy-700">
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm font-medium text-navy-700">
            Class Level
            <select value={classLevel} onChange={(e) => setClassLevel(Number(e.target.value) === 10 ? 10 : 12)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <option value={10}>Class 10</option>
              <option value={12}>Class 12</option>
            </select>
          </label>

          <label className="text-sm font-medium text-navy-700">
            Duration (minutes)
            <input type="number" min={15} max={240} value={durationMinutes} onChange={(e) => setDurationMinutes(Math.max(15, Math.min(240, Number(e.target.value) || 60)))} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm font-medium text-navy-700">
            Question Count
            <input type="number" min={5} max={100} value={questionCount} onChange={(e) => setQuestionCount(Math.max(5, Math.min(100, Number(e.target.value) || 20)))} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          </label>
        </div>

        <button type="button" onClick={startExam} disabled={loading || !subject.trim()} className="mt-6 w-full rounded-xl bg-navy-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50">
          {loading ? 'Starting...' : 'Start Mock Exam'}
        </button>
      </div>
    </div>
  );
}

