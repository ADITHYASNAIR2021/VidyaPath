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
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      studiedChapterIds: [],
      markStudied: (id) =>
        set((state) => ({
          studiedChapterIds: Array.from(new Set([...state.studiedChapterIds, id])),
        })),
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
    }),
    {
      name: 'vidyapath-progress',
    }
  )
);
