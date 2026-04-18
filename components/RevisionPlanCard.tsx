'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Loader2, Target } from 'lucide-react';

interface PlanWeek {
  week: number;
  focusChapters: string[];
  tasks: string[];
  targetMarks: number;
}

interface RevisionPlanCardProps {
  classLevel: 10 | 12;
  weakChapterIds: string[];
}

export default function RevisionPlanCard({ classLevel, weakChapterIds }: RevisionPlanCardProps) {
  const [studentAiEnabled, setStudentAiEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [planWeeks, setPlanWeeks] = useState<PlanWeek[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
          ? payload.data as Record<string, unknown>
          : payload as Record<string, unknown> | null;
        const role = typeof data?.role === 'string' ? data.role : '';
        if (active) setStudentAiEnabled(['student', 'teacher', 'admin', 'developer'].includes(role));
      })
      .catch(() => {
        if (active) setStudentAiEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function generatePlan() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/revision-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classLevel,
          weeklyHours: 8,
          weakChapterIds: weakChapterIds.slice(0, 6),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.planWeeks)) {
        setError(data.error || 'Could not generate revision plan right now.');
        return;
      }
      setPlanWeeks(data.planWeeks as PlanWeek[]);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (studentAiEnabled === false) {
    return (
      <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
        <h2 className="font-fraunces text-base font-bold text-navy-700 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-500" />
          Adaptive Revision Plan
        </h2>
        <p className="mt-2 text-sm text-[#4A4A6A]">
          Revision AI is available only for logged-in student accounts.
        </p>
        <Link
          href="/login?portal=student&next=/dashboard"
          className="mt-3 inline-flex items-center rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Login
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-fraunces text-base font-bold text-navy-700 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-500" />
          Adaptive Revision Plan
        </h2>
        <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
          Class {classLevel}
        </span>
      </div>

      <p className="text-xs text-[#6A6A84] mb-3">
        Generate a week-wise plan focused on weak and high-yield chapters.
      </p>

      <button
        onClick={generatePlan}
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
        {loading ? 'Generating Plan...' : 'Generate Plan'}
      </button>

      {error && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">
          {error}
        </div>
      )}

      {planWeeks && planWeeks.length > 0 && (
        <div className="mt-3 space-y-2">
          {planWeeks.slice(0, 3).map((week) => (
            <div key={week.week} className="rounded-xl border border-indigo-100 bg-indigo-50 p-2.5">
              <div className="text-xs font-semibold text-indigo-800">
                Week {week.week} | Target {week.targetMarks} marks
              </div>
              <div className="text-[11px] text-indigo-700 mt-0.5 truncate">
                Focus: {week.focusChapters.join(', ')}
              </div>
              <div className="text-[11px] text-indigo-700 mt-0.5 truncate">
                {week.tasks.slice(0, 2).join(' | ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
