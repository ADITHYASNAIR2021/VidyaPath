'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import { Calculator, Search, Filter } from 'lucide-react';
import { BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { getAllFormulaEntries } from '@/lib/formulas';

const SUBJECTS = [
  'All',
  'Physics',
  'Chemistry',
  'Biology',
  'Math',
  'Accountancy',
  'Business Studies',
  'Economics',
  'English Core',
] as const;
const CLASSES = ['All', '10', '12'] as const;

const formulaEntries = getAllFormulaEntries().filter((item) => item.classLevel !== 11);

export default function FormulasPage() {
  const [query, setQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<(typeof SUBJECTS)[number]>('All');
  const [selectedClass, setSelectedClass] = useState<(typeof CLASSES)[number]>('All');
  const [jeeOnly, setJeeOnly] = useState(false);

  const fuse = useMemo(
    () =>
      new Fuse(formulaEntries, {
        includeScore: true,
        threshold: 0.33,
        ignoreLocation: true,
        keys: [
          { name: 'name', weight: 0.45 },
          { name: 'chapterTitle', weight: 0.25 },
          { name: 'subject', weight: 0.15 },
          { name: 'latex', weight: 0.15 },
        ],
      }),
    []
  );

  const filtered = useMemo(() => {
    const base = formulaEntries.filter((item) => {
      if (selectedSubject !== 'All' && item.subject !== selectedSubject) return false;
      if (selectedClass !== 'All' && String(item.classLevel) !== selectedClass) return false;
      if (jeeOnly && !item.appearsInJee) return false;
      return true;
    });

    if (!query.trim()) return base;
    const ranked = new Map(fuse.search(query.trim()).map((result, index) => [result.item.id, index]));
    return base
      .filter((item) => ranked.has(item.id))
      .sort((a, b) => (ranked.get(a.id) ?? 9999) - (ranked.get(b.id) ?? 9999));
  }, [fuse, jeeOnly, query, selectedClass, selectedSubject]);

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      <div className="bg-gradient-to-br from-purple-700 to-indigo-700 text-white px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-fraunces text-3xl sm:text-4xl font-bold">Formula Database</h1>
          <p className="text-purple-100 mt-2 text-sm sm:text-base">
            Search all board-important formulas with KaTeX rendering, chapter mapping, SI hints, and JEE flags.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 bg-white/15 border border-white/20 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Calculator className="w-3.5 h-3.5" />
            {formulaEntries.length} formulas indexed
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4 mb-6 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#8A8AAA] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search formulas, chapters, topics..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#E8E4DC] rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[#6A6A84] inline-flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              Filters
            </span>
            {SUBJECTS.map((subject) => (
              <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  selectedSubject === subject
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-700 border-indigo-200'
                }`}
              >
                {subject}
              </button>
            ))}
            {CLASSES.map((classLevel) => (
              <button
                key={classLevel}
                onClick={() => setSelectedClass(classLevel)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  selectedClass === classLevel
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-emerald-700 border-emerald-200'
                }`}
              >
                {classLevel === 'All' ? 'All classes' : `Class ${classLevel}`}
              </button>
            ))}
            <button
              onClick={() => setJeeOnly((value) => !value)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                jeeOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-200'
              }`}
            >
              JEE formulas only
            </button>
          </div>
        </div>

        <p className="text-sm text-[#6A6A84] mb-4">
          Showing <span className="font-semibold text-navy-700">{filtered.length}</span> formulas
        </p>

        <div className="grid lg:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <div key={item.id} className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-navy-700 text-sm">{item.name}</h2>
                  <p className="text-xs text-[#6A6A84] mt-0.5">
                    Class {item.classLevel} - {item.subject} - Chapter {item.chapterNumber}
                  </p>
                </div>
                <span className="text-xs font-semibold bg-saffron-50 border border-saffron-200 text-saffron-700 px-2 py-1 rounded-full">
                  ~{item.marksWeight} marks
                </span>
              </div>

              <div className="mt-3 overflow-x-auto rounded-xl border border-[#F0ECE4] bg-[#FCFBF8] px-3 py-2">
                <BlockMath math={item.latex} />
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-2.5 py-2 text-indigo-800">
                  <div className="font-semibold">SI Unit Hint</div>
                  <div className="mt-0.5">{item.siUnitHint}</div>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-2 text-emerald-800">
                  <div className="font-semibold">JEE Flag</div>
                  <div className="mt-0.5">{item.appearsInJee ? 'Appears in JEE prep scope' : 'Board-first focus'}</div>
                </div>
              </div>

              {item.sourceName && (
                <p className="mt-2 text-[11px] text-[#6A6A84]">
                  Source:{' '}
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-indigo-700 hover:text-indigo-800"
                    >
                      {item.sourceName}
                    </a>
                  ) : (
                    item.sourceName
                  )}
                </p>
              )}

              <Link
                href={`/chapters/${item.chapterId}`}
                className="mt-3 inline-flex text-xs font-semibold text-indigo-700 hover:text-indigo-800"
              >
                Open {item.chapterTitle}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


