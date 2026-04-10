'use client';

import { Bookmark } from 'lucide-react';
import clsx from 'clsx';
import { useBookmarkStore } from '@/lib/store';

export default function BookmarkButton({ chapterId, className }: { chapterId: string, className?: string }) {
  const { isBookmarked, toggleBookmark } = useBookmarkStore();
  const bookmarked = isBookmarked(chapterId);

  return (
    <button
      onClick={() => toggleBookmark(chapterId)}
      type="button"
      aria-pressed={bookmarked}
      className={clsx(
        'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 shadow-sm border',
        bookmarked 
          ? 'bg-pink-100 text-pink-700 border-pink-200 hover:bg-pink-200' 
          : 'bg-white/10 text-white border-white/20 hover:bg-white/20 backdrop-blur-sm',
        className
      )}
    >
      <Bookmark className="w-4 h-4" fill={bookmarked ? "currentColor" : "none"} />
      {bookmarked ? 'Saved to Revision List' : 'Save for Later'}
    </button>
  );
}
