'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Target, Trophy, BrainCircuit, Activity, BookOpen, ChevronRight,
  TrendingUp, Zap, CheckCircle2, Clock, Star, Award, BarChart2,
  Atom, FlaskConical, Leaf, Calculator, FileText,
} from 'lucide-react';
import clsx from 'clsx';
import { ALL_CHAPTERS } from '@/lib/data';
import { useProgressStore, useBookmarkStore } from '@/lib/store';
import { getPaperStats } from '@/lib/papers';

// ── SVG Progress Ring ─────────────────────────────────────────
function ProgressRing({
  pct, size = 80, stroke = 7, color = '#E8511A',
}: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F0EDE8" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
    </svg>
  );
}

// ── Subject ring card ─────────────────────────────────────────
const SUBJECT_META = {
  Physics:   { icon: Atom,        color: '#0284c7', ring: '#0ea5e9', bg: 'bg-sky-50 border-sky-100',     label: 'Physics' },
  Chemistry: { icon: FlaskConical, color: '#059669', ring: '#10b981', bg: 'bg-emerald-50 border-emerald-100', label: 'Chemistry' },
  Biology:   { icon: Leaf,        color: '#16a34a', ring: '#22c55e', bg: 'bg-green-50 border-green-100',  label: 'Biology' },
  Math:      { icon: Calculator,  color: '#7c3aed', ring: '#a855f7', bg: 'bg-purple-50 border-purple-100', label: 'Math' },
} as const;

