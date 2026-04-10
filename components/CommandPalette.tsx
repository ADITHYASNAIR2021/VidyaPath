'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Command, Book, ExternalLink } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Fuse from 'fuse.js';
import { ALL_CHAPTERS } from '@/lib/data';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

const searchData = [
  {
    type: 'page',
    id: 'formulas',
    title: 'Formula Database',
    subtitle: 'Search all formulas with SI units and chapter mapping',
    topics: 'formula katex equations',
    url: '/formulas',
  },
  {
    type: 'page',
    id: 'equations',
    title: 'Equations Library',
    subtitle: 'Subject-wise and chapter-wise equation map',
    topics: 'equations chapter wise subject wise formula handbook',
    url: '/equations',
  },
  {
    type: 'page',
    id: 'concept-web',
    title: 'Concept Web',
    subtitle: 'Visual knowledge graph across chapters',
    topics: 'concept graph interconnections',
    url: '/concept-web',
  },
  {
    type: 'page',
    id: 'cbse-notes',
    title: 'CBSE Notes',
    subtitle: 'SEO notes pages by class and chapter',
    topics: 'notes chapter wise',
    url: '/cbse-notes',
  },
  ...ALL_CHAPTERS.map((chapter) => ({
    type: 'chapter',
    id: chapter.id,
    title: chapter.title,
    subtitle: `${chapter.subject} - Class ${chapter.classLevel}`,
    topics: chapter.topics.join(' '),
    url: `/chapters/${chapter.id}`,
  })),
];

const fuse = new Fuse(searchData, {
  keys: ['title', 'topics', 'subtitle'],
  threshold: 0.3,
});

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const isExamRoute = pathname.startsWith('/exam/assignment/');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isExamRoute) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((value) => !value);
      }
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [isExamRoute]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [open]);

  const results = query ? fuse.search(query).map((entry) => entry.item).slice(0, 5) : searchData.slice(0, 4);

  if (isExamRoute) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        type="button"
        aria-label="Open command palette"
        className="hidden md:flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-[#8A8AAA] rounded-xl border border-[#E8E4DC] transition-colors w-64"
      >
        <Search className="w-4 h-4" />
        <span className="text-sm font-medium flex-1 text-left">Search everything...</span>
        <kbd className="hidden md:flex items-center gap-1 font-sans text-[10px] font-bold px-1.5 py-0.5 bg-white border border-[#E8E4DC] rounded shadow-sm text-[#8A8AAA]">
          <Command className="w-3 h-3" /> K
        </kbd>
      </button>

      <button
        className="md:hidden p-2 text-[#4A4A6A] hover:bg-gray-50 rounded-xl transition-colors"
        onClick={() => setOpen(true)}
        title="Search chapters"
        type="button"
        aria-label="Open search"
      >
        <Search className="w-5 h-5" />
      </button>

      <AnimatePresence>
        {open && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:px-4"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-navy-900/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#E8E4DC]"
            >
              <div className="flex items-center px-4 border-b border-[#E8E4DC]">
                <Search className="w-5 h-5 text-[#8A8AAA]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search chapters, subjects, or topics..."
                  className="w-full bg-transparent border-0 px-4 py-4 text-base text-navy-700 outline-none placeholder:text-[#8A8AAA]"
                  aria-label="Search chapters, subjects, or topics"
                />
                <button
                  type="button"
                  title="Close command palette"
                  onClick={() => setOpen(false)}
                  className="text-xs font-semibold text-[#8A8AAA] bg-gray-100 px-2 py-1 rounded-md hover:bg-gray-200"
                >
                  ESC
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-2">
                {results.length === 0 ? (
                  <div className="p-8 text-center text-[#8A8AAA]">
                    <Search className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                    <p>{`No results found for "${query}"`}</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {results.map((item) => (
                      <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => {
                          setOpen(false);
                          router.push(item.url);
                        }}
                        type="button"
                        className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-left group"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={clsx(
                              'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                              item.type === 'page' ? 'bg-indigo-50 text-indigo-500' : 'bg-saffron-50 text-saffron-500'
                            )}
                          >
                            <Book className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-navy-700">{item.title}</div>
                            <div className="text-xs text-[#8A8AAA]">{item.subtitle}</div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-[#8A8AAA] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
