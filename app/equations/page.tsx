'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { getAllFormulaEntries } from '@/lib/formulas';
import { FORMULA_SOURCE_DOCS } from '@/lib/formula-handbook';

const SUBJECT_ORDER = ['Physics', 'Chemistry', 'Biology', 'Math', 'Accountancy', 'Business Studies', 'Economics', 'English Core'] as const;
const CLASS_FILTERS = ['All', '10', '12'] as const;

export default function EquationsPage() {
  const [selectedClass, setSelectedClass] = useState<(typeof CLASS_FILTERS)[number]>('All');
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const allFormulas = useMemo(() => getAllFormulaEntries().filter((item) => item.classLevel !== 11), []);

  const filtered = useMemo(() => {
    return allFormulas.filter((item) => {
      if (selectedClass !== 'All' && String(item.classLevel) !== selectedClass) return false;
      if (selectedSubject !== 'All' && item.subject !== selectedSubject) return false;
      return true;
    });
  }, [allFormulas, selectedClass, selectedSubject]);

  const grouped = useMemo(() => {
    const subjectMap = new Map<string, Map<string, typeof filtered>>();
    for (const formula of filtered) {
      const subjectBucket = subjectMap.get(formula.subject) ?? new Map<string, typeof filtered>();
      const chapterKey = `${formula.chapterId}|${formula.chapterTitle}`;
      const chapterBucket = subjectBucket.get(chapterKey) ?? [];
      chapterBucket.push(formula);
      subjectBucket.set(chapterKey, chapterBucket);
      subjectMap.set(formula.subject, subjectBucket);
    }
    return subjectMap;
  }, [filtered]);

  return (
    <div className="min-h-screen bg-[#FDFAF6] overflow-x-hidden">
      <div className="bg-gradient-to-br from-indigo-700 to-sky-700 text-white px-4 py-12">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-fraunces text-3xl sm:text-4xl font-bold">Equations Library</h1>
          <p className="text-indigo-100 mt-2 text-sm sm:text-base">
            Subject-wise and chapter-wise equation bank with KaTeX rendering, PYQ alignment, and source traceability.
          </p>
          <p className="text-indigo-100/90 mt-2 text-xs">
            Indexed from chapter mappings + uploaded formula handbooks + curated commerce formulas.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 mb-5">
          <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
            <div className="-mx-1 overflow-x-auto pb-1">
              <div className="px-1 inline-flex min-w-max gap-2">
                {CLASS_FILTERS.map((value) => (
                  <button
                    key={value}
                    onClick={() => setSelectedClass(value)}
                    className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap ${selectedClass === value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-200'}`}
                  >
                    {value === 'All' ? 'All classes' : `Class ${value}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <select
                value={selectedSubject}
                onChange={(event) => setSelectedSubject(event.target.value)}
                className="text-xs border border-[#E8E4DC] rounded-lg px-2 py-1.5 max-w-[48vw] sm:max-w-none"
              >
                <option value="All">All subjects</option>
                {SUBJECT_ORDER.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </select>
              <Link href="/formulas" className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 whitespace-nowrap">
                Open searchable formulas
              </Link>
            </div>
          </div>
        </div>

        <div className="grid xl:grid-cols-[1fr_280px] gap-5">
          <div className="space-y-4 min-w-0">
            {SUBJECT_ORDER.filter((subject) => grouped.has(subject)).map((subject) => {
              const chapters = grouped.get(subject)!;
              return (
                <section key={subject} className="rounded-2xl border border-[#E8E4DC] bg-white p-4">
                  <h2 className="font-fraunces text-xl font-bold text-navy-700">{subject}</h2>
                  <div className="mt-3 space-y-3">
                    {[...chapters.entries()]
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([chapterKey, formulas]) => {
                        const [chapterId, chapterTitle] = chapterKey.split('|');
                        return (
                          <div key={chapterKey} className="rounded-xl border border-[#E8E4DC] bg-[#FAF9F5] p-3 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-navy-700">{chapterTitle}</p>
                              <Link href={`/chapters/${chapterId}`} className="text-xs font-semibold text-indigo-700 hover:text-indigo-800">
                                Open chapter
                              </Link>
                            </div>
                            <div className="mt-2 grid md:grid-cols-2 gap-2 min-w-0">
                              {formulas.map((formula) => (
                                <div key={formula.id} className="rounded-lg border border-[#E8E4DC] bg-white px-2.5 py-2 min-w-0">
                                  <p className="text-xs font-semibold text-[#1F1F35]">{formula.name}</p>
                                  <div className="mt-1 overflow-x-auto">
                                    <BlockMath math={formula.latex} />
                                  </div>
                                  <p className="text-[11px] text-[#6E6984] mt-1">Unit hint: {formula.siUnitHint}</p>
                                  {formula.sourceName && (
                                    <p className="text-[11px] text-[#6E6984] mt-0.5">
                                      Source:{' '}
                                      {formula.sourceUrl ? (
                                        <a
                                          href={formula.sourceUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-semibold text-indigo-700 hover:text-indigo-800"
                                        >
                                          {formula.sourceName}
                                        </a>
                                      ) : (
                                        formula.sourceName
                                      )}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </section>
              );
            })}
            {filtered.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No equations found for this filter.
              </div>
            )}
          </div>

          <aside className="rounded-2xl border border-[#E8E4DC] bg-white p-4 h-fit">
            <h3 className="font-fraunces text-lg font-bold text-navy-700">Formula Sources</h3>
            <p className="text-xs text-[#6E6984] mt-1">
              Source files used for handbook-based expansion.
            </p>
            <div className="mt-3 space-y-2">
              {FORMULA_SOURCE_DOCS.map((doc) => (
                <div key={`${doc.subject}-${doc.sourceName}`} className="rounded-lg border border-[#E8E4DC] bg-[#FAF9F5] px-2.5 py-2">
                  <p className="text-xs font-semibold text-[#1F1F35]">
                    {doc.sourceUrl ? (
                      <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-700 hover:text-indigo-800">
                        {doc.sourceName}
                      </a>
                    ) : (
                      doc.sourceName
                    )}
                  </p>
                  <p className="text-[11px] text-[#6E6984] mt-0.5">{doc.subject}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
