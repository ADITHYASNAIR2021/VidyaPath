'use client';

import { useEffect, useMemo, useState } from 'react';

type RatingValue = 'again' | 'hard' | 'good' | 'easy';

interface SrsCard {
  cardId: string;
  chapterId: string;
  chapterTitle: string;
  subject: string;
  classLevel: 10 | 12;
  front: string;
  back: string;
  dueAt: string;
  state: string;
  reps: number;
  lapses: number;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function StudentSrsPage() {
  const [cards, setCards] = useState<SrsCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const current = useMemo(() => cards[0] ?? null, [cards]);

  async function loadCards() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/student/srs', { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      const data = unwrap<{ cards?: SrsCard[] } | null>(body);
      if (!res.ok) {
        setError((body && typeof body === 'object' && 'message' in body ? String((body as Record<string, unknown>).message) : 'Failed to load SRS cards.'));
        return;
      }
      setCards(Array.isArray(data?.cards) ? data.cards : []);
    } catch {
      setError('Failed to load SRS cards.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCards();
  }, []);

  async function submitRating(rating: RatingValue) {
    if (!current) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/student/srs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: current.cardId, rating }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError((body && typeof body === 'object' && 'message' in body ? String((body as Record<string, unknown>).message) : 'Failed to submit rating.'));
        return;
      }
      setShowAnswer(false);
      setCards((prev) => prev.slice(1));
      if (cards.length <= 1) {
        await loadCards();
      }
    } catch {
      setError('Failed to submit rating.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700">Spaced Repetition</h1>
        <p className="mt-1 text-sm text-[#6D6A7C]">Review due cards and strengthen long-term memory.</p>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {loading && (
          <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-8 text-sm text-[#8A8AAA]">Loading due cards...</div>
        )}

        {!loading && !current && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
            <p className="font-semibold text-emerald-800">You are fully caught up.</p>
            <p className="mt-2 text-sm text-emerald-700">Come back later for your next review window.</p>
          </div>
        )}

        {!loading && current && (
          <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#8A8AAA]">
              <span className="rounded-full bg-saffron-50 px-2 py-1 text-saffron-800">{current.subject}</span>
              <span>Class {current.classLevel}</span>
              <span>{current.chapterTitle}</span>
            </div>

            <h2 className="text-lg font-semibold text-navy-700">{current.front}</h2>

            {showAnswer && (
              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                {current.back}
              </div>
            )}

            {!showAnswer ? (
              <button
                type="button"
                onClick={() => setShowAnswer(true)}
                className="mt-5 rounded-xl bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
              >
                Show Answer
              </button>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button type="button" onClick={() => submitRating('again')} disabled={submitting} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">Again</button>
                <button type="button" onClick={() => submitRating('hard')} disabled={submitting} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50">Hard</button>
                <button type="button" onClick={() => submitRating('good')} disabled={submitting} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50">Good</button>
                <button type="button" onClick={() => submitRating('easy')} disabled={submitting} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 disabled:opacity-50">Easy</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

