'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';
import Fuse from 'fuse.js';
import { getAllFormulaEntries } from '@/lib/formulas';

const ALL_ENTRIES = getAllFormulaEntries();

const globalFuse = new Fuse(ALL_ENTRIES, {
  includeScore: true,
  threshold: 0.35,
  ignoreLocation: true,
  keys: [
    { name: 'name', weight: 0.5 },
    { name: 'chapterTitle', weight: 0.2 },
    { name: 'subject', weight: 0.15 },
    { name: 'latex', weight: 0.15 },
  ],
});

export default function FormulaCard({ formulas }: { formulas: { name: string; latex: string }[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const globalResults = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    return globalFuse.search(q).slice(0, 12).map((r) => r.item);
  }, [query]);

  const isSearching = globalResults !== null;

  if (!formulas || formulas.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-[#E8E4DC] dark:border-gray-700 shadow-sm overflow-hidden mb-5">
      {/* Header */}
      <button
        onClick={() => { if (!isSearching) setOpen((o) => !o); }}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
      >
        <h2 className="font-fraunces text-lg font-bold text-navy-700 dark:text-gray-100 flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
            <Calculator className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          Key Formulas Cheat Sheet
        </h2>
        {!isSearching && (
          open ? <ChevronUp className="w-5 h-5 text-[#8A8AAA]" /> : <ChevronDown className="w-5 h-5 text-[#8A8AAA]" />
        )}
      </button>

      {/* Search bar — always visible */}
      <div className="px-5 pb-4 -mt-1 space-y-1.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8A8AAA]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search formulas across ALL chapters…"
            className="w-full pl-8 pr-8 py-2 text-sm border border-[#E8E4DC] dark:border-gray-600 rounded-xl bg-[#FDFAF6] dark:bg-gray-900 text-[#1E1B2E] dark:text-gray-100 placeholder:text-[#8A8AAA] focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8AAA] hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {isSearching ? (
          <p className="text-xs text-[#8A8AAA]">
            {globalResults!.length > 0
              ? `${globalResults!.length} matches across all chapters`
              : 'No formulas found — try different keywords'}
          </p>
        ) : (
          <Link href="/formulas" className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 hover:text-indigo-800">
            Open full formula database →
          </Link>
        )}
      </div>

      {/* Global search results */}
      {isSearching && globalResults!.length > 0 && (
        <div className="border-t border-[#E8E4DC] dark:border-gray-700 p-5 space-y-4">
          {globalResults!.map((item) => (
            <div key={item.id} className="bg-[#FDFAF6] dark:bg-gray-900 rounded-xl p-4 border border-[#E8E4DC]/60 dark:border-gray-700">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-navy-700 dark:text-gray-100">{item.name}</p>
                <Link
                  href={`/chapters/${item.chapterId}`}
                  className="flex-shrink-0 text-[11px] font-semibold bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                >
                  {item.subject} · Ch {item.chapterNumber}
                </Link>
              </div>
              <div className="overflow-x-auto rounded-lg bg-white dark:bg-gray-800 px-2 py-1">
                <BlockMath math={item.latex} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Per-chapter formulas (collapsed by default, no search active) */}
      {!isSearching && (
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-[#E8E4DC] dark:border-gray-700 overflow-hidden"
            >
              <div className="p-5 space-y-4">
                {formulas.map((formula, idx) => (
                  <div key={idx} className="bg-[#FDFAF6] dark:bg-gray-900 rounded-xl p-4 border border-[#E8E4DC]/60 dark:border-gray-700">
                    <div className="text-sm font-semibold text-navy-700 dark:text-gray-100 mb-2">{formula.name}</div>
                    <div className="equation-mobile-wrap pb-1 text-lg">
                      <div>
                        <BlockMath math={formula.latex} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
