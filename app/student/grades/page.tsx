'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

interface Grade {
  submissionId: string;
  packId: string;
  chapterId: string;
  subject: string;
  classLevel: number;
  section: string;
  score: number;
  status: 'released' | 'graded' | 'submitted' | 'pending_review';
  releasedAt: string;
  createdAt: string;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function subjectBadgeClass(subject: string): string {
  switch (subject.toLowerCase()) {
    case 'physics':     return 'bg-sky-100 text-sky-800';
    case 'chemistry':   return 'bg-emerald-100 text-emerald-800';
    case 'biology':     return 'bg-green-100 text-green-800';
    case 'math':
    case 'mathematics': return 'bg-purple-100 text-purple-800';
    default:            return 'bg-indigo-100 text-indigo-800';
  }
}

function statusBadge(status: Grade['status']): { label: string; cls: string } {
  switch (status) {
    case 'released':          return { label: 'Released', cls: 'bg-green-100 text-green-800' };
    case 'graded':           return { label: 'Graded',   cls: 'bg-amber-100 text-amber-800' };
    case 'submitted':        return { label: 'Submitted', cls: 'bg-blue-100 text-blue-800' };
    case 'pending_review':   return { label: 'Pending',  cls: 'bg-gray-100 text-gray-600' };
  }
}

export default function StudentGradesPage() {
  const [grades, setGrades]     = useState<Grade[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [filter, setFilter]     = useState('All Subjects');
  const [newGradesCount, setNewGradesCount] = useState(0);

  const fetchGrades = useCallback(async () => {
    setLoading(true);
    setError('');
    setNewGradesCount(0);
    try {
      const [sessionRes, summaryRes] = await Promise.all([
        fetch('/api/student/session/me', { cache: 'no-store' }),
        fetch('/api/student/notifications/summary', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        setError('Session expired. Please sign in again.');
        return;
      }
      if (summaryRes.ok) {
        const summaryBody = await summaryRes.json().catch(() => null);
        const summary = unwrap<{ newGradesCount?: number } | null>(summaryBody);
        setNewGradesCount(Math.max(0, Number(summary?.newGradesCount) || 0));
      } else {
        setNewGradesCount(0);
      }

      const res  = await fetch('/api/student/grades', { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          body && typeof body === 'object' && 'message' in body
            ? String((body as Record<string, unknown>).message)
            : 'Failed to load grades.'
        );
        return;
      }
      const data = unwrap<{ grades: Grade[] } | null>(body);
      setGrades(Array.isArray(data?.grades) ? data.grades : []);
    } catch {
      setError('Failed to load grades.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGrades();
  }, [fetchGrades]);

  const uniqueSubjects = useMemo(
    () => ['All Subjects', ...Array.from(new Set(grades.map((g) => g.subject))).sort()],
    [grades]
  );

  const releasedGrades = useMemo(
    () => grades.filter((g) => g.status === 'released'),
    [grades]
  );

  const average = useMemo(() => {
    if (releasedGrades.length === 0) return 0;
    const sum = releasedGrades.reduce((acc, g) => acc + g.score, 0);
    return Math.round(sum / releasedGrades.length);
  }, [releasedGrades]);

  const filtered = useMemo(() => {
    const list = filter === 'All Subjects' ? grades : grades.filter((g) => g.subject === filter);
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [grades, filter]);

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-4xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-fraunces text-2xl font-bold text-navy-700">My Grades</h1>
            <p className="mt-1 text-sm text-[#6D6A7C]">View scores and feedback for your submitted assignments.</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchGrades()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-[#E8E4DC] bg-white px-3 py-2 text-sm text-[#6D6A7C] hover:bg-[#F7F3EE] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!loading && !error && newGradesCount > 0 && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            New results available: {newGradesCount} grade{newGradesCount === 1 ? '' : 's'} released in the last 7 days.
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-[#E8E4DC] bg-white p-6 text-sm text-[#8A8AAA]">
            <RefreshCw className="w-5 h-5 animate-spin" />
            Loading grades…
          </div>
        )}

        {!loading && (
          <>
            {/* Summary row */}
            <div className="mt-5 rounded-2xl border border-[#E8E4DC] bg-white shadow-sm p-5">
              <p className="text-sm text-[#6D6A7C]">
                <span className="font-semibold text-navy-700">{releasedGrades.length}</span>{' '}
                assignment{releasedGrades.length !== 1 ? 's' : ''} graded
                {releasedGrades.length > 0 && (
                  <>
                    {' '}•{' '}
                    <span className="font-semibold text-navy-700">Average: {average}%</span>
                  </>
                )}
              </p>
            </div>

            {/* Filter */}
            <div className="mt-4 flex items-center gap-2">
              <label htmlFor="subject-filter" className="text-xs uppercase tracking-wide text-[#8A8AAA]">
                Filter
              </label>
              <select
                id="subject-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="rounded-xl border border-[#E8E4DC] bg-white px-3 py-1.5 text-sm text-navy-700 focus:outline-none"
              >
                {uniqueSubjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Empty state */}
            {filtered.length === 0 && (
              <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-8 text-center text-sm text-[#8A8AAA]">
                No grades found
                {filter !== 'All Subjects' ? ` for ${filter}` : ''}.
              </div>
            )}

            {/* Grade list */}
            {filtered.length > 0 && (
              <div className="mt-4 flex flex-col gap-3">
                {filtered.map((grade) => {
                  const status = statusBadge(grade.status);
                  const scoreVisible = grade.status === 'released';
                  return (
                    <div
                      key={grade.submissionId}
                      className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {/* Left: chapter + subject */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#F0EDE6] px-2.5 py-0.5 font-mono text-xs text-[#5A5570]">
                            {grade.chapterId}
                          </span>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${subjectBadgeClass(grade.subject)}`}>
                            {grade.subject}
                          </span>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.cls}`}>
                            {status.label}
                          </span>
                        </div>

                        {/* Right: score */}
                        <div className="flex items-baseline gap-1">
                          {scoreVisible ? (
                            <>
                              <span className="text-2xl font-bold text-navy-700">{grade.score}</span>
                              <span className="text-sm text-[#8A8AAA]">/100</span>
                            </>
                          ) : (
                            <span className="text-2xl font-bold text-[#C5C1D4]">—</span>
                          )}
                        </div>
                      </div>

                      {/* Date */}
                      <p className="mt-2 text-xs text-[#8A8AAA]">
                        Submitted {new Date(grade.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
