'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';
import Fuse from 'fuse.js';
import { getAllFormulaEntries, getFormulaEntriesForChapter, type FormulaEntry } from '@/lib/formulas';

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

function fallbackEntries(
  formulas: { name: string; latex: string }[],
  chapterId?: string
): FormulaEntry[] {
  return formulas.map((formula, index) => ({
    id: `${chapterId || 'chapter'}-${index}`,
    name: formula.name,
    latex: formula.latex,
    chapterId: chapterId || '',
    chapterTitle: '',
    chapterNumber: 0,
    classLevel: 10,
    subject: '',
    marksWeight: 0,
    appearsInJee: false,
    siUnitHint: 'Depends on variables; write final SI unit explicitly in answers.',
    sourceLocator: chapterId ? `Mapped to chapter ${chapterId}` : 'Mapped to the current chapter card',
    sourceDetail: 'Using the chapter-local formula list because a richer handbook mapping is not available for this item yet.',
    usageNote: 'Use this as a quick chapter-revision formula and match each symbol back to the chapter explanation before substituting values.',
    pitfallNote: 'Confirm the chapter convention and unit expectations before applying the expression directly.',
    variableGuide: ['Read the chapter explanation for symbol meanings before substitution.'],
  }));
}

export default function FormulaCard({
  formulas,
  chapterId,
}: {
  formulas: { name: string; latex: string }[];
  chapterId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const chapterEntries = useMemo(() => {
    const enriched = chapterId ? getFormulaEntriesForChapter(chapterId) : [];
    return enriched.length > 0 ? enriched : fallbackEntries(formulas, chapterId);
  }, [chapterId, formulas]);

  const globalResults = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    return globalFuse.search(q).slice(0, 12).map((result) => result.item);
  }, [query]);

  const isSearching = globalResults !== null;

  if (!chapterEntries.length) return null;

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={() => {
          if (!isSearching) setOpen((current) => !current);
        }}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 sm:p-5"
      >
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-fraunces text-lg font-bold text-navy-700 dark:text-gray-100">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40">
              <Calculator className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            Key Formulas Cheat Sheet
          </h2>
          <p className="mt-1 text-xs text-[#8A8AAA] dark:text-gray-400">
            {chapterEntries.length} formula{chapterEntries.length === 1 ? '' : 's'} ready for quick revision
          </p>
        </div>
        {!isSearching && (
          open
            ? <ChevronUp className="mt-1 h-5 w-5 text-[#8A8AAA]" />
            : <ChevronDown className="mt-1 h-5 w-5 text-[#8A8AAA]" />
        )}
      </button>

      <div className="space-y-1.5 px-4 pb-4 sm:px-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A8AAA]" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search formulas across all chapters..."
            className="w-full rounded-xl border border-[#E8E4DC] bg-[#FDFAF6] py-2 pl-8 pr-8 text-sm text-[#1E1B2E] placeholder:text-[#8A8AAA] focus:outline-none focus:ring-2 focus:ring-purple-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8AAA] hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {isSearching ? (
          <p className="text-xs text-[#8A8AAA]">
            {globalResults!.length > 0
              ? `${globalResults!.length} matches across all chapters`
              : 'No formulas found - try different keywords'}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link href="/formulas" className="font-semibold text-indigo-700 hover:text-indigo-800 dark:text-indigo-400">
              Open full formula hub {'->'}
            </Link>
            <span className="text-[#8A8AAA] dark:text-gray-400">Swipe sideways on long equations</span>
          </div>
        )}
      </div>

      {isSearching && globalResults!.length > 0 && (
        <div className="space-y-3 border-t border-[#E8E4DC] p-4 dark:border-gray-700 sm:p-5">
          {globalResults!.map((item) => (
            <div key={item.id} className="rounded-xl border border-[#E8E4DC]/60 bg-[#FDFAF6] p-3 dark:border-gray-700 dark:bg-gray-900 sm:p-4">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-sm font-semibold text-navy-700 dark:text-gray-100">{item.name}</p>
                <Link
                  href={`/chapters/${item.chapterId}`}
                  className="w-fit rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 transition-colors hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50"
                >
                  {item.subject} - Ch {item.chapterNumber}
                </Link>
              </div>
              <div className="equation-scroll rounded-lg bg-white px-2 py-1 dark:bg-gray-800">
                <BlockMath math={item.latex} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isSearching && (
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-[#E8E4DC] dark:border-gray-700"
            >
              <div className="space-y-3 p-4 sm:space-y-4 sm:p-5">
                {chapterEntries.map((formula) => (
                  <div key={formula.id} className="rounded-xl border border-[#E8E4DC]/60 bg-[#FDFAF6] p-3 dark:border-gray-700 dark:bg-gray-900 sm:p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-navy-700 dark:text-gray-100">{formula.name}</div>
                        {formula.sourceName ? (
                          <div className="mt-1 text-[11px] text-[#8A8AAA] dark:text-gray-400">
                            Source: {formula.sourceName}
                          </div>
                        ) : null}
                      </div>
                      {formula.chapterNumber > 0 ? (
                        <span className="w-fit rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                          Ch {formula.chapterNumber}
                        </span>
                      ) : null}
                    </div>
                    <div className="equation-mobile-wrap mt-2 min-h-[4.25rem] rounded-lg bg-white px-2 py-2 text-base dark:bg-gray-800 sm:min-h-[4.75rem] sm:px-3 sm:py-3 sm:text-lg">
                      <div>
                        <BlockMath math={formula.latex} />
                      </div>
                    </div>
                    <div className="text-[11px] text-[#6E6984] dark:text-gray-400">
                      {formula.usageNote}
                    </div>
                    {formula.siUnitHint ? (
                      <div className="mt-1 text-[11px] text-[#6E6984] dark:text-gray-400">
                        Unit hint: {formula.siUnitHint}
                      </div>
                    ) : null}
                    {formula.chapterNumber > 0 ? (
                      <div className="mt-1 text-[11px] text-[#8A8AAA] dark:text-gray-400">
                        Source trace: {formula.sourceLocator}
                      </div>
                    ) : null}
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
