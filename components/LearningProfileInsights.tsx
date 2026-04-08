'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Target, TrendingUp } from 'lucide-react';
import { useBookmarkStore, useProgressStore } from '@/lib/store';
import { buildLearningProfile } from '@/lib/learning-profile';

interface LearningProfileInsightsProps {
  chapterId: string;
  chapterTitle: string;
  pyqAvgMarks?: number;
  flashcardCount?: number;
}

function getFlashcardsDue(chapterId: string, flashcardCount: number): number {
  if (typeof window === 'undefined') return 0;
  let due = 0;
  const now = new Date();
  for (let index = 0; index < flashcardCount; index++) {
    const stored = localStorage.getItem(`fsrs-[${chapterId}]-${index}`);
    if (!stored) {
      due++;
      continue;
    }
    try {
      const parsed = JSON.parse(stored) as { due?: string };
      if (!parsed?.due || new Date(parsed.due) <= now) due++;
    } catch {
      due++;
    }
  }
  return due;
}

export default function LearningProfileInsights({
  chapterId,
  chapterTitle,
  pyqAvgMarks = 0,
  flashcardCount = 0,
}: LearningProfileInsightsProps) {
  const { studiedChapterIds } = useProgressStore();
  const { bookmarkedChapterIds } = useBookmarkStore();
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    const rawQuiz = localStorage.getItem(`quiz-score-[${chapterId}]`);
    const parsedQuiz = Number(rawQuiz);
    setQuizScore(Number.isFinite(parsedQuiz) && parsedQuiz > 0 ? parsedQuiz : null);
    setDueCount(getFlashcardsDue(chapterId, flashcardCount));
  }, [chapterId, flashcardCount]);

  const profile = useMemo(
    () =>
      buildLearningProfile({
        chapterId,
        quizScore,
        flashcardsDue: dueCount,
        studied: studiedChapterIds.includes(chapterId),
        bookmarked: bookmarkedChapterIds.includes(chapterId),
        pyqAvgMarks,
      }),
    [bookmarkedChapterIds, chapterId, dueCount, pyqAvgMarks, quizScore, studiedChapterIds]
  );

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-fraunces text-base font-bold text-navy-700 flex items-center gap-2">
          <Target className="w-4 h-4 text-saffron-500" />
          Adaptive Focus
        </h3>
        {profile.weakTags.length > 0 ? (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            {profile.weakTags.length} risk tags
          </span>
        ) : (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            On track
          </span>
        )}
      </div>

      <p className="text-xs text-[#6A6A84] mb-3">
        {chapterTitle} | Quiz {profile.quizScore ?? 'NA'}% | Flashcards due {profile.flashcardsDue}
      </p>

      {profile.weakTags.length > 0 ? (
        <div className="space-y-2 mb-3">
          {profile.weakTags.map((tag) => (
            <div key={tag} className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {tag}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-2 mb-3">
          Strong chapter health. Keep revision cadence steady.
        </div>
      )}

      <div className="space-y-1.5">
        {profile.recommendedActions.slice(0, 2).map((action) => (
          <div key={action} className="text-xs text-[#4A4A6A] flex items-start gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
            <span>{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
