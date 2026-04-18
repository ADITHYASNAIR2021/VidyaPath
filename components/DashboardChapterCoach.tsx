'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, Target } from 'lucide-react';

interface DashboardChapterCoachProps {
  chapterId: string;
  chapterTitle: string;
  quizScore: number | null;
  flashcardsDue: number;
  studied: boolean;
  bookmarked: boolean;
}

interface DiagnoseData {
  riskLevel: 'low' | 'medium' | 'high';
  weakTags: string[];
  nextActions: string[];
}

interface RemediateData {
  expectedScoreLift: string;
  dayPlan: Array<{ day: number; focus: string }>;
}

export default function DashboardChapterCoach({
  chapterId,
  chapterTitle,
  quizScore,
  flashcardsDue,
  studied,
  bookmarked,
}: DashboardChapterCoachProps) {
  const [studentAiEnabled, setStudentAiEnabled] = useState<boolean | null>(null);
  const [diagnose, setDiagnose] = useState<DiagnoseData | null>(null);
  const [remediate, setRemediate] = useState<RemediateData | null>(null);
  const [loadingDiagnose, setLoadingDiagnose] = useState(false);
  const [loadingRemediate, setLoadingRemediate] = useState(false);

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

  async function runDiagnose() {
    setLoadingDiagnose(true);
    try {
      const response = await fetch('/api/chapter-diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId,
          quizScore,
          flashcardsDue,
          studied,
          bookmarked,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) return;
      setDiagnose({
        riskLevel: data.riskLevel,
        weakTags: Array.isArray(data.weakTags) ? data.weakTags.slice(0, 3) : [],
        nextActions: Array.isArray(data.nextActions) ? data.nextActions.slice(0, 2) : [],
      });
    } finally {
      setLoadingDiagnose(false);
    }
  }

  async function runRemediate() {
    setLoadingRemediate(true);
    try {
      const response = await fetch('/api/chapter-remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId,
          weakTags: diagnose?.weakTags ?? [],
          availableDays: 7,
          dailyMinutes: 45,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) return;
      setRemediate({
        expectedScoreLift: typeof data.expectedScoreLift === 'string' ? data.expectedScoreLift : 'Estimated gain unavailable',
        dayPlan: Array.isArray(data.dayPlan)
          ? (data.dayPlan as unknown[])
              .map((item): { day: number; focus: string } | null => {
                if (!item || typeof item !== 'object') return null;
                const row = item as Record<string, unknown>;
                return {
                  day: Number(row.day),
                  focus: String(row.focus ?? ''),
                };
              })
              .filter(
                (item: { day: number; focus: string } | null): item is { day: number; focus: string } =>
                  item !== null && Number.isFinite(item.day) && item.focus.length > 0
              )
              .slice(0, 3)
          : [],
      });
    } finally {
      setLoadingRemediate(false);
    }
  }

  if (studentAiEnabled === false) {
    return (
      <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
        <h2 className="font-fraunces text-base font-bold text-navy-700 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500" />
          Chapter Coach
        </h2>
        <p className="text-sm text-[#4A4A6A]">
          Chapter coach AI is available only for logged-in student accounts.
        </p>
        <Link
          href="/login?portal=student&next=/dashboard"
          className="mt-3 inline-flex rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Login
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
      <h2 className="font-fraunces text-base font-bold text-navy-700 mb-2 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-rose-500" />
        Chapter Coach
      </h2>
      <p className="text-xs text-[#6A6A84] mb-3">
        Focus chapter: {chapterTitle}
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={runDiagnose}
          disabled={loadingDiagnose}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-2 rounded-lg hover:bg-rose-100 disabled:opacity-60"
        >
          {loadingDiagnose ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          Diagnose
        </button>
        <button
          onClick={runRemediate}
          disabled={loadingRemediate}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-2 rounded-lg hover:bg-emerald-100 disabled:opacity-60"
        >
          {loadingRemediate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Target className="w-3.5 h-3.5" />}
          7-Day Plan
        </button>
      </div>

      {diagnose && (
        <div className="mb-3 rounded-xl border border-rose-100 bg-rose-50 p-2.5">
          <p className="text-xs font-semibold text-rose-800">
            Risk: {diagnose.riskLevel.toUpperCase()}
          </p>
          <p className="text-xs text-rose-700 mt-0.5">
            {diagnose.weakTags.join(' | ')}
          </p>
        </div>
      )}

      {remediate && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-2.5">
          <p className="text-xs font-semibold text-emerald-800">
            Expected lift: {remediate.expectedScoreLift}
          </p>
          <div className="mt-1 space-y-1">
            {remediate.dayPlan.map((day) => (
              <p key={`${day.day}-${day.focus}`} className="text-xs text-emerald-700">
                Day {day.day}: {day.focus}
              </p>
            ))}
          </div>
        </div>
      )}

      <Link
        href={`/chapters/${chapterId}`}
        className="mt-3 inline-flex text-xs font-semibold text-indigo-700 hover:text-indigo-800"
      >
        Open full chapter intelligence
      </Link>
    </div>
  );
}
