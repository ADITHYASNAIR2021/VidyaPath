'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ExternalLink,
  Play,
  BookOpen,
  Atom,
  FlaskConical,
  Leaf,
  Calculator,
  Bookmark,
  CheckCircle2,
  Briefcase,
  LineChart,
} from 'lucide-react';
import clsx from 'clsx';
import type { Chapter } from '@/lib/data';
import { useBookmarkStore, useProgressStore } from '@/lib/store';

const SUBJECT_STYLES: Record<
  string,
  { bg: string; badge: string; icon: React.ElementType; headerBg: string }
> = {
  Physics: {
    bg: 'border-sky-100',
    badge: 'bg-sky-100 text-sky-700',
    headerBg: 'bg-sky-50',
    icon: Atom,
  },
  Chemistry: {
    bg: 'border-emerald-100',
    badge: 'bg-emerald-100 text-emerald-700',
    headerBg: 'bg-emerald-50',
    icon: FlaskConical,
  },
  Biology: {
    bg: 'border-green-100',
    badge: 'bg-green-100 text-green-700',
    headerBg: 'bg-green-50',
    icon: Leaf,
  },
  Math: {
    bg: 'border-purple-100',
    badge: 'bg-purple-100 text-purple-700',
    headerBg: 'bg-purple-50',
    icon: Calculator,
  },
  Accountancy: {
    bg: 'border-amber-100',
    badge: 'bg-amber-100 text-amber-700',
    headerBg: 'bg-amber-50',
    icon: Briefcase,
  },
  'Business Studies': {
    bg: 'border-indigo-100',
    badge: 'bg-indigo-100 text-indigo-700',
    headerBg: 'bg-indigo-50',
    icon: LineChart,
  },
  Economics: {
    bg: 'border-rose-100',
    badge: 'bg-rose-100 text-rose-700',
    headerBg: 'bg-rose-50',
    icon: LineChart,
  },
  'English Core': {
    bg: 'border-cyan-100',
    badge: 'bg-cyan-100 text-cyan-700',
    headerBg: 'bg-cyan-50',
    icon: BookOpen,
  },
};

const CLASS_STYLES: Record<number, string> = {
  10: 'bg-emerald-600 text-white',
  11: 'bg-sky-600 text-white',
  12: 'bg-purple-600 text-white',
};

const RELEVANCE_STYLES: Record<string, string> = {
  Board: 'bg-amber-50 text-amber-700 border-amber-200',
  JEE: 'bg-sky-50 text-sky-700 border-sky-200',
  NEET: 'bg-green-50 text-green-700 border-green-200',
};

export default function ChapterCard({ chapter }: { chapter: Chapter }) {
  const { isBookmarked, toggleBookmark } = useBookmarkStore();
  const { isStudied, toggleStudied } = useProgressStore();
  const bookmarked = isBookmarked(chapter.id);
  const studied = isStudied(chapter.id);

  const style = SUBJECT_STYLES[chapter.subject] ?? SUBJECT_STYLES.Physics;
  const SubjectIcon = style.icon ?? Atom;
  const MAX_TOPICS = 3;
  const visibleTopics = chapter.topics.slice(0, MAX_TOPICS);
  const extraTopics = chapter.topics.length - MAX_TOPICS;

  const youtubeUrl = `https://www.youtube.com/results?search_query=CBSE+Class+${chapter.classLevel}+${chapter.subject}+${encodeURIComponent(chapter.title)}+NCERT`;

  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)' }}
      className={clsx(
        'bg-white rounded-2xl border shadow-sm transition-all flex flex-col overflow-hidden relative',
        style.bg,
        studied && 'ring-2 ring-emerald-400 ring-offset-1'
      )}
    >
      {/* Studied checkmark badge */}
      {studied && (
        <div className="absolute top-3 right-3 z-10">
          <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      )}

      {/* Card Header */}
      <div className={clsx('px-5 pt-5 pb-4', style.headerBg)}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={clsx('p-1.5 rounded-lg', style.badge.split(' ')[0])}>
              <SubjectIcon className={clsx('w-4 h-4', style.badge.split(' ')[1])} />
            </div>
            <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full', style.badge)}>
              {chapter.subject}
            </span>
            <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', CLASS_STYLES[chapter.classLevel] ?? 'bg-gray-600 text-white')}>
              Class {chapter.classLevel}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {chapter.marks}M
            </span>
            <button
              onClick={(e) => { e.preventDefault(); toggleBookmark(chapter.id); }}
              className={clsx(
                'p-1.5 rounded-md hover:bg-black/5 transition-colors',
                bookmarked ? 'text-pink-500' : 'text-gray-400'
              )}
              aria-label="Toggle Bookmark"
            >
              <Bookmark className="w-4 h-4" fill={bookmarked ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>

        <div className="text-xs text-[#8A8AAA] font-medium mb-1">Ch {chapter.chapterNumber}</div>
        <h3 className="font-fraunces font-bold text-navy-700 text-base leading-snug">
          {chapter.title}
        </h3>
        <p className="text-xs text-[#4A4A6A] mt-1.5 leading-relaxed line-clamp-2">
          {chapter.description}
        </p>
      </div>

      {/* Topics */}
      <div className="px-5 py-3 flex-1">
        <div className="flex flex-wrap gap-1.5">
          {visibleTopics.map((topic) => (
            <span
              key={topic}
              className="text-xs bg-gray-100 text-[#4A4A6A] px-2 py-0.5 rounded-full border border-gray-200"
            >
              {topic}
            </span>
          ))}
          {extraTopics > 0 && (
            <span className="text-xs bg-saffron-50 text-saffron-600 px-2 py-0.5 rounded-full border border-saffron-100 font-medium">
              +{extraTopics} more
            </span>
          )}
        </div>
      </div>

      {/* Exam Relevance */}
      {chapter.examRelevance && chapter.examRelevance.length > 0 && (
        <div className="px-5 pb-3 flex gap-1.5 flex-wrap">
          {chapter.examRelevance.map((tag) => (
            <span
              key={tag}
              className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full border', RELEVANCE_STYLES[tag] ?? 'bg-gray-50 text-gray-600 border-gray-200')}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="px-5 pb-5 pt-2 grid grid-cols-3 gap-2 border-t border-gray-100">
        <Link
          href={`/chapters/${chapter.id}`}
          className="flex items-center justify-center gap-1.5 bg-saffron-500 hover:bg-saffron-600 active:scale-95 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-all col-span-1"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Study
        </Link>
        <a
          href={chapter.ncertPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 bg-white hover:bg-gray-50 active:scale-95 text-[#4A4A6A] text-xs font-medium px-3 py-2 rounded-xl border border-gray-200 transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          NCERT
        </a>
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 active:scale-95 text-red-600 text-xs font-medium px-3 py-2 rounded-xl border border-red-100 transition-all"
        >
          <Play className="w-3.5 h-3.5" />
          Watch
        </a>
      </div>
    </motion.div>
  );
}

