'use client';

import { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  Search,
  Atom,
  FlaskConical,
  Leaf,
  Calculator,
  SlidersHorizontal,
  CheckCircle2,
  Briefcase,
  LineChart,
  BookOpen,
} from 'lucide-react';
import clsx from 'clsx';
import Fuse from 'fuse.js';
import { ALL_CHAPTERS } from '@/lib/data';
import type { Subject, ClassLevel } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { fetchClientStudentSession } from '@/lib/client-student-session';
import { getSubjectsForAcademicTrack, type AcademicStream } from '@/lib/academic-taxonomy';
import ChapterCard from '@/components/ChapterCard';
import ScrollToTopOnMount from '@/components/ScrollToTopOnMount';
import { useProgressStore } from '@/lib/store';

const SUBJECTS: { label: string; value: Subject | 'All'; icon: React.ElementType }[] = [
  { label: 'All', value: 'All', icon: SlidersHorizontal },
  { label: 'Physics', value: 'Physics', icon: Atom },
  { label: 'Chemistry', value: 'Chemistry', icon: FlaskConical },
  { label: 'Biology', value: 'Biology', icon: Leaf },
  { label: 'Math', value: 'Math', icon: Calculator },
  { label: 'Accountancy', value: 'Accountancy', icon: Briefcase },
  { label: 'Business Studies', value: 'Business Studies', icon: LineChart },
  { label: 'Economics', value: 'Economics', icon: LineChart },
  { label: 'English Core', value: 'English Core', icon: BookOpen },
];

const CLASS10_PUBLIC_SUBJECTS = new Set<Subject>(['Physics', 'Chemistry', 'Biology', 'Math', 'English Core']);

const CLASSES: { label: string; value: ClassLevel | 0 }[] = [
  { label: 'All Classes', value: 0 },
  { label: 'Class 10', value: 10 },
  { label: 'Class 12', value: 12 },
];

const SUBJECT_PILL_STYLES: Record<string, string> = {
  All: 'bg-navy-700 text-white border-navy-700',
  Physics: 'bg-sky-600 text-white border-sky-600',
  Chemistry: 'bg-emerald-600 text-white border-emerald-600',
  Biology: 'bg-green-600 text-white border-green-600',
  Math: 'bg-purple-600 text-white border-purple-600',
  Accountancy: 'bg-amber-600 text-white border-amber-600',
  'Business Studies': 'bg-indigo-600 text-white border-indigo-600',
  Economics: 'bg-rose-600 text-white border-rose-600',
  'English Core': 'bg-cyan-600 text-white border-cyan-600',
};

const SUBJECT_PILL_INACTIVE: Record<string, string> = {
  All: 'bg-white dark:bg-gray-950 text-[#4A4A6A] dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-navy-300 dark:hover:border-gray-500',
  Physics: 'bg-white dark:bg-gray-950 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800 hover:border-sky-400',
  Chemistry: 'bg-white dark:bg-gray-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:border-emerald-400',
  Biology: 'bg-white dark:bg-gray-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 hover:border-green-400',
  Math: 'bg-white dark:bg-gray-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:border-purple-400',
  Accountancy: 'bg-white dark:bg-gray-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:border-amber-400',
  'Business Studies': 'bg-white dark:bg-gray-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:border-indigo-400',
  Economics: 'bg-white dark:bg-gray-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:border-rose-400',
  'English Core': 'bg-white dark:bg-gray-950 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 hover:border-cyan-400',
};

