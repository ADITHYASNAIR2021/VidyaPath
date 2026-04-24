'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Package, RefreshCw } from 'lucide-react';
import type { TeacherAssignmentPack } from '@/lib/teacher-types';

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function formatDate(value?: string): string {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function StudentAssignmentsPage() {
  const [assignments, setAssignments] = useState<TeacherAssignmentPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/student/assignments', { cache: 'no-store' });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          body && typeof body === 'object' && 'message' in (body as Record<string, unknown>)
            ? String((body as Record<string, unknown>).message)
            : 'Failed to load assignments.';
        setError(message);
        return;
      }
      const data = unwrap<{ assignments?: TeacherAssignmentPack[] } | null>(body);
      setAssignments(Array.isArray(data?.assignments) ? data.assignments : []);
    } catch {
      setError('Failed to load assignments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedAssignments = useMemo(() => {
    return [...assignments].sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [assignments]);

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-fraunces text-2xl font-bold text-navy-700">Assignments</h1>
            <p className="mt-1 text-sm text-[#6D6A7C]">Published teacher assignment packs for your class.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-[#E8E4DC] bg-white px-3 py-2 text-sm text-[#6D6A7C] hover:bg-[#F7F3EE] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-[#E8E4DC] bg-white p-6 text-sm text-[#8A8AAA]">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading assignments...
          </div>
        )}

        {!loading && !error && sortedAssignments.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-[#D8D3CC] bg-white p-10 text-center text-sm text-[#8A8AAA]">
            <Package className="mx-auto mb-3 h-9 w-9 text-[#BDB8CC]" />
            No published assignments available right now.
          </div>
        )}

        {!loading && sortedAssignments.length > 0 && (
          <div className="mt-6 space-y-3">
            {sortedAssignments.map((assignment) => (
              <article
                key={assignment.packId}
                className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    {assignment.subject}
                  </span>
                  {assignment.section && (
                    <span className="rounded-full bg-[#F0EDE6] px-2.5 py-0.5 text-xs font-semibold text-[#5A5570]">
                      Section {assignment.section}
                    </span>
                  )}
                  <span className="rounded-full bg-[#F0EDE6] px-2.5 py-0.5 text-xs font-mono text-[#5A5570]">
                    {assignment.chapterId}
                  </span>
                </div>

                <h2 className="mt-2 text-base font-semibold text-[#1E1B2E]">{assignment.title}</h2>

                <p className="mt-1 text-sm text-[#6D6A7C]">
                  {assignment.questionCount} questions
                  {assignment.estimatedTimeMinutes > 0 ? ` | ${assignment.estimatedTimeMinutes} min` : ''}
                </p>

                {assignment.portion && (
                  <p className="mt-1 text-sm text-[#534F66]">Portion: {assignment.portion}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[#8A8AAA]">Due: {formatDate(assignment.dueDate)}</p>
                  <Link
                    href={`/practice/assignment/${encodeURIComponent(assignment.packId)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800"
                  >
                    Open Assignment
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
