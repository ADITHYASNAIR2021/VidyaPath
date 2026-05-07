'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Printer, RefreshCw } from 'lucide-react';

interface AnalyticsPayload {
  generatedAt: string;
  schoolId: string;
  overview: {
    totalTeachers: number;
    activeTeachers: number;
    activeStudents: number;
    assignmentCompletionsThisWeek: number;
    topWeakTopics: Array<{ topic: string; count: number }>;
    scopesBySubject: Array<{ subject: string; count: number }>;
  };
  dailyActiveStudents7d: Array<{ date: string; activeStudents: number }>;
  assignmentCompletionFunnel: {
    assigned: number;
    submitted: number;
    reviewed: number;
    released: number;
  };
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function AdminAnalyticsReportPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsPayload | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/analytics', { cache: 'no-store' });
      const body = unwrap<AnalyticsPayload | null>(await res.json().catch(() => null));
      if (res.ok && body) setData(body);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-6 print:p-0">
      <div className="mb-5 flex items-center justify-between print:hidden">
        <Link href="/admin/analytics" className="text-sm font-semibold text-indigo-700 hover:text-indigo-800">Back to analytics</Link>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">
            <span className="inline-flex items-center gap-1"><RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />Refresh</span>
          </button>
          <button onClick={() => window.print()} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
            <span className="inline-flex items-center gap-1"><Printer className="h-3.5 w-3.5" />Print / Save PDF</span>
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
        <h1 className="font-fraunces text-2xl font-bold text-[#1C1C2E]">School Analytics Report</h1>
        <p className="mt-1 text-xs text-gray-500">Generated: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '-'}</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <p className="text-sm">Total teachers: <span className="font-semibold">{data?.overview.totalTeachers ?? 0}</span></p>
          <p className="text-sm">Active teachers: <span className="font-semibold">{data?.overview.activeTeachers ?? 0}</span></p>
          <p className="text-sm">Active students: <span className="font-semibold">{data?.overview.activeStudents ?? 0}</span></p>
          <p className="text-sm">Completions this week: <span className="font-semibold">{data?.overview.assignmentCompletionsThisWeek ?? 0}</span></p>
        </div>

        <h2 className="mt-6 text-sm font-semibold text-gray-800">Daily Active Students (7 days)</h2>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-600">
              <th className="py-1">Date</th>
              <th className="py-1">Active Students</th>
            </tr>
          </thead>
          <tbody>
            {(data?.dailyActiveStudents7d || []).map((row) => (
              <tr key={row.date} className="border-b border-gray-100">
                <td className="py-1">{new Date(row.date).toLocaleDateString()}</td>
                <td className="py-1">{row.activeStudents}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-6 text-sm font-semibold text-gray-800">Assignment Funnel</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <p>Assigned: <span className="font-semibold">{data?.assignmentCompletionFunnel.assigned ?? 0}</span></p>
          <p>Submitted: <span className="font-semibold">{data?.assignmentCompletionFunnel.submitted ?? 0}</span></p>
          <p>Reviewed: <span className="font-semibold">{data?.assignmentCompletionFunnel.reviewed ?? 0}</span></p>
          <p>Released: <span className="font-semibold">{data?.assignmentCompletionFunnel.released ?? 0}</span></p>
        </div>
      </div>
    </div>
  );
}
