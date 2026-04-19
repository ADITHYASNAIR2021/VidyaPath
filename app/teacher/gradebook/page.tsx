'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

interface GradebookPack {
  packId: string;
  title: string;
  chapterId: string;
  subject: string;
  classLevel: 10 | 12;
  section?: string;
  status: 'draft' | 'review' | 'published' | 'archived';
}

interface GradebookStudent {
  studentId?: string;
  studentName: string;
  submissionCode: string;
  scores: Record<string, number>;
  attempts: number;
  releasedCount: number;
  overallScore: number;
}

interface GradebookResponse {
  packs: GradebookPack[];
  students: GradebookStudent[];
  summary: {
    students: number;
    packs: number;
    overallAverage: number;
  };
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function GradebookPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<GradebookResponse | null>(null);

  async function loadGradebook() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, gradebookRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher/gradebook', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        setError('Session expired. Please sign in again.');
        return;
      }
      const body = await gradebookRes.json().catch(() => null);
      if (!gradebookRes.ok) {
        setError(body?.message || 'Failed to load gradebook.');
        setData(null);
        return;
      }
      setData(unwrap<GradebookResponse>(body));
    } catch {
      setError('Failed to load gradebook.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGradebook();
  }, []);

  const visiblePacks = useMemo(() => {
    const packs = data?.packs ?? [];
    return packs.slice(0, 8);
  }, [data?.packs]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-amber-600" />
            Gradebook
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Aggregated scores across assignment packs.</p>
        </div>
        <button
          onClick={() => void loadGradebook()}
          disabled={loading}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50 disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </span>
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#7A7490]">Students</p>
          <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{data?.summary.students ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#7A7490]">Packs</p>
          <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{data?.summary.packs ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#7A7490]">Overall Avg</p>
          <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{data?.summary.overallAverage ?? 0}%</p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading gradebook...
        </div>
      ) : !data || data.students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No graded submissions found yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E8E4DC] bg-white shadow-sm">
          <table className="min-w-[920px] w-full">
            <thead>
              <tr className="border-b border-[#E8E4DC] bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Student</th>
                {visiblePacks.map((pack) => (
                  <th key={pack.packId} className="px-3 py-3 text-right text-xs font-semibold text-gray-500">
                    <div>{pack.subject}</div>
                    <div className="text-[10px] font-medium text-gray-400">Class {pack.classLevel}</div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Overall</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((student) => (
                <tr key={`${student.submissionCode}-${student.studentName}`} className="border-b border-[#E8E4DC] last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">{student.studentName}</p>
                    <p className="text-[11px] text-gray-500">{student.submissionCode}</p>
                  </td>
                  {visiblePacks.map((pack) => {
                    const score = student.scores[pack.packId];
                    return (
                      <td key={`${student.submissionCode}-${pack.packId}`} className="px-3 py-3 text-right text-sm">
                        {Number.isFinite(score) ? (
                          <span
                            className={clsx(
                              'rounded-full px-2 py-1 text-xs font-semibold',
                              score >= 75
                                ? 'bg-emerald-50 text-emerald-700'
                                : score >= 50
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-rose-50 text-rose-700'
                            )}
                          >
                            {score}%
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right">
                    <span
                      className={clsx(
                        'rounded-full px-2 py-1 text-xs font-bold',
                        student.overallScore >= 75
                          ? 'bg-emerald-50 text-emerald-700'
                          : student.overallScore >= 50
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                      )}
                    >
                      {student.overallScore}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
