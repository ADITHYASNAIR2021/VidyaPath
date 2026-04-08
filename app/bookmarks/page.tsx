'use client';

import { motion } from 'framer-motion';
import { Bookmark, Frown } from 'lucide-react';
import { useBookmarkStore } from '@/lib/store';
import { ALL_CHAPTERS } from '@/lib/data';
import ChapterCard from '@/components/ChapterCard';
import Link from 'next/link';

export default function BookmarksPage() {
  const { bookmarkedChapterIds } = useBookmarkStore();
  
  // Find chapters that are bookmarked
  const savedChapters = ALL_CHAPTERS.filter(ch => bookmarkedChapterIds.includes(ch.id));

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
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
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12">
        {savedChapters.length > 0 ? (
          <motion.div 
            layout 
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.05 } },
            }}
          >
            {savedChapters.map((chapter) => (
              <motion.div
                key={chapter.id}
                layout
                variants={{
                  hidden: { opacity: 0, scale: 0.95 },
                  visible: { opacity: 1, scale: 1 },
                }}
              >
                <ChapterCard chapter={chapter} />
              </motion.div>
            ))}
          </motion.div>
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
