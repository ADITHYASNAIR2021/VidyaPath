import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BookmarkState {
  bookmarkedChapterIds: string[];
  addBookmark: (id: string) => void;
  removeBookmark: (id: string) => void;
  toggleBookmark: (id: string) => void;
  isBookmarked: (id: string) => boolean;
}

export const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set, get) => ({
      bookmarkedChapterIds: [],
      addBookmark: (id) =>
        set((state) => ({
          bookmarkedChapterIds: Array.from(new Set([...state.bookmarkedChapterIds, id])),
        })),
      removeBookmark: (id) =>
        set((state) => ({
          bookmarkedChapterIds: state.bookmarkedChapterIds.filter((item) => item !== id),
        })),
      toggleBookmark: (id) => {
        const currentlyBookmarked = get().bookmarkedChapterIds.includes(id);
        if (currentlyBookmarked) {
          get().removeBookmark(id);
        } else {
          get().addBookmark(id);
        }
      },
      isBookmarked: (id) => get().bookmarkedChapterIds.includes(id),
    }),
    {
      name: 'vidyapath-bookmarks',
    }
  )
);

interface ProgressState {
  studiedChapterIds: string[];
  markStudied: (id: string) => void;
  markNotStudied: (id: string) => void;
  toggleStudied: (id: string) => void;
  isStudied: (id: string) => boolean;
  getStudiedCount: () => number;
  hydrate: (ids: string[]) => void;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      studiedChapterIds: [],
      markStudied: (id) => {
        set((state) => ({
          studiedChapterIds: Array.from(new Set([...state.studiedChapterIds, id])),
        }));
        useStudyActivityStore.getState().recordActivity();
      },
      markNotStudied: (id) =>
        set((state) => ({
          studiedChapterIds: state.studiedChapterIds.filter((item) => item !== id),
        })),
      toggleStudied: (id) => {
        const done = get().studiedChapterIds.includes(id);
        if (done) {
          get().markNotStudied(id);
        } else {
          get().markStudied(id);
        }
      },
      isStudied: (id) => get().studiedChapterIds.includes(id),
      getStudiedCount: () => get().studiedChapterIds.length,
      hydrate: (ids) => set({ studiedChapterIds: Array.from(new Set(ids)) }),
    }),
    {
      name: 'vidyapath-progress',
    }
  )
);

// ── Local-first student data (no accounts) ───────────────────────────────────
// Everything below lives only in this browser. Nothing is sent to a server.

export type LocalClassLevel = 10 | 12;
export type LocalStream = 'pcm' | 'pcb' | 'commerce';

interface StudentProfileState {
  classLevel: LocalClassLevel | null;
  stream: LocalStream | null;
  setClassLevel: (classLevel: LocalClassLevel | null) => void;
  setStream: (stream: LocalStream | null) => void;
}

export const useStudentProfileStore = create<StudentProfileState>()(
  persist(
    (set) => ({
      classLevel: null,
      stream: null,
      setClassLevel: (classLevel) =>
        set((state) => ({ classLevel, stream: classLevel === 12 ? state.stream : null })),
      setStream: (stream) => set({ stream }),
    }),
    { name: 'vidyapath-profile' }
  )
);

function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface StudyActivityState {
  /** Local calendar days (YYYY-MM-DD) on which the student studied. */
  activeDays: string[];
  recordActivity: () => void;
}

export const useStudyActivityStore = create<StudyActivityState>()(
  persist(
    (set, get) => ({
      activeDays: [],
      recordActivity: () => {
        const key = todayKey();
        if (get().activeDays.includes(key)) return;
        set((state) => ({ activeDays: [...state.activeDays, key].slice(-400) }));
      },
    }),
    { name: 'vidyapath-activity' }
  )
);

/** Consecutive-day streak ending today (or yesterday, so the streak survives until tonight). */
export function computeStudyStreak(activeDays: string[], now = new Date()): { current: number; longest: number } {
  const days = new Set(activeDays);
  const cursor = new Date(now);
  if (!days.has(todayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (days.has(todayKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const day of sorted) {
    const [y, m, d] = day.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (previous && Math.round((date.getTime() - previous.getTime()) / 86_400_000) === 1) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  return { current, longest: Math.max(longest, current) };
}

interface ChapterNotesState {
  notes: Record<string, { content: string; updatedAt: string }>;
  saveNote: (chapterId: string, content: string) => void;
}

export const useChapterNotesStore = create<ChapterNotesState>()(
  persist(
    (set) => ({
      notes: {},
      saveNote: (chapterId, content) =>
        set((state) => {
          const next = { ...state.notes };
          const trimmed = content.slice(0, 20_000);
          if (trimmed.trim()) next[chapterId] = { content: trimmed, updatedAt: new Date().toISOString() };
          else delete next[chapterId];
          return { notes: next };
        }),
    }),
    { name: 'vidyapath-notes' }
  )
);

export interface SavedFlashcard {
  front: string;
  back: string;
}

interface FlashcardDeckState {
  /** AI-generated flashcards saved per chapter, appended after any built-in cards. */
  decks: Record<string, SavedFlashcard[]>;
  appendCards: (chapterId: string, cards: SavedFlashcard[]) => void;
}

const MAX_SAVED_CARDS_PER_CHAPTER = 120;

export const useFlashcardDeckStore = create<FlashcardDeckState>()(
  persist(
    (set) => ({
      decks: {},
      appendCards: (chapterId, cards) =>
        set((state) => {
          const existing = state.decks[chapterId] ?? [];
          const seen = new Set(existing.map((card) => card.front.trim().toLowerCase()));
          const additions = cards.filter((card) => {
            const key = card.front.trim().toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          if (additions.length === 0) return state;
          return {
            decks: {
              ...state.decks,
              [chapterId]: [...existing, ...additions].slice(0, MAX_SAVED_CARDS_PER_CHAPTER),
            },
          };
        }),
    }),
    { name: 'vidyapath-flashcard-decks' }
  )
);

/** Built-in cards first, then saved AI cards — the index of each card is its FSRS storage key. */
export function getChapterDeck(
  chapterId: string,
  builtIn: SavedFlashcard[] | undefined,
  decks: Record<string, SavedFlashcard[]>
): SavedFlashcard[] {
  return [...(builtIn ?? []), ...(decks[chapterId] ?? [])];
}