function SubjectCard({
  subject, studied, total,
}: { subject: keyof typeof SUBJECT_META; studied: number; total: number }) {
  const meta = SUBJECT_META[subject];
  const Icon = meta.icon;
  const pct = total > 0 ? Math.round((studied / total) * 100) : 0;
  return (
    <div className={clsx('rounded-2xl border p-4 flex items-center gap-4', meta.bg)}>
      <div className="relative flex-shrink-0">
        <ProgressRing pct={pct} size={68} stroke={6} color={meta.ring} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="w-5 h-5" style={{ color: meta.color }} />
        </div>
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-navy-700 text-sm">{meta.label}</div>
        <div className="text-2xl font-bold mt-0.5" style={{ color: meta.color }}>
          {pct}<span className="text-base font-medium text-[#8A8AAA]">%</span>
        </div>
        <div className="text-xs text-[#8A8AAA]">{studied} / {total} chapters</div>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub, color, href,
}: { icon: React.ElementType; label: string; value: string | number; sub?: string; color: string; href?: string }) {
  const inner = (
    <div className={clsx('bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5 hover:shadow-md transition-shadow group', href && 'cursor-pointer')}>
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center mb-3', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="text-3xl font-bold text-navy-700 leading-none">{value}</div>
      <div className="text-sm font-medium text-[#4A4A6A] mt-1">{label}</div>
      {sub && <div className="text-xs text-[#8A8AAA] mt-0.5">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ── Class progress bar ────────────────────────────────────────
function ClassBar({ cls, studied, total }: { cls: number; studied: number; total: number }) {
  const pct = total > 0 ? Math.round((studied / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm font-medium mb-1.5">
        <span className="text-navy-700">Class {cls}</span>
        <span className="text-[#8A8AAA]">{studied}/{total} chapters</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className={clsx('h-full rounded-full', cls === 10 ? 'bg-emerald-500' : 'bg-sky-500')}
        />
      </div>
      <div className="text-xs text-[#8A8AAA] mt-1">{pct}% complete</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [quizzesTaken, setQuizzesTaken] = useState(0);
  const [avgQuizScore, setAvgQuizScore] = useState(0);
  const [cardsDue, setCardsDue] = useState(0);
  const { studiedChapterIds } = useProgressStore();
  const { bookmarkedChapterIds } = useBookmarkStore();
  const eligibleChapters = useMemo(() => ALL_CHAPTERS.filter((c) => c.classLevel !== 11), []);
  const chapterById = useMemo(() => new Map(eligibleChapters.map((chapter) => [chapter.id, chapter])), [eligibleChapters]);

  const paperStats = useMemo(() => getPaperStats(), []);

  // Compute progress by subject and class
  const subjectProgress = useMemo(() => {
    const result: Record<string, { studied: number; total: number }> = {
      Physics: { studied: 0, total: 0 },
      Chemistry: { studied: 0, total: 0 },
      Biology: { studied: 0, total: 0 },
      Math: { studied: 0, total: 0 },
    };
    const classProgress: Record<number, { studied: number; total: number }> = {
      10: { studied: 0, total: 0 },
      12: { studied: 0, total: 0 },
    };
    for (const ch of eligibleChapters) {
      result[ch.subject].total++;
      if (studiedChapterIds.includes(ch.id)) result[ch.subject].studied++;
      if (classProgress[ch.classLevel]) {
        classProgress[ch.classLevel].total++;
        if (studiedChapterIds.includes(ch.id)) classProgress[ch.classLevel].studied++;
      }
    }
    return { bySubject: result, byClass: classProgress };
  }, [eligibleChapters, studiedChapterIds]);

  const totalChapters = eligibleChapters.length;
  const studiedCount = studiedChapterIds.filter((id) => chapterById.has(id)).length;
  const overallPct = totalChapters > 0 ? Math.round((studiedCount / totalChapters) * 100) : 0;

  // Recent studied (last 5)
  const recentStudied = useMemo(() => {
    return studiedChapterIds
      .map((id) => chapterById.get(id))
      .filter(Boolean)
      .slice(-5)
      .reverse() as typeof ALL_CHAPTERS;
  }, [chapterById, studiedChapterIds]);

  // Suggested next (bookmarked but not studied)
  const suggested = useMemo(() => {
    return bookmarkedChapterIds
      .filter((id) => !studiedChapterIds.includes(id))
      .map((id) => chapterById.get(id))
      .filter(Boolean)
      .slice(0, 3) as typeof ALL_CHAPTERS;
  }, [bookmarkedChapterIds, chapterById, studiedChapterIds]);

  useEffect(() => {
    setMounted(true);
    let quizSum = 0, quizCount = 0, due = 0;
    const now = new Date();
    for (const ch of eligibleChapters) {
      const score = localStorage.getItem(`quiz-score-[${ch.id}]`);
      if (score) { quizCount++; quizSum += parseInt(score, 10); }
      if (ch.flashcards) {
        for (let idx = 0; idx < ch.flashcards.length; idx++) {
          const s = localStorage.getItem(`fsrs-[${ch.id}]-${idx}`);
          if (s) {
            try { if (new Date(JSON.parse(s).due) <= now) due++; }
            catch { due++; }
          } else { due++; }
        }
      }
    }
    setQuizzesTaken(quizCount);
    setAvgQuizScore(quizCount > 0 ? Math.round(quizSum / quizCount) : 0);
    setCardsDue(due);
  }, [eligibleChapters]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#FDFAF6] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-saffron-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-navy-700 to-navy-900 text-white px-4 pt-12 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-saffron-500/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="text-white/60 text-sm font-medium mb-1">Welcome back</div>
              <h1 className="font-fraunces text-3xl sm:text-4xl font-bold leading-tight">My Dashboard</h1>
              <p className="text-white/70 mt-1.5 text-sm">Your progress is stored locally — no account needed.</p>
            </div>
            {/* Overall ring */}
            <div className="flex items-center gap-4 bg-white/10 border border-white/15 rounded-2xl px-5 py-3">
              <div className="relative">
                <ProgressRing pct={overallPct} size={72} stroke={7} color="#F97316" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">{overallPct}%</span>
                </div>
              </div>
              <div>
                <div className="text-white font-semibold">{studiedCount} / {totalChapters}</div>
                <div className="text-white/60 text-xs">chapters studied</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-6 relative z-10 pb-12">

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Target}     label="Chapters Studied" value={studiedCount}    sub={`of ${totalChapters} total`}    color="bg-emerald-500" href="/chapters" />
          <StatCard icon={Star}       label="Bookmarked"       value={bookmarkedChapterIds.length} sub="saved chapters"       color="bg-amber-500"  href="/bookmarks" />
          <StatCard icon={Activity}   label="Quizzes Taken"    value={quizzesTaken}   sub={avgQuizScore > 0 ? `avg ${avgQuizScore}%` : '—'} color="bg-sky-500" />
          <StatCard icon={BrainCircuit} label="Flashcards Due" value={cardsDue}       sub="review today"                    color="bg-purple-500" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">

          {/* ── LEFT 2/3 ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Subject rings */}
            <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
              <h2 className="font-fraunces text-lg font-bold text-navy-700 mb-4 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-saffron-500" />
                Progress by Subject
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {(Object.keys(SUBJECT_META) as Array<keyof typeof SUBJECT_META>).map((subj) => (
                  <SubjectCard
                    key={subj}
                    subject={subj}
                    studied={subjectProgress.bySubject[subj]?.studied ?? 0}
                    total={subjectProgress.bySubject[subj]?.total ?? 0}
                  />
                ))}
              </div>
            </div>

            {/* Class breakdown */}
            <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
              <h2 className="font-fraunces text-lg font-bold text-navy-700 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-saffron-500" />
                Progress by Class
              </h2>
              <div className="space-y-5">
                <ClassBar cls={10} studied={subjectProgress.byClass[10]?.studied ?? 0} total={subjectProgress.byClass[10]?.total ?? 0} />
                <ClassBar cls={12} studied={subjectProgress.byClass[12]?.studied ?? 0} total={subjectProgress.byClass[12]?.total ?? 0} />
              </div>
            </div>

            {/* Recent activity */}
            {recentStudied.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
                <h2 className="font-fraunces text-lg font-bold text-navy-700 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-saffron-500" />
                  Recently Studied
                </h2>
                <ul className="space-y-2">
                  {recentStudied.map((ch) => (
                    <li key={ch.id}>
                      <Link
                        href={`/chapters/${ch.id}`}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
                      >
                        <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-navy-700 truncate">{ch.title}</div>
                          <div className="text-xs text-[#8A8AAA]">{ch.subject} · Class {ch.classLevel}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-saffron-500 transition-colors flex-shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── RIGHT 1/3 ── */}
          <div className="space-y-5">

            {/* Motivational card */}
            <div className="bg-gradient-to-br from-saffron-500 to-saffron-600 text-white rounded-2xl p-5">
              <Zap className="w-7 h-7 text-white/80 mb-3" />
              <div className="font-fraunces text-xl font-bold mb-1 leading-tight">
                {overallPct === 0 ? 'Start your journey!' : overallPct < 30 ? 'Great start!' : overallPct < 60 ? 'Keep going!' : overallPct < 90 ? 'Almost there!' : 'Champion!'}
              </div>
              <p className="text-white/80 text-sm leading-relaxed">
                {studiedCount === 0
                  ? 'Pick a chapter and mark it as studied to track your progress here.'
                  : `You\'ve studied ${studiedCount} chapter${studiedCount !== 1 ? 's' : ''}. ${totalChapters - studiedCount} more to go — you\'re doing great!`}
              </p>
              <Link
                href="/chapters"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl transition-colors"
              >
                <BookOpen className="w-4 h-4" /> Browse Chapters
              </Link>
            </div>

            {/* Suggested chapters (bookmarked, not studied) */}
            {suggested.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
                <h2 className="font-fraunces text-base font-bold text-navy-700 mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  Study Next
                </h2>
                <p className="text-xs text-[#8A8AAA] mb-3">Bookmarked but not yet studied:</p>
                <ul className="space-y-2">
                  {suggested.map((ch) => (
                    <li key={ch.id}>
                      <Link
                        href={`/chapters/${ch.id}`}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-amber-50 transition-colors group"
                      >
                        <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-navy-700 truncate">{ch.title}</div>
                          <div className="text-[10px] text-[#8A8AAA]">Class {ch.classLevel} · {ch.subject}</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-amber-500 flex-shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Papers quick link */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span className="font-semibold text-indigo-700 text-sm">Previous Year Papers</span>
              </div>
              <p className="text-xs text-indigo-600/80 mb-3 leading-relaxed">
                {paperStats.board} board exam papers · {paperStats.sample} sample papers · 17 years covered
              </p>
              <Link
                href="/papers"
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 text-white px-3.5 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                <Award className="w-3.5 h-3.5" /> Browse Papers
              </Link>
            </div>

            {/* Flashcards nudge */}
            {cardsDue > 0 && (
              <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5">
                <BrainCircuit className="w-5 h-5 text-purple-600 mb-2" />
                <div className="font-semibold text-purple-700 text-sm mb-1">
                  {cardsDue} flashcard{cardsDue !== 1 ? 's' : ''} due
                </div>
                <p className="text-xs text-purple-600/80 mb-3">
                  Review them now to keep concepts fresh in your memory.
                </p>
                <Link
                  href="/chapters"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-purple-600 text-white px-3.5 py-2 rounded-xl hover:bg-purple-700 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" /> Open Chapters
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
