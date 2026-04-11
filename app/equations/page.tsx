'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import { Search, Filter } from 'lucide-react';
import { BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { getAllFormulaEntries } from '@/lib/formulas';
import { FORMULA_SOURCE_DOCS } from '@/lib/formula-handbook';
import { fetchClientStudentSession } from '@/lib/client-student-session';
import type { Subject } from '@/lib/data';
import PushNotificationToggle from '@/components/PushNotificationToggle';

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

const allEntries = getAllFormulaEntries().filter((item) => item.classLevel !== 11);

export default function EquationsPage() {
  const [query, setQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<(typeof SUBJECTS)[number]>('All');
  const [selectedClass, setSelectedClass] = useState<(typeof CLASSES)[number]>('All');
  const [jeeOnly, setJeeOnly] = useState(false);
  const [isStudent, setIsStudent] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [enrolledSubjects, setEnrolledSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchClientStudentSession().catch(() => null),
      fetch('/api/auth/session', { cache: 'no-store' })
        .then(async (response) => {
          const payload = await response.json().catch(() => null);
          const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
            ? payload.data as Record<string, unknown>
            : payload as Record<string, unknown> | null;
          return typeof data?.role === 'string' ? data.role : 'anonymous';
        })
        .catch(() => 'anonymous'),
    ])
      .then(([studentSession, role]) => {
        if (!active) return;
        setIsAuthenticated(role !== 'anonymous');
        if (!studentSession?.studentId) {
          setIsStudent(false);
          setEnrolledSubjects([]);
          return;
        }
        setIsStudent(true);
        setEnrolledSubjects(studentSession.enrolledSubjects);
      })
      .catch(() => {
        if (!active) return;
        setIsStudent(false);
        setIsAuthenticated(false);
        setEnrolledSubjects([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const enrolledSubjectSet = useMemo(() => {
    if (!isStudent) return null;
    return new Set<Subject>(enrolledSubjects);
  }, [enrolledSubjects, isStudent]);

  const subjectChoices = useMemo(
    () => SUBJECTS.filter((subject) => subject === 'All' || !enrolledSubjectSet || enrolledSubjectSet.has(subject as Subject)),
    [enrolledSubjectSet]
  );

  useEffect(() => {
    if (selectedSubject === 'All') return;
    if (!subjectChoices.includes(selectedSubject)) {
      setSelectedSubject('All');
    }
  }, [selectedSubject, subjectChoices]);

  const fuse = useMemo(
    () =>
      new Fuse(allEntries, {
        includeScore: true,
        threshold: 0.33,
        ignoreLocation: true,
        keys: [
          { name: 'name', weight: 0.4 },
          { name: 'chapterTitle', weight: 0.25 },
          { name: 'subject', weight: 0.2 },
          { name: 'latex', weight: 0.15 },
        ],
      }),
    []
  );

  const filtered = useMemo(() => {
    const base = allEntries.filter((item) => {
      if (selectedSubject !== 'All' && item.subject !== selectedSubject) return false;
      if (selectedClass !== 'All' && String(item.classLevel) !== selectedClass) return false;
      if (jeeOnly && !item.appearsInJee) return false;
      if (enrolledSubjectSet && !enrolledSubjectSet.has(item.subject as Subject)) return false;
      return true;
    });
    if (!query.trim()) return base;
    const ranked = new Map(fuse.search(query.trim()).map((result, index) => [result.item.id, index]));
    return base
      .filter((item) => ranked.has(item.id))
      .sort((a, b) => (ranked.get(a.id) ?? 9999) - (ranked.get(b.id) ?? 9999));
  }, [enrolledSubjectSet, fuse, jeeOnly, query, selectedClass, selectedSubject]);

  const grouped = useMemo(() => {
    const subjectMap = new Map<string, Map<string, typeof filtered>>();
    for (const item of filtered) {
      const subjectBucket = subjectMap.get(item.subject) ?? new Map<string, typeof filtered>();
      const chapterKey = `${item.chapterId}|${item.chapterTitle}`;
      const chapterBucket = subjectBucket.get(chapterKey) ?? [];
      chapterBucket.push(item);
      subjectBucket.set(chapterKey, chapterBucket);
      subjectMap.set(item.subject, subjectBucket);
    }
    return subjectMap;
  }, [filtered]);

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      <div className="bg-gradient-to-br from-indigo-700 to-sky-700 px-4 py-12 text-white">
        <div className="mx-auto max-w-7xl">
          <h1 className="font-fraunces text-3xl font-bold sm:text-4xl">Equations Library</h1>
          <p className="mt-2 text-sm text-indigo-100 sm:text-base">
            Search and filter equations by class, subject, and exam relevance with mobile-safe KaTeX rendering.
          </p>
          {isAuthenticated && (
            <div className="mt-3">
              <PushNotificationToggle />
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 rounded-2xl border border-[#E8E4DC] bg-white p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8AAA]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search equations, chapters, topics..."
              className="w-full rounded-xl border border-[#E8E4DC] py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div className="mt-3 space-y-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6A6A84]">
              <Filter className="h-3.5 w-3.5" />
              Filters
            </span>
            <div className="-mx-1 overflow-x-auto pb-1">
              <div className="inline-flex min-w-max gap-2 px-1">
                {subjectChoices.map((subject) => (
                  <button
                    key={subject}
                    onClick={() => setSelectedSubject(subject)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${
                      selectedSubject === subject
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-indigo-200 bg-white text-indigo-700'
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
                  onClick={() => setSelectedClass(classLevel)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    selectedClass === classLevel
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-emerald-200 bg-white text-emerald-700'
                  }`}
                >
                  {classLevel === 'All' ? 'All classes' : `Class ${classLevel}`}
                </button>
              ))}
              <button
                onClick={() => setJeeOnly((value) => !value)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  jeeOnly ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 bg-white text-amber-700'
                }`}
              >
                JEE equations only
              </button>
            </div>
          </div>
        </div>

        <p className="mb-4 text-sm text-[#6A6A84]">
          Showing <span className="font-semibold text-navy-700">{filtered.length}</span> equations
        </p>
        {isStudent && (
          <p className="mb-4 text-xs font-semibold text-indigo-700">
            Showing enrolled subjects only: {enrolledSubjects.join(', ') || 'None assigned yet'}.
          </p>
        )}
        {!isStudent && (
          <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 flex items-center gap-3 text-sm">
            <span className="text-indigo-700">Login to filter equations by your enrolled subjects and save favourites.</span>
            <Link href="/student/login" className="ml-auto flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Login</Link>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-4">
            {SUBJECTS.filter((subject) => subject !== 'All' && grouped.has(subject)).map((subject) => {
              const chapters = grouped.get(subject)!;
              return (
                <section key={subject} className="rounded-2xl border border-[#E8E4DC] bg-white p-4">
                  <h2 className="font-fraunces text-xl font-bold text-navy-700">{subject}</h2>
                  <div className="mt-3 space-y-3">
                    {[...chapters.entries()]
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([chapterKey, equations]) => {
                        const [chapterId, chapterTitle] = chapterKey.split('|');
                        return (
                          <div key={chapterKey} className="min-w-0 rounded-xl border border-[#E8E4DC] bg-[#FAF9F5] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-navy-700">{chapterTitle}</p>
                              <Link href={`/chapters/${chapterId}`} className="text-xs font-semibold text-indigo-700 hover:text-indigo-800">
                                Open chapter
                              </Link>
                            </div>
                            <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2">
                              {equations.map((entry) => (
                                <div key={entry.id} className="min-w-0 rounded-lg border border-[#E8E4DC] bg-white px-2.5 py-2">
                                  <p className="text-xs font-semibold text-[#1F1F35]">{entry.name}</p>
                                  <div className="equation-scroll mt-1 overflow-x-auto">
                                    <div className="min-w-max">
                                      <BlockMath math={entry.latex} />
                                    </div>
                                  </div>
                                  <p className="mt-1 text-[11px] text-[#6E6984]">Unit hint: {entry.siUnitHint}</p>
                                  <p className="mt-0.5 text-[11px] text-[#6E6984]">
                                    {entry.appearsInJee ? 'JEE relevance' : 'Board relevance'}
                                  </p>
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

          <aside className="h-fit rounded-2xl border border-[#E8E4DC] bg-white p-4">
            <h3 className="font-fraunces text-lg font-bold text-navy-700">Formula Sources</h3>
            <p className="mt-1 text-xs text-[#6E6984]">Handbook and official source references.</p>
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
                  <p className="mt-0.5 text-[11px] text-[#6E6984]">{doc.subject}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
