'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, Frown } from 'lucide-react';
import { useBookmarkStore } from '@/lib/store';
import { ALL_CHAPTERS } from '@/lib/data';
import ChapterCard from '@/components/ChapterCard';
import Link from 'next/link';

const CLASS_OPTIONS = [
  { value: 0, label: 'All classes' },
  { value: 10, label: 'Class 10' },
  { value: 12, label: 'Class 12' },
] as const;

export default function BookmarksPage() {
  const { bookmarkedChapterIds } = useBookmarkStore();
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [selectedClass, setSelectedClass] = useState<0 | 10 | 12>(0);

  const savedChapters = useMemo(
    () => ALL_CHAPTERS.filter((ch) => bookmarkedChapterIds.includes(ch.id)),
    [bookmarkedChapterIds]
  );

  const subjects = useMemo(
    () => ['All', ...Array.from(new Set(savedChapters.map((ch) => ch.subject))).sort()],
    [savedChapters]
  );

  const filtered = useMemo(
    () =>
      savedChapters.filter((ch) => {
        if (selectedSubject !== 'All' && ch.subject !== selectedSubject) return false;
        if (selectedClass !== 0 && ch.classLevel !== selectedClass) return false;
        return true;
      }),
    [savedChapters, selectedSubject, selectedClass]
  );

  return (
    <div className="min-h-screen bg-[#FDFAF6] dark:bg-gray-900">
      <div className="bg-gradient-to-br from-pink-600 to-rose-800 text-white px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="font-fraunces text-4xl sm:text-5xl font-bold mb-4 flex items-center gap-3">
              <Bookmark className="w-10 h-10 text-pink-300" />
              Revision List
            </h1>
            <p className="text-pink-100 text-lg max-w-2xl leading-relaxed">
              Your personal collection of important topics and chapters. Review them before exams to ensure you are fully prepared!
            </p>
            <div className="mt-3 inline-flex items-center gap-2 bg-white/15 border border-white/20 text-xs font-semibold px-3 py-1.5 rounded-full">
              {savedChapters.length} bookmarked
            </div>
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {savedChapters.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-[#E8E4DC] dark:border-gray-700 rounded-2xl shadow-sm p-4 mb-6 space-y-3">
            {/* Subject filter */}
            <div>
              <p className="text-xs font-semibold text-[#6A6A84] dark:text-gray-400 mb-2">Subject</p>
              <div className="-mx-1 overflow-x-auto pb-1">
                <div className="px-1 inline-flex gap-2 min-w-max">
                  {subjects.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => setSelectedSubject(subject)}
                      className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors ${
                        selectedSubject === subject
                          ? 'bg-pink-600 text-white border-pink-600'
                          : 'bg-white dark:bg-gray-700 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800 hover:bg-pink-50 dark:hover:bg-pink-900/30'
                      }`}
                    >
                      {subject}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Class filter */}
            <div className="flex flex-wrap gap-2">
              {CLASS_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedClass(value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selectedClass === value
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(selectedSubject !== 'All' || selectedClass !== 0) && (
              <p className="text-xs text-[#8A8AAA]">
                Showing {filtered.length} of {savedChapters.length} bookmarks
                {filtered.length < savedChapters.length && (
                  <button
                    type="button"
                    onClick={() => { setSelectedSubject('All'); setSelectedClass(0); }}
                    className="ml-2 text-pink-600 font-semibold hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </p>
            )}
          </div>
        )}

        {filtered.length > 0 ? (
          <motion.div
            layout
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          >
            {filtered.map((chapter) => (
              <motion.div
                key={chapter.id}
                layout
                variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
              >
                <ChapterCard chapter={chapter} />
              </motion.div>
            ))}
          </motion.div>
        ) : savedChapters.length > 0 ? (
          <div className="text-center py-16">
            <p className="text-[#8A8AAA] mb-3">No bookmarks match the selected filters.</p>
            <button
              type="button"
              onClick={() => { setSelectedSubject('All'); setSelectedClass(0); }}
              className="text-sm font-semibold text-pink-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24 bg-white rounded-3xl border border-dashed border-[#E8E4DC] shadow-sm max-w-2xl mx-auto"
          >
            <div className="w-20 h-20 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Frown className="w-10 h-10 text-pink-400" />
            </div>
            <h3 className="font-fraunces text-2xl font-bold text-navy-700 mb-2">No chapters saved yet</h3>
            <p className="text-[#8A8AAA] max-w-md mx-auto mb-6">
              When you find a chapter difficult or want to save it for revision, hit the bookmark icon. It will appear right here.
            </p>
            <Link
              href="/chapters"
              className="inline-flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm"
            >
              Explore Chapters
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
