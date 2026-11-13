'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { fsrs, createEmptyCard, Rating, type Card, type Grade } from 'ts-fsrs';
import { Layers, RotateCcw } from 'lucide-react';
import { BOARD_CHAPTERS } from '@/lib/data';
import {
  getChapterDeck,
  useFlashcardDeckStore,
  useProgressStore,
  useStudentProfileStore,
  useStudyActivityStore,
} from '@/lib/store';

interface QueueItem {
  chapterId: string;
  chapterTitle: string;
  subject: string;
  index: number;
  front: string;
  back: string;
  card: Card;
  isNew: boolean;
}

const NEW_CARDS_PER_SESSION = 20;
const scheduler = fsrs({});

function storageKey(chapterId: string, index: number) {
  return `fsrs-[${chapterId}]-${index}`;
}

function readCard(chapterId: string, index: number): Card | null {
  try {
    const raw = localStorage.getItem(storageKey(chapterId, index));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    parsed.due = new Date(parsed.due);
    parsed.last_review = parsed.last_review ? new Date(parsed.last_review) : undefined;
    return parsed as Card;
  } catch {
    return null;
  }
}

const RATINGS: Array<{ grade: Grade; label: string; className: string }> = [
  { grade: Rating.Again, label: 'Again', className: 'bg-rose-100 text-rose-800 hover:bg-rose-200' },
  { grade: Rating.Hard, label: 'Hard', className: 'bg-amber-100 text-amber-800 hover:bg-amber-200' },
  { grade: Rating.Good, label: 'Good', className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' },
  { grade: Rating.Easy, label: 'Easy', className: 'bg-sky-100 text-sky-800 hover:bg-sky-200' },
];

/**
 * Spaced-repetition review across every chapter's flashcards (FSRS).
 * Uses the same on-device card state as the chapter flashcard decks — no account needed.
 */
export default function ReviewPage() {
  const classLevel = useStudentProfileStore((state) => state.classLevel);
  const { studiedChapterIds } = useProgressStore();
  const recordActivity = useStudyActivityStore((state) => state.recordActivity);
  const decks = useFlashcardDeckStore((state) => state.decks);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const chapters = useMemo(
    () =>
      BOARD_CHAPTERS.filter((chapter) => !classLevel || chapter.classLevel === classLevel)
        .map((chapter) => ({ chapter, deck: getChapterDeck(chapter.id, chapter.flashcards, decks) }))
        .filter((item) => item.deck.length > 0),
    [classLevel, decks]
  );

  const buildQueue = useCallback(() => {
    const now = new Date();
    const studied = new Set(studiedChapterIds);
    const due: QueueItem[] = [];
    const fresh: QueueItem[] = [];
    for (const { chapter, deck } of chapters) {
      deck.forEach((flashcard, index) => {
        const stored = readCard(chapter.id, index);
        const base = {
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          subject: chapter.subject,
          index,
          front: flashcard.front,
          back: flashcard.back,
        };
        if (stored) {
          if (stored.due <= now) due.push({ ...base, card: stored, isNew: false });
        } else if (studied.has(chapter.id) || (decks[chapter.id]?.length ?? 0) > 0) {
          fresh.push({ ...base, card: createEmptyCard(now), isNew: true });
        }
      });
    }
    due.sort((a, b) => a.card.due.getTime() - b.card.due.getTime());
    setQueue([...due, ...fresh.slice(0, NEW_CARDS_PER_SESSION)]);
    setShowBack(false);
    setLoaded(true);
  }, [chapters, decks, studiedChapterIds]);

  useEffect(() => {
    buildQueue();
  }, [buildQueue]);

  const current = queue[0];
  const dueCount = queue.filter((item) => !item.isNew).length;
  const newCount = queue.length - dueCount;

  function rate(grade: Grade) {
    if (!current) return;
    const next = scheduler.next(current.card, new Date(), grade).card;
    try {
      localStorage.setItem(storageKey(current.chapterId, current.index), JSON.stringify(next));
    } catch {
      // Storage unavailable — progress for this card is not persisted.
    }
    if (reviewedCount === 0) recordActivity();
    setReviewedCount((count) => count + 1);
    setShowBack(false);
    setQueue((prev) => {
      const rest = prev.slice(1);
      // "Again" brings the card back later in this session.
      return grade === Rating.Again ? [...rest, { ...current, card: next, isNew: false }] : rest;
    });
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2">
          <Layers className="h-6 w-6 text-saffron-500" />
          <h1 className="font-fraunces text-2xl font-bold text-navy-700">Flashcard Review</h1>
        </div>
        <p className="mt-1 text-sm text-[#6D6A7C]">
          Spaced repetition across all your chapters{classLevel ? ` (Class ${classLevel})` : ''}. Due cards come first, then new
          cards from flashcard sets you generated. Saved on this device.
        </p>

        {!loaded ? null : current ? (
          <>
            <div className="mt-5 flex items-center justify-between text-xs font-semibold text-[#6D6A7C]">
              <span>
                {dueCount} due · {newCount} new
              </span>
              <span>{reviewedCount} reviewed this session</span>
            </div>
            <div className="mt-2 rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                {current.subject} · {current.chapterTitle}
                {current.isNew ? ' · new' : ''}
              </p>
              <p className="mt-3 text-lg font-semibold leading-relaxed text-navy-700">{current.front}</p>
              {showBack ? (
                <p className="mt-4 border-t border-gray-100 pt-4 text-sm leading-relaxed text-[#4A4A6A]">{current.back}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowBack(true)}
                  className="mt-5 w-full rounded-xl bg-navy-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
                >
                  Show answer
                </button>
              )}
            </div>
            {showBack && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {RATINGS.map((rating) => (
                  <button
                    key={rating.label}
                    type="button"
                    onClick={() => rate(rating.grade)}
                    className={clsx('rounded-xl px-2 py-2.5 text-sm font-semibold transition-colors', rating.className)}
                  >
                    {rating.label}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-6 text-center">
            <p className="font-fraunces text-xl font-bold text-navy-700">
              {reviewedCount > 0 ? 'All caught up for now!' : 'Nothing due right now'}
            </p>
            <p className="mt-1 text-sm text-[#6D6A7C]">
              {reviewedCount > 0
                ? `You reviewed ${reviewedCount} card${reviewedCount === 1 ? '' : 's'}. Come back later for the next batch.`
                : 'Generate flashcards on any chapter page or in the AI Study Hub — they are saved here for spaced-repetition review.'}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/chapters" className="rounded-xl bg-saffron-500 px-4 py-2 text-sm font-semibold text-white hover:bg-saffron-600">
                Browse chapters
              </Link>
              <button
                type="button"
                onClick={buildQueue}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-gray-50"
              >
                <RotateCcw className="h-4 w-4" /> Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
