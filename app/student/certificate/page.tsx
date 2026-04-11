'use client';

import { useEffect, useState } from 'react';

interface CertificateSummary {
  studentName: string;
  classLevel: 10 | 12;
  rollCode: string;
  generatedAt: string;
  attendancePercentage: number;
  averageGrade: number;
  examsAttempted: number;
  chaptersCompleted: number;
  currentStreak: number;
  longestStreak: number;
  badges: string[];
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function StudentCertificatePage() {
  const [summary, setSummary] = useState<CertificateSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/student/certificate', { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        const data = unwrap<CertificateSummary | null>(body);
        if (!res.ok) {
          if (active) setError((body && typeof body === 'object' && 'message' in body ? String((body as Record<string, unknown>).message) : 'Failed to load certificate data.'));
          return;
        }
        if (active) setSummary(data);
      } catch {
        if (active) setError('Failed to load certificate data.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700">Progress Certificate</h1>
        <p className="mt-1 text-sm text-[#6D6A7C]">Printable summary of your academic progress.</p>

        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {loading && <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-6 text-sm text-[#8A8AAA]">Loading certificate...</div>}

        {!loading && summary && (
          <div className="mt-6 rounded-2xl border-2 border-amber-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[#8A8AAA]">VidyaPath Student Certificate</p>
                <h2 className="mt-1 font-fraunces text-2xl font-bold text-navy-700">{summary.studentName}</h2>
                <p className="text-sm text-[#6D6A7C]">Class {summary.classLevel} • Roll {summary.rollCode}</p>
              </div>
              <button type="button" onClick={() => window.print()} className="rounded-xl bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800">Download / Print</button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl bg-[#F9F7F2] p-4"><p className="text-xs text-[#8A8AAA]">Attendance</p><p className="mt-1 text-xl font-bold text-navy-700">{summary.attendancePercentage}%</p></div>
              <div className="rounded-xl bg-[#F9F7F2] p-4"><p className="text-xs text-[#8A8AAA]">Average Grade</p><p className="mt-1 text-xl font-bold text-navy-700">{summary.averageGrade}%</p></div>
              <div className="rounded-xl bg-[#F9F7F2] p-4"><p className="text-xs text-[#8A8AAA]">Exams Attempted</p><p className="mt-1 text-xl font-bold text-navy-700">{summary.examsAttempted}</p></div>
              <div className="rounded-xl bg-[#F9F7F2] p-4"><p className="text-xs text-[#8A8AAA]">Chapters Completed</p><p className="mt-1 text-xl font-bold text-navy-700">{summary.chaptersCompleted}</p></div>
              <div className="rounded-xl bg-[#F9F7F2] p-4"><p className="text-xs text-[#8A8AAA]">Current Streak</p><p className="mt-1 text-xl font-bold text-navy-700">{summary.currentStreak} days</p></div>
              <div className="rounded-xl bg-[#F9F7F2] p-4"><p className="text-xs text-[#8A8AAA]">Longest Streak</p><p className="mt-1 text-xl font-bold text-navy-700">{summary.longestStreak} days</p></div>
            </div>

            {summary.badges.length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-semibold text-navy-700">Badges</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {summary.badges.map((badge) => (
                    <span key={badge} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                      {badge.replace(/-/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-6 text-xs text-[#8A8AAA]">Generated at: {new Date(summary.generatedAt).toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}