function ChaptersContent() {
  const searchParams = useSearchParams();
  const initialSubject = (searchParams.get('subject') as Subject) || 'All';
  const initialClass = Number(searchParams.get('class') || 0) as ClassLevel | 0;

  const [selectedClass, setSelectedClass] = useState<ClassLevel | 0>(initialClass);
  const [selectedSubject, setSelectedSubject] = useState<Subject | 'All'>(
    SUBJECTS.find((s) => s.value === initialSubject) ? initialSubject : 'All'
  );
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [studentSession, setStudentSession] = useState<{
    isStudent: boolean;
    classLevel?: ClassLevel;
    stream?: AcademicStream;
    enrolledSubjects: Subject[];
  }>({
    isStudent: false,
    enrolledSubjects: [],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const trackedNoResultQueries = useRef(new Set<string>());
  const { studiedChapterIds } = useProgressStore();

  useEffect(() => {
    let active = true;
    fetchClientStudentSession()
      .then((session) => {
        if (!active) return;
        if (session?.studentId) {
          const sessionClass = session.classLevel === 10 || session.classLevel === 12
            ? session.classLevel
            : undefined;
          if (sessionClass) {
            setSelectedClass(sessionClass);
          }
          setStudentSession({
            isStudent: true,
            classLevel: sessionClass,
            stream: session.stream,
            enrolledSubjects: session.enrolledSubjects,
          });
        } else {
          setStudentSession({
            isStudent: false,
            enrolledSubjects: [],
          });
        }
      })
      .catch(() => {
        if (!active) return;
        setStudentSession({
          isStudent: false,
          enrolledSubjects: [],
        });
      })
      .finally(() => {
        if (active) setSessionLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [initialClass]);

  const enrolledSubjectSet = useMemo(() => {
    if (!studentSession.isStudent) return null;
    if (studentSession.classLevel === 10) {
      // Class 10 uses fixed public subject scope; no enrollment gating.
      return null;
    }
    if (studentSession.enrolledSubjects.length > 0) {
      return new Set<Subject>(studentSession.enrolledSubjects);
    }
    if (studentSession.classLevel === 12) {
      return new Set<Subject>(
        getSubjectsForAcademicTrack(studentSession.classLevel, studentSession.stream) as Subject[]
      );
    }
    return null;
  }, [studentSession.classLevel, studentSession.enrolledSubjects, studentSession.isStudent, studentSession.stream]);

  const classTabs = useMemo(() => {
    if (studentSession.isStudent && (studentSession.classLevel === 10 || studentSession.classLevel === 12)) {
      return CLASSES.filter((item) => item.value === studentSession.classLevel);
    }
    return CLASSES;
  }, [studentSession.classLevel, studentSession.isStudent]);

  const availableSubjects = useMemo(() => {
    const classScoped = ALL_CHAPTERS.filter((chapter) => (selectedClass === 0 ? chapter.classLevel !== 11 : chapter.classLevel === selectedClass));
    const subjectSet = new Set<Subject>(classScoped.map((chapter) => chapter.subject));
    if (enrolledSubjectSet) {
      for (const subject of Array.from(subjectSet)) {
        if (!enrolledSubjectSet.has(subject)) {
          subjectSet.delete(subject);
        }
      }
    }
    if (selectedClass === 10) {
      for (const subject of Array.from(subjectSet)) {
        if (!CLASS10_PUBLIC_SUBJECTS.has(subject)) {
          subjectSet.delete(subject);
        }
      }
    }
    return SUBJECTS.filter((item) => item.value === 'All' || subjectSet.has(item.value as Subject));
  }, [enrolledSubjectSet, selectedClass]);

  useEffect(() => {
    if (selectedSubject === 'All') return;
    if (!availableSubjects.some((item) => item.value === selectedSubject)) {
      setSelectedSubject('All');
    }
  }, [availableSubjects, selectedSubject]);

  const chapterSearchDocs = useMemo(() => {
    return ALL_CHAPTERS.map((chapter) => {
      const pyq = getPYQData(chapter.id);
      return {
        id: chapter.id,
        title: chapter.title,
        subject: chapter.subject,
        description: chapter.description,
        topics: chapter.topics,
        importantTopics: pyq?.importantTopics ?? [],
      };
    });
  }, []);

  const chapterFuse = useMemo(() => {
    return new Fuse(chapterSearchDocs, {
      includeScore: true,
      threshold: 0.34,
      ignoreLocation: true,
      keys: [
        { name: 'title', weight: 0.35 },
        { name: 'subject', weight: 0.15 },
        { name: 'topics', weight: 0.3 },
        { name: 'importantTopics', weight: 0.3 },
        { name: 'description', weight: 0.1 },
      ],
    });
  }, [chapterSearchDocs]);

  const searchOrder = useMemo(() => {
    const query = deferredSearchQuery.trim();
    if (!query) return null;
    const ordered = new Map<string, number>();
    chapterFuse.search(query).forEach((hit, idx) => {
      ordered.set(hit.item.id, idx);
    });
    return ordered;
  }, [chapterFuse, deferredSearchQuery]);

  const filtered = useMemo(() => {
    const base = ALL_CHAPTERS.filter((ch) => {
      if (studentSession.isStudent && (studentSession.classLevel === 10 || studentSession.classLevel === 12)) {
        if (ch.classLevel !== studentSession.classLevel) return false;
      }
      if (studentSession.classLevel === 10 && !CLASS10_PUBLIC_SUBJECTS.has(ch.subject)) return false;
      if (selectedClass !== 0 && ch.classLevel !== selectedClass) return false;
      if (selectedSubject !== 'All' && ch.subject !== selectedSubject) return false;
      if (enrolledSubjectSet && !enrolledSubjectSet.has(ch.subject)) return false;
      return true;
    });

    const query = deferredSearchQuery.trim();
    if (!query || !searchOrder) return base;

    const filteredBySearch = base.filter((chapter) => searchOrder.has(chapter.id));
    return filteredBySearch.sort((a, b) => (searchOrder.get(a.id) ?? 9999) - (searchOrder.get(b.id) ?? 9999));
  }, [deferredSearchQuery, enrolledSubjectSet, searchOrder, selectedClass, selectedSubject, studentSession.classLevel, studentSession.isStudent]);

  const headerScope = useMemo(() => {
    if (studentSession.isStudent && (studentSession.classLevel === 10 || studentSession.classLevel === 12)) {
      return `Class ${studentSession.classLevel} chapter workspace with PYQ insights, NCERT links, and guided practice.`;
    }
    return 'Class 10 and Class 12 chapter workspace with PYQ insights, NCERT links, and guided practice.';
  }, [studentSession.classLevel, studentSession.isStudent]);

  const headerTotalChapters = useMemo(() => {
    if (studentSession.isStudent && (studentSession.classLevel === 10 || studentSession.classLevel === 12)) {
      return ALL_CHAPTERS.filter((chapter) => {
        if (chapter.classLevel !== studentSession.classLevel) return false;
        if (studentSession.classLevel === 10 && !CLASS10_PUBLIC_SUBJECTS.has(chapter.subject)) return false;
        if (enrolledSubjectSet && !enrolledSubjectSet.has(chapter.subject)) return false;
        return true;
      }).length;
    }
    return ALL_CHAPTERS.length;
  }, [enrolledSubjectSet, studentSession.classLevel, studentSession.isStudent]);

  const studiedInScopeCount = useMemo(() => {
    const allowedIds = new Set(
      ALL_CHAPTERS.filter((chapter) => {
        if (studentSession.isStudent && (studentSession.classLevel === 10 || studentSession.classLevel === 12)) {
          if (chapter.classLevel !== studentSession.classLevel) return false;
          if (studentSession.classLevel === 10 && !CLASS10_PUBLIC_SUBJECTS.has(chapter.subject)) return false;
          if (enrolledSubjectSet && !enrolledSubjectSet.has(chapter.subject)) return false;
        }
        return true;
      }).map((chapter) => chapter.id)
    );
    return studiedChapterIds.filter((id) => allowedIds.has(id)).length;
  }, [enrolledSubjectSet, studiedChapterIds, studentSession.classLevel, studentSession.isStudent]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || filtered.length > 0) return;
    const key = `${selectedClass}|${selectedSubject}|${query.toLowerCase()}`;
    if (trackedNoResultQueries.current.has(key)) return;
    trackedNoResultQueries.current.add(key);
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'search_no_result', query }),
      keepalive: true,
    }).catch(() => {
      // best-effort only
    });
  }, [filtered.length, searchQuery, selectedClass, selectedSubject]);

  const getPyqSearchInsight = (chapterId: string) => {
    const pyq = getPYQData(chapterId);
    if (!pyq || !searchQuery.trim()) return null;

    const query = searchQuery.trim().toLowerCase();
    const matchedTopic = pyq.importantTopics.find((topic) => topic.toLowerCase().includes(query));
    if (!matchedTopic) return null;

    const years = [...pyq.yearsAsked].sort((a, b) => b - a).slice(0, 5).join(', ');
    return {
      topic: matchedTopic,
      years,
      avgMarks: pyq.avgMarks,
    };
  };

  return (
    <div className="min-h-screen bg-[#FDFAF6] dark:bg-navy-900 text-[#1C1C2E] dark:text-gray-100">
      <ScrollToTopOnMount />
      {/* Header */}
      <div className="bg-gradient-to-br from-navy-700 to-navy-800 text-white px-4 py-10 sm:py-12">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-fraunces text-3xl sm:text-4xl font-bold mb-2">Chapter Library</h1>
          <p className="text-navy-200 text-sm sm:text-base">
            {headerScope}
          </p>
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <div className="text-sm text-navy-300">
              <span className="font-semibold text-white">{headerTotalChapters}</span> chapters total
            </div>
            {studiedChapterIds.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {studiedInScopeCount} / {headerTotalChapters} studied
                </div>
                <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${headerTotalChapters > 0 ? Math.round((studiedInScopeCount / headerTotalChapters) * 100) : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-16 z-30 bg-[#FDFAF6]/95 dark:bg-navy-900/95 backdrop-blur border-b border-[#E8E4DC] dark:border-gray-700 px-3 sm:px-4 py-3">
        <div className="max-w-5xl mx-auto space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8AAA] dark:text-gray-400" />
            <input
              type="text"
              placeholder="Search chapters, topics, or subjects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white dark:bg-gray-950 border border-[#E8E4DC] dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron-400 focus:border-transparent placeholder:text-[#8A8AAA] dark:placeholder:text-gray-500 text-[#1C1C2E] dark:text-gray-100"
            />
          </div>

          {/* Class Tabs */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5 snap-x snap-mandatory">
            {classTabs.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setSelectedClass(value)}
                className={clsx(
                  'snap-start flex-shrink-0 text-sm font-medium px-4 py-1.5 rounded-xl border transition-all duration-150',
                  selectedClass === value
                    ? 'bg-navy-700 text-white border-navy-700 shadow-sm'
                    : 'bg-white dark:bg-gray-950 text-[#4A4A6A] dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-navy-300 dark:hover:border-gray-500'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Subject Pills */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5 snap-x snap-mandatory">
            {availableSubjects.map(({ label, value, icon: Icon }) => {
              const SafeIcon = Icon ?? SlidersHorizontal;
              return (
              <button
                key={value}
                onClick={() => setSelectedSubject(value)}
                className={clsx(
                  'snap-start flex-shrink-0 flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-xl border transition-all duration-150',
                  selectedSubject === value
                    ? SUBJECT_PILL_STYLES[value]
                    : SUBJECT_PILL_INACTIVE[value]
                )}
              >
                <SafeIcon className="w-3.5 h-3.5" />
                {label}
              </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <Search className="w-12 h-12 text-[#C7C5BD] dark:text-gray-600 mx-auto mb-4" />
            <h3 className="font-fraunces text-xl font-bold text-navy-700 dark:text-gray-100 mb-2">No chapters found</h3>
            <p className="text-[#4A4A6A] dark:text-gray-300">Try changing your filters or search query.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-[#8A8AAA] dark:text-gray-400 mb-5">
              Showing <span className="font-semibold text-navy-700">{filtered.length}</span> chapter
              {filtered.length !== 1 ? 's' : ''}
              {selectedClass !== 0 ? ` - Class ${selectedClass}` : ''}
              {selectedSubject !== 'All' ? ` - ${selectedSubject}` : ''}
              {deferredSearchQuery ? ` for "${deferredSearchQuery}"` : ''}
            </p>
            {sessionLoaded && studentSession.isStudent && (
              <p className="mb-4 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                {studentSession.classLevel === 10
                  ? `Showing Class 10 core subjects: ${Array.from(CLASS10_PUBLIC_SUBJECTS).join(', ')}.`
                  : `Showing only your enrolled subjects: ${Array.from(enrolledSubjectSet ?? []).join(', ') || 'None assigned yet'}.`}
              </p>
            )}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((chapter, i) => {
                const pyqInsight = getPyqSearchInsight(chapter.id);
                return (
                  <div
                    key={chapter.id}
                    className="animate-fade-in-up"
                    style={{ animationDelay: `${Math.min(i * 0.04, 0.4)}s` }}
                  >
                    <ChapterCard chapter={chapter} />
                    {pyqInsight && (
                      <div className="mt-2 rounded-xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2">
                        <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">PYQ Hit</div>
                        <p className="text-xs text-indigo-900 dark:text-indigo-200 mt-0.5">
                          <span className="font-semibold">{pyqInsight.topic}</span>
                          {' '}asked in {pyqInsight.years} - avg {pyqInsight.avgMarks} marks
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ChaptersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FDFAF6] dark:bg-navy-900">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-saffron-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[#4A4A6A] dark:text-gray-300 text-sm">Loading chapters...</p>
        </div>
      </div>
    }>
      <ChaptersContent />
    </Suspense>
  );
}

