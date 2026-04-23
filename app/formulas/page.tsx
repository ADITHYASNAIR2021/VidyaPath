'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import { Calculator, Search, Filter } from 'lucide-react';
import { BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { getAllFormulaEntries } from '@/lib/formulas';
import { fetchClientStudentSession } from '@/lib/client-student-session';
import { fetchClientAuthSession } from '@/lib/client-auth-session';
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

const formulaEntries = getAllFormulaEntries().filter((item) => item.classLevel !== 11);

export default function FormulasPage() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
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
      fetchClientAuthSession().catch(() => ({ role: 'anonymous', authenticated: false as const })),
    ])
      .then(([studentSession, authSession]) => {
        if (!active) return;
        setIsAuthenticated(authSession.role !== 'anonymous');
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
      if (enrolledSubjectSet && !enrolledSubjectSet.has(item.subject as Subject)) return false;
      return true;
    });

    if (!deferredQuery.trim()) return base;
    const ranked = new Map(fuse.search(deferredQuery.trim()).map((result, index) => [result.item.id, index]));
    return base
      .filter((item) => ranked.has(item.id))
      .sort((a, b) => (ranked.get(a.id) ?? 9999) - (ranked.get(b.id) ?? 9999));
  }, [deferredQuery, enrolledSubjectSet, fuse, jeeOnly, selectedClass, selectedSubject]);

  return (
    <div className="min-h-screen bg-[#FDFAF6] dark:bg-navy-900 text-[#1C1C2E] dark:text-gray-100">
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
          {isAuthenticated && (
            <div className="mt-3">
              <PushNotificationToggle />
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="sticky top-16 z-20 bg-[#FDFAF6]/95 dark:bg-navy-900/95 backdrop-blur pb-3">
          <div className="bg-white dark:bg-gray-900 border border-[#E8E4DC] dark:border-gray-700 rounded-2xl shadow-sm p-3 sm:p-4 mb-4 sm:mb-6 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#8A8AAA] dark:text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search formulas, chapters, topics..."
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-white dark:bg-gray-950 border border-[#E8E4DC] dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 text-[#1C1C2E] dark:text-gray-100"
            />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-[#6A6A84] dark:text-gray-300 inline-flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              Filters
            </span>
            <div className="-mx-1 overflow-x-auto pb-1 snap-x snap-mandatory">
              <div className="px-1 inline-flex gap-2 min-w-max">
                {subjectChoices.map((subject) => (
                  <button
                    key={subject}
                    onClick={() => setSelectedSubject(subject)}
                    className={`snap-start text-xs px-3 py-1.5 rounded-full border whitespace-nowrap ${
                      selectedSubject === subject
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-gray-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700'
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
                    className={`text-xs px-3 py-1.5 rounded-full border ${
                      selectedClass === classLevel
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-gray-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700'
                    }`}
                  >
                  {classLevel === 'All' ? 'All classes' : `Class ${classLevel}`}
                </button>
              ))}
              <button
                onClick={() => setJeeOnly((value) => !value)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  jeeOnly
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white dark:bg-gray-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700'
                }`}
              >
                JEE formulas only
              </button>
            </div>
          </div>
        </div>
        </div>

        <p className="text-sm text-[#6A6A84] dark:text-gray-300 mb-4">
          Showing <span className="font-semibold text-navy-700">{filtered.length}</span> formulas
        </p>
        {isStudent && (
          <p className="mb-4 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            Showing enrolled subjects only: {enrolledSubjects.join(', ') || 'None assigned yet'}.
          </p>
        )}
        {!isStudent && (
          <div className="mb-4 rounded-xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-2.5 flex items-center gap-3 text-sm">
            <span className="text-indigo-700 dark:text-indigo-200">Login to filter formulas by your enrolled subjects and track your revision.</span>
            <Link href="/student/login" className="ml-auto flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Login</Link>
          </div>
        )}

        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          {filtered.map((item) => (
            <div key={item.id} className="bg-white dark:bg-gray-900 border border-[#E8E4DC] dark:border-gray-700 rounded-2xl shadow-sm p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-navy-700 dark:text-gray-100 text-sm">{item.name}</h2>
                  <p className="text-xs text-[#6A6A84] dark:text-gray-400 mt-0.5 break-words">
                    Class {item.classLevel} - {item.subject} - Chapter {item.chapterNumber}
                  </p>
                </div>
                <span className="text-xs font-semibold bg-saffron-50 dark:bg-saffron-900/20 border border-saffron-200 dark:border-saffron-800 text-saffron-700 dark:text-saffron-300 px-2 py-1 rounded-full">
                  ~{item.marksWeight} marks
                </span>
              </div>

              <div className="mt-3 overflow-x-auto rounded-xl border border-[#F0ECE4] dark:border-gray-700 bg-[#FCFBF8] dark:bg-gray-950 px-3 py-2">
                <div className="equation-scroll">
                  <BlockMath math={item.latex} />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/35 border border-indigo-100 dark:border-indigo-800 px-2.5 py-2 text-indigo-800 dark:text-indigo-200">
                  <div className="font-semibold">SI Unit Hint</div>
                  <div className="mt-0.5">{item.siUnitHint}</div>
                </div>
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-800 px-2.5 py-2 text-emerald-800 dark:text-emerald-200">
                  <div className="font-semibold">JEE Flag</div>
                  <div className="mt-0.5">{item.appearsInJee ? 'Appears in JEE prep scope' : 'Board-first focus'}</div>
                </div>
              </div>

              {item.sourceName && (
                <p className="mt-2 text-[11px] text-[#6A6A84] dark:text-gray-400">
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
                className="mt-3 inline-flex text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200"
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
