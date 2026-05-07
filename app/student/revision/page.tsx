'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ExternalLink, Target } from 'lucide-react';
import { ALL_CHAPTERS } from '@/lib/data';
import { fetchClientStudentSession } from '@/lib/client-student-session';
import { useBookmarkStore, useProgressStore } from '@/lib/store';
import { buildLearningProfile, rankWeakChapters, type LearningProfile } from '@/lib/learning-profile';
import { getPYQData } from '@/lib/pyq';
import BackButton from '@/components/BackButton';
import RevisionPlanCard from '@/components/RevisionPlanCard';
import LearningProfileInsights from '@/components/LearningProfileInsights';

function getFlashcardsDue(chapterId: string, flashcardCount: number): number {
  if (typeof window === 'undefined') return 0;
  const now = new Date();
  let due = 0;
  for (let index = 0; index < flashcardCount; index += 1) {
    const stored = localStorage.getItem(`fsrs-[${chapterId}]-${index}`);
    if (!stored) {
      due += 1;
      continue;
    }
    try {
      const parsed = JSON.parse(stored) as { due?: string };
      if (!parsed?.due || new Date(parsed.due) <= now) due += 1;
    } catch {
      due += 1;
    }
  }
  return due;
}

export default function StudentRevisionHubPage() {
  const searchParams = useSearchParams();
  const requestedChapterId = (searchParams.get('chapter') ?? '').trim();
  const { studiedChapterIds } = useProgressStore();
  const { bookmarkedChapterIds } = useBookmarkStore();

  const [studentClassLevel, setStudentClassLevel] = useState<10 | 12 | null>(null);
  const [chapterId, setChapterId] = useState('');
  const [weakProfiles, setWeakProfiles] = useState<LearningProfile[]>([]);

  useEffect(() => {
    let active = true;
    fetchClientStudentSession()
      .then((session) => {
        if (!active || !session) return;
        if (session.classLevel === 10 || session.classLevel === 12) {
          setStudentClassLevel(session.classLevel);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const chapters = useMemo(
    () =>
      studentClassLevel
        ? ALL_CHAPTERS.filter((chapter) => chapter.classLevel === studentClassLevel)
        : ALL_CHAPTERS,
    [studentClassLevel]
  );

  useEffect(() => {
    if (chapters.length === 0) {
      setChapterId('');
      return;
    }
    const requestedValid = requestedChapterId && chapters.some((chapter) => chapter.id === requestedChapterId);
    if (requestedValid) {
      setChapterId(requestedChapterId);
      return;
    }
    if (!chapterId || !chapters.some((chapter) => chapter.id === chapterId)) {
      setChapterId(chapters[0].id);
    }
  }, [chapterId, chapters, requestedChapterId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const profiles = chapters.map((chapter) => {
      const scoreRaw = Number(localStorage.getItem(`quiz-score-[${chapter.id}]`));
      const quizScore = Number.isFinite(scoreRaw) && scoreRaw > 0 ? scoreRaw : null;
      const flashcardsDue = getFlashcardsDue(chapter.id, chapter.flashcards?.length ?? 0);
      return buildLearningProfile({
        chapterId: chapter.id,
        quizScore,
        flashcardsDue,
        studied: studiedChapterIds.includes(chapter.id),
        bookmarked: bookmarkedChapterIds.includes(chapter.id),
        pyqAvgMarks: getPYQData(chapter.id)?.avgMarks ?? 0,
      });
    });
    setWeakProfiles(rankWeakChapters(profiles));
  }, [bookmarkedChapterIds, chapters, studiedChapterIds]);

  const chapterById = useMemo(() => new Map(chapters.map((chapter) => [chapter.id, chapter])), [chapters]);

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === chapterId) ?? null,
    [chapterId, chapters]
  );

  const selectedProfile = useMemo(
    () => weakProfiles.find((profile) => profile.chapterId === chapterId) ?? null,
    [chapterId, weakProfiles]
  );

  const focusQueue = useMemo(
    () => weakProfiles.filter((profile) => profile.weakTags.length > 0).slice(0, 6),
    [weakProfiles]
  );

  const plannerClassLevel = useMemo<10 | 12>(() => {
    if (studentClassLevel === 10 || studentClassLevel === 12) return studentClassLevel;
    return selectedChapter?.classLevel === 10 ? 10 : 12;
  }, [selectedChapter?.classLevel, studentClassLevel]);

  const plannerWeakChapterIds = useMemo(
    () =>
      focusQueue
        .filter((profile) => chapterById.get(profile.chapterId)?.classLevel === plannerClassLevel)
        .map((profile) => profile.chapterId),
    [chapterById, focusQueue, plannerClassLevel]
  );

  const totalDueInScope = useMemo(
    () => weakProfiles.reduce((sum, profile) => sum + profile.flashcardsDue, 0),
    [weakProfiles]
  );

  if (chapters.length === 0) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <BackButton href="/dashboard" label="Dashboard" />
        <div className="mt-5 rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 dark:text-slate-100">Revision Hub</h1>
          <p className="mt-2 text-sm text-[#5A5570] dark:text-slate-300">
            No chapters are available right now. Please contact your teacher/admin if this looks incorrect.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 text-slate-900 dark:text-slate-100">
      <BackButton href="/dashboard" label="Dashboard" />

      <section className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-fraunces text-2xl font-bold text-navy-700 dark:text-slate-100">
              <CalendarDays className="h-6 w-6 text-indigo-600" />
              Revision Hub
            </h1>
            <p className="mt-1 text-sm text-[#5A5570] dark:text-slate-300">
              Weekly planning, risk detection, and focused revision in one simple page.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {studentClassLevel && (
              <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-100">
                Class {studentClassLevel}
              </span>
            )}
            {selectedChapter && (
              <Link
                href={`/student/ai-tools?chapter=${encodeURIComponent(selectedChapter.id)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E4DC] bg-[#FDFAF6] px-3 py-1 text-xs font-semibold text-[#4A4A6A] hover:bg-[#F7F1E9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Open AI Study Hub
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-500/20">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-100">Studied</p>
            <p className="mt-1 text-xl font-bold text-emerald-800 dark:text-emerald-100">
              {studiedChapterIds.filter((id) => chapterById.has(id)).length}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-200">of {chapters.length} chapters</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/20">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-100">Risk Chapters</p>
            <p className="mt-1 text-xl font-bold text-amber-800 dark:text-amber-100">{focusQueue.length}</p>
            <p className="text-xs text-amber-700 dark:text-amber-200">need focused revision</p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 dark:border-violet-500/40 dark:bg-violet-500/20">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-100">Flashcards Due</p>
            <p className="mt-1 text-xl font-bold text-violet-800 dark:text-violet-100">{totalDueInScope}</p>
            <p className="text-xs text-violet-700 dark:text-violet-200">spaced repetition backlog</p>
          </div>
          <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 dark:border-sky-500/40 dark:bg-sky-500/20">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-100">Current Chapter</p>
            <p className="mt-1 line-clamp-1 text-sm font-bold text-sky-900 dark:text-sky-100">
              {selectedChapter?.title ?? 'Select one'}
            </p>
            <p className="text-xs text-sky-700 dark:text-sky-200">
              {selectedChapter ? `${selectedChapter.subject} | Class ${selectedChapter.classLevel}` : 'No chapter selected'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="revision-chapter-select" className="mb-1 block text-xs font-semibold text-gray-600 dark:text-slate-300">
            Revision chapter context
          </label>
          <select
            id="revision-chapter-select"
            value={chapterId}
            onChange={(event) => setChapterId(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-[#1C1C2E] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                Class {chapter.classLevel} | {chapter.subject} | {chapter.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      {selectedChapter && (
        <div className="grid gap-5 lg:grid-cols-2">
          <LearningProfileInsights
            chapterId={selectedChapter.id}
            chapterTitle={selectedChapter.title}
            pyqAvgMarks={getPYQData(selectedChapter.id)?.avgMarks ?? 0}
            flashcardCount={selectedChapter.flashcards?.length ?? 0}
          />
          <RevisionPlanCard classLevel={plannerClassLevel} weakChapterIds={plannerWeakChapterIds} />
        </div>
      )}

      <section className="rounded-2xl border border-amber-100 bg-amber-50 p-5 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/20">
        <h2 className="flex items-center gap-2 text-base font-bold text-amber-900 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-200" />
          Focus Queue
        </h2>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">
          Priority order for this week based on quiz performance, flashcard due load, and PYQ weight.
        </p>
        {focusQueue.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {focusQueue.map((profile) => {
              const chapter = chapterById.get(profile.chapterId);
              if (!chapter) return null;
              return (
                <button
                  key={profile.chapterId}
                  type="button"
                  onClick={() => setChapterId(profile.chapterId)}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-left hover:bg-amber-50 dark:border-amber-500/50 dark:bg-slate-900 dark:hover:bg-amber-500/20"
                >
                  <p className="line-clamp-1 text-xs font-semibold text-amber-900 dark:text-amber-100">{chapter.title}</p>
                  <p className="line-clamp-1 text-[11px] text-amber-700 dark:text-amber-200">
                    {profile.recommendedActions[0] ?? 'Run revision plan and practice questions.'}
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
            No high-risk chapters right now. Keep your regular revision cadence.
          </p>
        )}
      </section>

      {selectedProfile && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/20">
          <h3 className="flex items-center gap-2 text-sm font-bold text-indigo-900 dark:text-indigo-100">
            <Target className="h-4 w-4 text-indigo-700 dark:text-indigo-200" />
            Current chapter signal
          </h3>
          <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-200">
            {selectedProfile.weakTags.length > 0
              ? `${selectedProfile.weakTags.length} risk tag(s) detected. Use AI Study Hub to run diagnosis and chapter drill for this chapter.`
              : 'No active risk tags for the selected chapter. Maintain consistency with short revision cycles.'}
          </p>
        </div>
      )}
    </div>
  );
}
