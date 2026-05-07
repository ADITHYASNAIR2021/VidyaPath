'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fsrs, Card, Rating, createEmptyCard } from 'ts-fsrs';
import { BrainCircuit, RotateCcw, Frown, Meh, Zap, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Flashcard {
  front: string;
  back: string;
}

export default function FlashcardDeck({
  chapterId,
  flashcards: initialFlashcards,
  subject,
  chapterTitle,
}: {
  chapterId: string;
  flashcards: Flashcard[];
  subject?: string;
  chapterTitle?: string;
}) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards);
  const [cards, setCards] = useState<(Card & { index: number })[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const f = fsrs({});

  const loadCardsFromStorage = useCallback(
    (currentFlashcards: Flashcard[]) => {
      const loadedCards: (Card & { index: number })[] = [];
      currentFlashcards.forEach((_, index) => {
        const stored = localStorage.getItem(`fsrs-[${chapterId}]-${index}`);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            parsed.due = new Date(parsed.due);
            parsed.last_review = parsed.last_review ? new Date(parsed.last_review) : undefined;
            loadedCards.push({ ...parsed, index });
          } catch {
            loadedCards.push({ ...createEmptyCard(new Date()), index });
          }
        } else {
          loadedCards.push({ ...createEmptyCard(new Date()), index });
        }
      });
      setCards(loadedCards);
      setIsLoaded(true);
    },
    [chapterId]
  );

  useEffect(() => {
    if (flashcards) loadCardsFromStorage(flashcards);
  }, [flashcards, loadCardsFromStorage]);

  useEffect(() => {
    if (!isLoaded) return;
    const now = new Date();
    const dueCard = cards.find((card) => card.due <= now);
    if (dueCard) {
      setCurrentIdx(dueCard.index);
    } else {
      setCurrentIdx(null);
    }
  }, [cards, isLoaded]);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    };
  }, []);

  const beginGenerationProgress = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    setGenerationProgress(8);
    progressIntervalRef.current = setInterval(() => {
      setGenerationProgress((value) => {
        if (value >= 92) return value;
        const increment = Math.max(1, Math.round((100 - value) / 10));
        return Math.min(92, value + increment);
      });
    }, 300);
  };

  const finishGenerationProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setGenerationProgress(100);
    progressTimeoutRef.current = setTimeout(() => {
      setGenerationProgress(0);
    }, 700);
  };

  const handleGenerateCards = async () => {
    setIsGenerating(true);
    setStatusMessage(null);
    beginGenerationProgress();
    try {
      const res = await fetch('/api/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, subject, chapterTitle }),
      });
      const data = await res.json();
      const payload =
        data && typeof data === 'object' && 'data' in data && data.data && typeof data.data === 'object'
          ? (data.data as Record<string, unknown>)
          : (data as Record<string, unknown>);
      if (payload.success === true && Array.isArray(payload.data) && payload.data.length > 0) {
        const generated = payload.data as Flashcard[];
        setFlashcards((prev) => {
          const combined = [...prev, ...generated];
          loadCardsFromStorage(combined);
          return combined;
        });
        setStatusMessage('New flashcards were generated.');
      } else {
        setStatusMessage(String(payload.message || payload.error || 'Failed to generate flashcards.'));
      }
    } catch {
      setStatusMessage('Error contacting AI endpoint.');
    } finally {
      setIsGenerating(false);
      finishGenerationProgress();
    }
  };

  if (!flashcards || flashcards.length === 0) {
    return (
      <div className="mb-5 flex flex-col items-center rounded-2xl border border-[#E8E4DC] bg-[#FDFAF6] p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {statusMessage && (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100" role="alert">
            {statusMessage}
          </p>
        )}
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-500/25">
          <BrainCircuit className="w-7 h-7 text-violet-600" />
        </div>
        <h2 className="mb-2 font-fraunces text-lg font-bold text-navy-700 dark:text-slate-100">No flashcards yet</h2>
        <p className="mb-5 max-w-sm text-sm text-[#8A8AAA] dark:text-slate-300">
          Generate AI-powered flashcards for this chapter to start active recall practice.
        </p>
        <button
          onClick={handleGenerateCards}
          type="button"
          disabled={isGenerating}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
        >
          <Zap className="w-4 h-4" />
          {isGenerating ? 'Generating...' : 'Generate Flashcards via AI'}
        </button>
        {isGenerating && (
          <div className="mt-4 w-full max-w-sm rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 dark:border-violet-500/40 dark:bg-violet-500/20">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-violet-700 dark:text-violet-200">
              <span>Progress</span>
              <span>{Math.round(generationProgress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-violet-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-violet-600 transition-all duration-300" style={{ width: `${generationProgress}%` }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="mb-5 h-40 animate-pulse rounded-2xl border border-[#E8E4DC] bg-gray-100 dark:border-slate-700 dark:bg-slate-800"></div>;
  }

  if (currentIdx === null) {
    return (
      <div className="mb-5 flex flex-col items-center rounded-2xl border border-emerald-200 bg-[#FDFAF6] p-8 text-center shadow-sm dark:border-emerald-500/40 dark:bg-slate-900">
        {statusMessage && <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>}
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/25">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="mb-2 font-fraunces text-xl font-bold text-navy-700 dark:text-slate-100">You&apos;re all caught up!</h2>
        <p className="mb-6 max-w-sm text-sm text-[#8A8AAA] dark:text-slate-300">
          You&apos;ve reviewed all flashcards for this chapter. Spaced repetition ensures you only study when you&apos;re about to forget.
        </p>
        <button
          onClick={handleGenerateCards}
          type="button"
          disabled={isGenerating}
          className="inline-flex items-center gap-2 rounded-xl border border-saffron-200 bg-saffron-50 px-4 py-2 font-semibold text-saffron-700 transition-colors hover:bg-saffron-100 disabled:opacity-50 dark:border-saffron-400/40 dark:bg-saffron-500/20 dark:text-saffron-100 dark:hover:bg-saffron-500/30"
        >
          <Zap className="w-4 h-4" />
          {isGenerating ? 'Generating New Cards...' : 'Generate More Cards via AI'}
        </button>
        {isGenerating && (
          <div className="mt-4 w-full max-w-sm rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 dark:border-violet-500/40 dark:bg-violet-500/20">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-violet-700 dark:text-violet-200">
              <span>Progress</span>
              <span>{Math.round(generationProgress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-violet-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-violet-600 transition-all duration-300" style={{ width: `${generationProgress}%` }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  const fc = flashcards[currentIdx];
  const fsrsCard = cards.find((card) => card.index === currentIdx)!;

  const handleRate = (rating: Rating) => {
    const now = new Date();
    const schedulingCards = f.repeat(fsrsCard, now);
    let nextCard: Card;

    switch (rating) {
      case Rating.Again:
        nextCard = schedulingCards[Rating.Again].card;
        break;
      case Rating.Hard:
        nextCard = schedulingCards[Rating.Hard].card;
        break;
      case Rating.Good:
        nextCard = schedulingCards[Rating.Good].card;
        break;
      case Rating.Easy:
        nextCard = schedulingCards[Rating.Easy].card;
        break;
      default:
        nextCard = schedulingCards[Rating.Good].card;
    }

    localStorage.setItem(`fsrs-[${chapterId}]-${currentIdx}`, JSON.stringify(nextCard));

    setCards((prev) => {
      const copy = [...prev];
      const targetIdx = copy.findIndex((card) => card.index === currentIdx);
      if (targetIdx !== -1) copy[targetIdx] = { ...nextCard, index: currentIdx };
      return copy;
    });

    setShowBack(false);
  };

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {statusMessage && (
        <p className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100" role="alert">
          {statusMessage}
        </p>
      )}

      <div className="flex items-center justify-between bg-gradient-to-r from-violet-500 to-violet-600 px-5 py-4">
        <h2 className="flex items-center gap-2 font-fraunces font-bold text-white">
          <BrainCircuit className="w-5 h-5" /> Active Recall
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateCards}
            type="button"
            disabled={isGenerating}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            {isGenerating ? 'Thinking...' : 'Generate Cards'}
          </button>
          <div className="rounded-md bg-white/20 px-2 py-1 text-xs font-bold text-white">
            {cards.filter((card) => card.due <= new Date()).length} Due
          </div>
        </div>
      </div>

      {isGenerating && (
        <div className="mx-4 mt-4 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 dark:border-violet-500/40 dark:bg-violet-500/20">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-violet-700 dark:text-violet-200">
            <span>Generating flashcards</span>
            <span>{Math.round(generationProgress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-violet-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-violet-600 transition-all duration-300" style={{ width: `${generationProgress}%` }} />
          </div>
        </div>
      )}

      <div className="flex min-h-[250px] flex-col items-center justify-center p-6 text-center md:p-10">
        <h3 className="mb-6 max-w-lg text-xl font-bold leading-snug text-navy-700 dark:text-slate-100 md:text-2xl">
          {fc.front}
        </h3>

        <AnimatePresence>
          {showBack ? (
            <motion.div
              initial={{ opacity: 0, rotateX: -90 }}
              animate={{ opacity: 1, rotateX: 0 }}
              className="w-full"
            >
              <div className="mx-auto mb-6 h-px w-16 bg-gray-200 dark:bg-slate-700" />
              <p className="mx-auto mb-8 max-w-xl text-lg font-medium leading-relaxed text-[#4A4A6A] dark:text-slate-200">
                {fc.back}
              </p>

              <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3 md:grid-cols-4">
                <button type="button" onClick={() => handleRate(Rating.Again)} className="flex flex-col items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 transition-colors hover:bg-red-100 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-100 dark:hover:bg-red-500/30">
                  <RotateCcw className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Again</span>
                </button>
                <button type="button" onClick={() => handleRate(Rating.Hard)} className="flex flex-col items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100 dark:hover:bg-amber-500/30">
                  <Frown className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Hard</span>
                </button>
                <button type="button" onClick={() => handleRate(Rating.Good)} className="flex flex-col items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-100 dark:hover:bg-emerald-500/30">
                  <Meh className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Good</span>
                </button>
                <button type="button" onClick={() => handleRate(Rating.Easy)} className="flex flex-col items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-400/40 dark:bg-blue-500/20 dark:text-blue-100 dark:hover:bg-blue-500/30">
                  <Zap className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Easy</span>
                </button>
              </div>
            </motion.div>
          ) : (
            <button
              onClick={() => setShowBack(true)}
              type="button"
              className="rounded-xl bg-navy-700 px-6 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-navy-800 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Show Answer
            </button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
