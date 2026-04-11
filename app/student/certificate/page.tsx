'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, Award, Star, CheckCircle, Flame, BookOpen, ClipboardCheck } from 'lucide-react';

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

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

const BADGE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  'first-submission': { label: 'First Submission', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  'week-warrior': { label: 'Week Warrior', icon: <Flame className="h-3.5 w-3.5" /> },
  'top-scorer': { label: 'Top Scorer', icon: <Star className="h-3.5 w-3.5" /> },
  'bookworm': { label: 'Bookworm', icon: <BookOpen className="h-3.5 w-3.5" /> },
  'perfect-attendance': { label: 'Perfect Attendance', icon: <ClipboardCheck className="h-3.5 w-3.5" /> },
};

function BadgeChip({ badge }: { badge: string }) {
  const meta = BADGE_META[badge] ?? {
    label: badge.replace(/-/g, ' '),
    icon: <Award className="h-3.5 w-3.5" />,
  };
  return (
    <span className="print-badge flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold capitalize text-amber-800">
      {meta.icon}
      {meta.label}
    </span>
  );
}

interface StatBoxProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

function StatBox({ label, value, icon }: StatBoxProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-[#E8E4DC] bg-[#FDFAF6] px-4 py-4 text-center print:border-amber-200 print:bg-amber-50/30">
      <span className="text-amber-500">{icon}</span>
      <span className="text-xl font-bold text-navy-700">{value}</span>
      <span className="text-xs uppercase tracking-wide text-[#8A8AAA]">{label}</span>
    </div>
  );
}

export default function StudentCertificatePage() {
  const router = useRouter();
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
        if (res.status === 401) {
          router.push('/student/login');
          return;
        }
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const msg =
            body && typeof body === 'object' && 'message' in (body as Record<string, unknown>)
              ? String((body as Record<string, unknown>).message)
              : 'Failed to load certificate data.';
          if (active) setError(msg);
          return;
        }
        const data = unwrap<CertificateSummary>(body);
        if (active) setSummary(data);
      } catch {
        if (active) setError('Failed to load certificate data.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { background: white !important; padding: 0 !important; }
          .certificate-card {
            box-shadow: none !important;
            border: 2px solid #d97706 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
        }
      `}</style>

      <div className="print-page min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
        <div className="mx-auto max-w-3xl">
          {/* Page header — hidden on print */}
          <div className="no-print flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-fraunces text-2xl font-bold text-navy-700">
                Progress Certificate
              </h1>
              <p className="mt-1 text-sm text-[#6D6A7C]">
                A printable summary of your academic journey.
              </p>
            </div>
            {summary && (
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-xl bg-navy-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-navy-800 transition-colors"
              >
                <Printer className="h-4 w-4" />
                Download / Print
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="mt-6 h-96 animate-pulse rounded-2xl border border-[#E8E4DC] bg-white" />
          )}

          {/* Certificate */}
          {!loading && summary && (
            <div className="certificate-card mt-6 rounded-2xl border-2 border-amber-300 bg-white shadow-lg overflow-hidden">
              {/* Top amber accent bar */}
              <div className="h-2 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400" />

              <div className="px-8 py-10 md:px-12">
                {/* Logo + title */}
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Award className="h-7 w-7 text-amber-500" />
                    <span className="font-fraunces text-3xl font-bold text-navy-700">
                      VidyaPath
                    </span>
                  </div>
                  <p className="mt-1 text-sm uppercase tracking-[0.18em] text-[#8A8AAA] font-medium">
                    Academic Progress Certificate
                  </p>
                </div>

                {/* Amber divider */}
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-amber-200" />
                  <Star className="h-4 w-4 text-amber-400 fill-amber-300" />
                  <div className="h-px flex-1 bg-amber-200" />
                </div>

                {/* Certificate body */}
                <div className="text-center">
                  <p className="text-sm italic text-[#6D6A7C]">This certifies that</p>
                  <h2 className="mt-3 font-fraunces text-4xl font-bold text-navy-700 leading-tight">
                    {summary.studentName}
                  </h2>
                  <p className="mt-2 text-sm font-medium text-[#6D6A7C]">
                    Class {summary.classLevel} &nbsp;|&nbsp; Roll Code: {summary.rollCode}
                  </p>
                  <p className="mt-3 text-sm text-[#6D6A7C] max-w-sm mx-auto leading-relaxed">
                    has demonstrated outstanding academic progress on the{' '}
                    <span className="font-semibold text-navy-700">VidyaPath</span> learning
                    platform.
                  </p>
                </div>

                {/* Amber divider */}
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-amber-200" />
                  <div className="h-2 w-2 rounded-full bg-amber-300" />
                  <div className="h-px flex-1 bg-amber-200" />
                </div>

                {/* Stats grid 2x3 */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatBox
                    label="Attendance"
                    value={`${summary.attendancePercentage}%`}
                    icon={<ClipboardCheck className="h-5 w-5" />}
                  />
                  <StatBox
                    label="Average Grade"
                    value={`${summary.averageGrade}%`}
                    icon={<Star className="h-5 w-5" />}
                  />
                  <StatBox
                    label="Exams Attempted"
                    value={String(summary.examsAttempted)}
                    icon={<BookOpen className="h-5 w-5" />}
                  />
                  <StatBox
                    label="Chapters Completed"
                    value={String(summary.chaptersCompleted)}
                    icon={<CheckCircle className="h-5 w-5" />}
                  />
                  <StatBox
                    label="Current Streak"
                    value={`${summary.currentStreak} days`}
                    icon={<Flame className="h-5 w-5" />}
                  />
                  <StatBox
                    label="Longest Streak"
                    value={`${summary.longestStreak} days`}
                    icon={<Award className="h-5 w-5" />}
                  />
                </div>

                {/* Badges */}
                {summary.badges.length > 0 && (
                  <div className="mt-6">
                    <p className="text-center text-xs uppercase tracking-wide text-[#8A8AAA] font-medium mb-3">
                      Achievements Earned
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {summary.badges.map((badge) => (
                        <BadgeChip key={badge} badge={badge} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom divider + seal */}
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-amber-200" />
                  <Star className="h-4 w-4 text-amber-400 fill-amber-300" />
                  <div className="h-px flex-1 bg-amber-200" />
                </div>

                <div className="text-center">
                  <p className="text-xs text-[#8A8AAA]">
                    Generated on{' '}
                    {new Date(summary.generatedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="mt-1 text-xs font-medium text-[#8A8AAA] tracking-wide uppercase">
                    Issued by VidyaPath Learning Platform
                  </p>
                  {/* Watermark seal */}
                  <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5">
                    <Award className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-700 tracking-wide">
                      VidyaPath Certified
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom amber accent bar */}
              <div className="h-2 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400" />
            </div>
          )}

          {/* Print button at bottom — visible on screen only */}
          {!loading && summary && (
            <div className="no-print mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-xl border border-[#E8E4DC] bg-white px-5 py-2.5 text-sm font-semibold text-[#3D3A4E] shadow-sm hover:bg-[#F9F7F2] transition-colors"
              >
                <Printer className="h-4 w-4" />
                Print Certificate
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
