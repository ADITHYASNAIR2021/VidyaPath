'use client';

import { CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { useProgressStore } from '@/lib/store';

export default function StudiedButton({ chapterId, className }: { chapterId: string; className?: string }) {
  const { isStudied, toggleStudied } = useProgressStore();
  const studied = isStudied(chapterId);

  return (
    <button
      onClick={() => toggleStudied(chapterId)}
      className={clsx(
        'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 shadow-sm border',
        studied
          ? 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600'
          : 'bg-white/10 text-white border-white/20 hover:bg-white/20 backdrop-blur-sm',
        className
      )}
    >
      <CheckCircle2 className="w-4 h-4" fill={studied ? 'currentColor' : 'none'} />
      {studied ? 'Studied ✓' : 'Mark as Studied'}
    </button>
  );
}
