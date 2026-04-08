'use client';

import { useState, useEffect } from 'react';
import { fsrs, Card, Rating, createEmptyCard } from 'ts-fsrs';
import { BrainCircuit, RotateCcw, Frown, Meh, Smile, Zap, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Flashcard {
  front: string;
  back: string;
}

export default function FlashcardDeck({ chapterId, flashcards: initialFlashcards, subject, chapterTitle }: { chapterId: string; flashcards: Flashcard[]; subject?: string; chapterTitle?: string; }) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards);
  const [cards, setCards] = useState<(Card & { index: number })[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const f = fsrs({});

  // Function to load all cards into state
  const loadCardsFromStorage = (currentFlashcards: Flashcard[]) => {
    const loadedCards: (Card & { index: number })[] = [];
    currentFlashcards.forEach((cf, index) => {
      const stored = localStorage.getItem(`fsrs-[${chapterId}]-${index}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          parsed.due = new Date(parsed.due);
          parsed.last_review = parsed.last_review ? new Date(parsed.last_review) : undefined;
          loadedCards.push({ ...parsed, index });
        } catch (e) {
          loadedCards.push({ ...createEmptyCard(new Date()), index });
        }
      } else {
        loadedCards.push({ ...createEmptyCard(new Date()), index });
      }
    });
    setCards(loadedCards);
    setIsLoaded(true);
  };

  useEffect(() => {
    if (flashcards) loadCardsFromStorage(flashcards);
  }, [chapterId, flashcards]);

  useEffect(() => {
    if (!isLoaded) return;
    const now = new Date();
    const dueCard = cards.find(c => c.due <= now);
    if (dueCard) {
      setCurrentIdx(dueCard.index);
    } else {
      setCurrentIdx(null); // No cards due
    }
  }, [cards, isLoaded]);

  const handleGenerateCards = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, subject, chapterTitle })
      });
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        setFlashcards(prev => {
          const combined = [...prev, ...data.data];
          loadCardsFromStorage(combined);
          return combined;
        });
      } else {
        alert("Failed to generate flashcards.");
      }
    } catch (e) {
      alert("Error contacting AI endpoint.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!flashcards || flashcards.length === 0) return null;
  if (!isLoaded) return <div className="h-40 animate-pulse bg-gray-100 rounded-2xl mb-5 border border-[#E8E4DC]"></div>;

  // Render "Caught up" state
  if (currentIdx === null) {
    return (
      <div className="bg-[#FDFAF6] rounded-2xl border border-emerald-200 shadow-sm p-8 text-center mb-5 flex flex-col items-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="font-fraunces text-xl font-bold text-navy-700 mb-2">You're all caught up!</h2>
        <p className="text-[#8A8AAA] text-sm max-w-sm mb-6">
          You've reviewed all flashcards for this chapter. Spaced repetition ensures you only study when you're about to forget.
        </p>
        <button 
          onClick={handleGenerateCards}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 bg-saffron-50 border border-saffron-200 text-saffron-700 hover:bg-saffron-100 px-4 py-2 rounded-xl font-semibold transition-colors disabled:opacity-50"
        >
          <Zap className="w-4 h-4" />
          {isGenerating ? "Generating New Cards..." : "Generate More Cards via AI"}
        </button>
      </div>
    );
  }

  const fc = flashcards[currentIdx];
  const fsrsCard = cards.find(c => c.index === currentIdx)!;

  const handleRate = (rating: Rating) => {
    const now = new Date();
    const schedulingCards = f.repeat(fsrsCard, now);
    let nextCard: Card;

    switch(rating) {
      case Rating.Again: nextCard = schedulingCards[Rating.Again].card; break;
      case Rating.Hard: nextCard = schedulingCards[Rating.Hard].card; break;
      case Rating.Good: nextCard = schedulingCards[Rating.Good].card; break;
      case Rating.Easy: nextCard = schedulingCards[Rating.Easy].card; break;
      default: nextCard = schedulingCards[Rating.Good].card;
    }

    localStorage.setItem(`fsrs-[${chapterId}]-${currentIdx}`, JSON.stringify(nextCard));

    setCards(prev => {
      const copy = [...prev];
      const targetIdx = copy.findIndex(c => c.index === currentIdx);
      if (targetIdx !== -1) copy[targetIdx] = { ...nextCard, index: currentIdx };
      return copy;
    });
    
    setShowBack(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm mb-5 overflow-hidden">
      <div className="bg-gradient-to-r from-violet-500 to-violet-600 px-5 py-4 flex items-center justify-between">
        <h2 className="font-fraunces text-white font-bold flex items-center gap-2">
          <BrainCircuit className="w-5 h-5" /> Active Recall
        </h2>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleGenerateCards}
            disabled={isGenerating}
            className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border border-white/10 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" />
            {isGenerating ? "Thinking..." : "Generate Cards"}
          </button>
          <div className="bg-white/20 text-white text-xs font-bold px-2 py-1 rounded-md">
            {cards.filter(c => c.due <= new Date()).length} Due
          </div>
        </div>
      </div>

      <div className="p-6 md:p-10 min-h-[250px] flex flex-col justify-center items-center text-center">
        <h3 className="text-xl md:text-2xl font-bold text-navy-700 leading-snug mb-6 max-w-lg">
          {fc.front}
        </h3>

        <AnimatePresence>
          {showBack ? (
            <motion.div
              initial={{ opacity: 0, rotateX: -90 }}
              animate={{ opacity: 1, rotateX: 0 }}
              className="w-full"
            >
              <div className="h-px bg-gray-200 w-16 mx-auto mb-6" />
              <p className="text-[#4A4A6A] text-lg font-medium leading-relaxed mb-8 max-w-xl mx-auto">
                {fc.back}
              </p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
                <button onClick={() => handleRate(Rating.Again)} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition-colors">
                  <RotateCcw className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Again</span>
                </button>
                <button onClick={() => handleRate(Rating.Hard)} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors">
                  <Frown className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Hard</span>
                </button>
                <button onClick={() => handleRate(Rating.Good)} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors">
                  <Meh className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Good</span>
                </button>
                <button onClick={() => handleRate(Rating.Easy)} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors">
                  <Zap className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Easy</span>
                </button>
              </div>
            </motion.div>
          ) : (
            <button
              onClick={() => setShowBack(true)}
              className="bg-navy-700 hover:bg-navy-800 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors shadow-sm"
            >
              Show Answer
            </button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
