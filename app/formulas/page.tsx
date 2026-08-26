'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Fuse from 'fuse.js';
import { Calculator, Filter, Search } from 'lucide-react';
import { getAllFormulaEntries, type FormulaEntry } from '@/lib/formulas';
import { FORMULA_SOURCE_DOCS } from '@/lib/formula-handbook';
import { fetchClientAuthSession } from '@/lib/client-auth-session';
import PushNotificationToggle from '@/components/PushNotificationToggle';
import AccessibleFormula from '@/components/AccessibleFormula';

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
const VISIBLE_SUBJECTS = SUBJECTS.filter(
  (subject): subject is Exclude<(typeof SUBJECTS)[number], 'All'> => subject !== 'All'
);

const formulaEntries = getAllFormulaEntries().filter((item) => item.classLevel !== 11);

type ActiveView = 'cards' | 'chapters';

type ChapterFormulaGroup = {
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  entries: FormulaEntry[];
};

type SubjectFormulaGroup = {
  subject: (typeof VISIBLE_SUBJECTS)[number];
  total: number;
  chapters: ChapterFormulaGroup[];
};

export default function FormulasPage() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedSubject, setSelectedSubject] = useState<(typeof SUBJECTS)[number]>('All');
  const [selectedClass, setSelectedClass] = useState<(typeof CLASSES)[number]>('All');
  const [jeeOnly, setJeeOnly] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeView: ActiveView = searchParams.get('view') === 'chapters' ? 'chapters' : 'cards';

  useEffect(() => {
    let active = true;
    fetchClientAuthSession()
      .then((authSession) => {
        if (!active) return;
        setIsAuthenticated(authSession.role !== 'anonymous');
      })
      .catch(() => {
        if (!active) return;
        setIsAuthenticated(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const subjectChoices = useMemo(() => SUBJECTS, []);
  const totalChaptersCovered = useMemo(
    () => new Set(formulaEntries.map((entry) => entry.chapterId)).size,
    []
  );
  const sourceDocCount = useMemo(
    () => new Set(FORMULA_SOURCE_DOCS.map((doc) => `${doc.subject}:${doc.sourceName}`)).size,
    []
  );

  useEffect(() => {
    if (selectedSubject === 'All') return;
    if (!subjectChoices.includes(selectedSubject)) {
      setSelectedSubject('All');
    }
  }, [selectedSubject, subjectChoices]);

  const fuse = useMemo(
    () =>
      new Fuse(formulaEntries, {
        includeScore: true,
        threshold: 0.33,
        ignoreLocation: true,
        keys: [
          { name: 'name', weight: 0.35 },
          { name: 'chapterTitle', weight: 0.2 },
          { name: 'subject', weight: 0.15 },
          { name: 'latex', weight: 0.1 },
          { name: 'usageNote', weight: 0.1 },
          { name: 'variableGuide', weight: 0.1 },
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

    if (!deferredQuery.trim()) return base;
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const directMatches = base.filter((item) => {
      const searchable = [
        item.name,
        item.chapterTitle,
        item.subject,
        item.usageNote,
        ...item.variableGuide,
      ].join(' ').toLowerCase();
      return searchable.includes(normalizedQuery);
    });
    if (directMatches.length > 0) {
      return directMatches.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aRank = aName === normalizedQuery ? 0 : aName.startsWith(normalizedQuery) ? 1 : 2;
        const bRank = bName === normalizedQuery ? 0 : bName.startsWith(normalizedQuery) ? 1 : 2;
        return aRank - bRank || a.name.localeCompare(b.name);
      });
    }
    const ranked = new Map(
      fuse.search(deferredQuery.trim(), { limit: 24 }).map((result, index) => [result.item.id, index])
    );
    return base
      .filter((item) => ranked.has(item.id))
      .sort((a, b) => (ranked.get(a.id) ?? 9999) - (ranked.get(b.id) ?? 9999));
  }, [deferredQuery, fuse, jeeOnly, selectedClass, selectedSubject]);

  const grouped = useMemo<SubjectFormulaGroup[]>(() => {
    const subjectMap = new Map<string, Map<string, ChapterFormulaGroup>>();
    for (const item of filtered) {
      const subjectBucket = subjectMap.get(item.subject) ?? new Map<string, ChapterFormulaGroup>();
      const chapterBucket = subjectBucket.get(item.chapterId) ?? {
        chapterId: item.chapterId,
        chapterTitle: item.chapterTitle,
        chapterNumber: item.chapterNumber,
        entries: [],
      };
      chapterBucket.entries.push(item);
      subjectBucket.set(item.chapterId, chapterBucket);
      subjectMap.set(item.subject, subjectBucket);
    }

    const groups: SubjectFormulaGroup[] = [];
    for (const subject of VISIBLE_SUBJECTS) {
      const chapterMap = subjectMap.get(subject);
      if (!chapterMap) continue;
      const chapters = [...chapterMap.values()].sort((a, b) => {
        if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
        return a.chapterTitle.localeCompare(b.chapterTitle);
      });
      groups.push({
        subject,
        total: chapters.reduce((sum, chapter) => sum + chapter.entries.length, 0),
        chapters,
      });
    }
    return groups;
  }, [filtered]);

  function switchView(view: ActiveView) {
    const params = new URLSearchParams(searchParams.toString());
    if (view === 'chapters') {
      params.set('view', 'chapters');
    } else {
      params.delete('view');
    }
    const next = params.toString();
    router.replace(next ? `/formulas?${next}` : '/formulas', { scroll: false });
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] text-[#1C1C2E] dark:bg-navy-900 dark:text-gray-100">
      <div className="bg-gradient-to-br from-purple-700 via-indigo-700 to-sky-700 px-4 py-12 text-white">
        <div className="mx-auto max-w-7xl">
          <h1 className="font-fraunces text-3xl font-bold sm:text-4xl">Formula and Equation Hub</h1>
          <p className="mt-2 max-w-3xl text-sm text-purple-100 sm:text-base">
            One merged study surface for quick revision cards, chapter-wise equation maps, and source-backed usage guidance.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/20 bg-white/12 px-4 py-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-purple-100">
                <Calculator className="h-3.5 w-3.5" />
                Indexed formulas
              </div>
              <div className="mt-1 text-2xl font-bold">{formulaEntries.length}</div>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/12 px-4 py-3">
              <div className="text-xs font-semibold text-purple-100">Chapters covered</div>
              <div className="mt-1 text-2xl font-bold">{totalChaptersCovered}</div>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/12 px-4 py-3">
              <div className="text-xs font-semibold text-purple-100">Source sets linked</div>
              <div className="mt-1 text-2xl font-bold">{sourceDocCount}</div>
            </div>
          </div>
          {isAuthenticated && (
            <div className="mt-3">
              <PushNotificationToggle />
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-8">
        <div className="sticky top-14 z-20 bg-[#FDFAF6]/95 pb-3 backdrop-blur dark:bg-navy-900/95 sm:top-16">
          <div className="mb-4 space-y-3 rounded-2xl border border-[#E8E4DC] bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:mb-6 sm:p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8AAA] dark:text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search formulas, chapters, variable hints, or usage notes..."
                className="w-full rounded-xl border border-[#E8E4DC] bg-white py-2.5 pl-9 pr-3 text-sm text-[#1C1C2E] focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6A6A84] dark:text-gray-300">
                <Filter className="h-3.5 w-3.5" />
                Filters
              </span>
              <div className="-mx-1 snap-x snap-mandatory overflow-x-auto pb-1">
                <div className="inline-flex min-w-max gap-2 px-1">
                  {subjectChoices.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => setSelectedSubject(subject)}
                      className={`snap-start whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${
                        selectedSubject === subject
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-indigo-200 bg-white text-indigo-700 dark:border-indigo-700 dark:bg-gray-950 dark:text-indigo-300'
                      }`}
                    >
                      {subject}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {CLASSES.map((classLevel) => (
                  <button
                    key={classLevel}
                    type="button"
                    onClick={() => setSelectedClass(classLevel)}
                    className={`rounded-full border px-3 py-1.5 text-xs ${
                      selectedClass === classLevel
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-700 dark:bg-gray-950 dark:text-emerald-300'
                    }`}
                  >
                    {classLevel === 'All' ? 'All classes' : `Class ${classLevel}`}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setJeeOnly((value) => !value)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    jeeOnly
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-amber-200 bg-white text-amber-700 dark:border-amber-700 dark:bg-gray-950 dark:text-amber-300'
                  }`}
                >
                  JEE formulas only
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-[#E8E4DC] bg-[#FCFBF8] p-2 dark:border-gray-700 dark:bg-gray-950">
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => switchView('cards')}
                  className={`rounded-xl px-3 py-2 text-left transition-colors ${
                    activeView === 'cards'
                      ? 'bg-white text-navy-700 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                      : 'text-[#6A6A84] hover:bg-white/70 dark:text-gray-400 dark:hover:bg-gray-900/60'
                  }`}
                >
                  <div className="text-sm font-semibold">Revision Cards</div>
                  <div className="mt-0.5 text-xs">Deep formula cards with source trace, usage notes, and variable meaning.</div>
                </button>
                <button
                  type="button"
                  onClick={() => switchView('chapters')}
                  className={`rounded-xl px-3 py-2 text-left transition-colors ${
                    activeView === 'chapters'
                      ? 'bg-white text-navy-700 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                      : 'text-[#6A6A84] hover:bg-white/70 dark:text-gray-400 dark:hover:bg-gray-900/60'
                  }`}
                >
                  <div className="text-sm font-semibold">Chapter Map</div>
                  <div className="mt-0.5 text-xs">Subject-wise chapter clusters for scanning formulas exactly the way revision flows.</div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <p className="mb-2 text-sm text-[#6A6A84] dark:text-gray-300">
          Showing <span className="font-semibold text-navy-700 dark:text-gray-100">{filtered.length}</span> formulas in the{' '}
          <span className="font-semibold text-navy-700 dark:text-gray-100">
            {activeView === 'cards' ? 'revision cards' : 'chapter map'}
          </span>{' '}
          view
        </p>
        <p className="mb-4 text-xs text-[#8A8AAA] dark:text-gray-400">
          Long equations stay swipeable on mobile, and this page now doubles as the chapter-organized equation map too.
        </p>
        {!isAuthenticated && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm dark:border-indigo-800 dark:bg-indigo-950/30">
            <span className="text-indigo-700 dark:text-indigo-200">
              Login to track progress, bookmarks, and revision activity.
            </span>
            <Link href="/login" className="ml-auto flex-shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700">
              Login
            </Link>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                No formulas matched this filter. Try a broader subject, switch off JEE-only mode, or search with a concept name instead of a symbol.
              </div>
            ) : activeView === 'cards' ? (
              <div className="grid gap-3 sm:gap-4 2xl:grid-cols-2">
                {filtered.map((item) => (
                  <div key={item.id} className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-navy-700 dark:text-gray-100">{item.name}</h2>
                        <p className="mt-0.5 break-words text-xs text-[#6A6A84] dark:text-gray-400">
                          Class {item.classLevel} - {item.subject} - Chapter {item.chapterNumber}
                        </p>
                      </div>
                      <span className="w-fit rounded-full border border-saffron-200 bg-saffron-50 px-2 py-1 text-xs font-semibold text-saffron-700 dark:border-saffron-800 dark:bg-saffron-900/20 dark:text-saffron-300">
                        ~{item.marksWeight} marks
                      </span>
                    </div>

                    <div className="equation-scroll mt-3 flex min-h-[5rem] items-center justify-center rounded-xl border border-[#F0ECE4] bg-[#FCFBF8] px-3 py-3 dark:border-gray-700 dark:bg-gray-950 sm:min-h-[5.5rem] sm:px-4 sm:py-4">
                      <AccessibleFormula latex={item.latex} label={item.name} />
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                      <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-2 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/35 dark:text-indigo-200">
                        <div className="font-semibold">When to use</div>
                        <div className="mt-0.5">{item.usageNote}</div>
                      </div>
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                        <div className="font-semibold">Unit / result type</div>
                        <div className="mt-0.5">{item.siUnitHint}</div>
                      </div>
                    </div>

                    <div className="mt-2 rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                      <div className="text-xs font-semibold text-navy-700 dark:text-gray-100">Variable guide</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.variableGuide.map((guide) => (
                          <span key={`${item.id}-${guide}`} className="rounded-full border border-indigo-100 bg-white px-2 py-1 text-[11px] text-[#4A4A6A] dark:border-indigo-800 dark:bg-gray-900 dark:text-gray-300">
                            {guide}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-2 rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                      <div className="text-xs font-semibold text-navy-700 dark:text-gray-100">Source trace</div>
                      <p className="mt-1 text-[11px] text-[#4A4A6A] dark:text-gray-300">{item.sourceLocator}</p>
                      <p className="mt-1 text-[11px] text-[#6A6A84] dark:text-gray-400">{item.sourceDetail}</p>
                      {item.sourcePageHint ? (
                        <p className="mt-1 text-[11px] text-[#6A6A84] dark:text-gray-400">Locator hint: {item.sourcePageHint}</p>
                      ) : null}
                      {item.sourceName ? (
                        <p className="mt-1 text-[11px] text-[#6A6A84] dark:text-gray-400">
                          Source:{' '}
                          {item.sourceUrl ? (
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-indigo-700 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
                            >
                              {item.sourceName}
                            </a>
                          ) : (
                            item.sourceName
                          )}
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                      <div className="font-semibold">Watch for</div>
                      <div className="mt-0.5">{item.pitfallNote}</div>
                    </div>

                    <Link
                      href={`/chapters/${item.chapterId}`}
                      className="mt-3 inline-flex text-xs font-semibold text-indigo-700 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
                    >
                      Open {item.chapterTitle}
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map((subjectGroup) => (
                  <section key={subjectGroup.subject} className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white p-4 dark:border-gray-700 dark:bg-gray-900 sm:p-5">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                      <h2 className="font-fraunces text-xl font-bold text-navy-700 dark:text-gray-100">{subjectGroup.subject}</h2>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6E6984] dark:text-gray-400">
                        {subjectGroup.total} formulas
                      </p>
                    </div>
                    <div className="mt-3 space-y-3">
                      {subjectGroup.chapters.map((chapter) => (
                        <div key={chapter.chapterId} className="min-w-0 rounded-xl border border-[#E8E4DC] bg-[#FAF9F5] p-3 dark:border-gray-700 dark:bg-gray-950 sm:p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-navy-700 dark:text-gray-100">
                                Chapter {chapter.chapterNumber}: {chapter.chapterTitle}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[#6E6984] dark:text-gray-400">
                                {chapter.entries.length} formula{chapter.entries.length === 1 ? '' : 's'} in this chapter
                              </p>
                            </div>
                            <Link href={`/chapters/${chapter.chapterId}`} className="w-fit text-xs font-semibold text-indigo-700 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200">
                              Open chapter
                            </Link>
                          </div>
                          <div className="mt-3 grid min-w-0 gap-2 xl:grid-cols-2">
                            {chapter.entries.map((entry) => (
                              <div key={entry.id} className="min-w-0 rounded-lg border border-[#E8E4DC] bg-white px-2.5 py-2 dark:border-gray-700 dark:bg-gray-900 sm:px-3 sm:py-2.5">
                                <p className="text-xs font-semibold text-[#1F1F35] dark:text-gray-100">{entry.name}</p>
                                <div className="equation-scroll mt-1 flex min-h-[4.25rem] items-center justify-center rounded-lg bg-[#FCFBF8] px-2 py-2 dark:bg-gray-950 sm:min-h-[4.75rem] sm:px-3 sm:py-2.5">
                                  <AccessibleFormula latex={entry.latex} label={entry.name} compact />
                                </div>
                                <p className="mt-1 text-[11px] text-[#6E6984] dark:text-gray-400">{entry.usageNote}</p>
                                <p className="mt-0.5 text-[11px] text-[#6E6984] dark:text-gray-400">{entry.sourceLocator}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:h-fit">
            <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h3 className="font-fraunces text-lg font-bold text-navy-700 dark:text-gray-100">How This Hub Works</h3>
              <div className="mt-3 space-y-2 text-sm text-[#4A4A6A] dark:text-gray-300">
                <p><span className="font-semibold text-navy-700 dark:text-gray-100">Revision Cards:</span> use this when you want formula meaning, usage, variable guidance, and common mistakes in one card.</p>
                <p><span className="font-semibold text-navy-700 dark:text-gray-100">Chapter Map:</span> use this when you want to revise in textbook order without jumping between separate pages.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h3 className="font-fraunces text-lg font-bold text-navy-700 dark:text-gray-100">Phone App Access</h3>
              <p className="mt-1 text-xs text-[#6E6984] dark:text-gray-400">
                VidyaPath already supports install on phones, so this hub can open from the home screen like an app with fullscreen access and quicker relaunch.
              </p>
              <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
                Watch for the install prompt on mobile, or use your browser menu to add VidyaPath to the home screen.
              </div>
            </div>

            <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <h3 className="font-fraunces text-lg font-bold text-navy-700 dark:text-gray-100">Formula Sources</h3>
              <p className="mt-1 text-xs text-[#6E6984] dark:text-gray-400">Handbook and official source references aligned into the merged hub.</p>
              <div className="mt-3 space-y-2">
                {FORMULA_SOURCE_DOCS.map((doc) => (
                  <div key={`${doc.subject}-${doc.sourceName}`} className="rounded-lg border border-[#E8E4DC] bg-[#FAF9F5] px-2.5 py-2 dark:border-gray-700 dark:bg-gray-950">
                    <p className="text-xs font-semibold text-[#1F1F35] dark:text-gray-100">
                      {doc.sourceUrl ? (
                        <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-700 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200">
                          {doc.sourceName}
                        </a>
                      ) : (
                        doc.sourceName
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#6E6984] dark:text-gray-400">{doc.subject}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
