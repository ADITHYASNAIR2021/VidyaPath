'use client';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Search, Atom, FlaskConical, Leaf, Calculator, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { ALL_CHAPTERS } from '@/lib/data';
import type { Subject, ClassLevel } from '@/lib/data';
import ChapterCard from '@/components/ChapterCard';
import { useProgressStore } from '@/lib/store';

const SUBJECTS: { label: string; value: Subject | 'All'; icon: React.ElementType }[] = [
  { label: 'All', value: 'All', icon: SlidersHorizontal },
  { label: 'Physics', value: 'Physics', icon: Atom },
  { label: 'Chemistry', value: 'Chemistry', icon: FlaskConical },
  { label: 'Biology', value: 'Biology', icon: Leaf },
  { label: 'Math', value: 'Math', icon: Calculator },
];

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
};

const SUBJECT_PILL_INACTIVE: Record<string, string> = {
  All: 'bg-white text-[#4A4A6A] border-gray-200 hover:border-navy-300',
  Physics: 'bg-white text-sky-700 border-sky-200 hover:border-sky-400',
  Chemistry: 'bg-white text-emerald-700 border-emerald-200 hover:border-emerald-400',
  Biology: 'bg-white text-green-700 border-green-200 hover:border-green-400',
  Math: 'bg-white text-purple-700 border-purple-200 hover:border-purple-400',
};

function ChaptersContent() {
  const searchParams = useSearchParams();
  const initialSubject = (searchParams.get('subject') as Subject) || 'All';
  const initialClass = Number(searchParams.get('class') || 0) as ClassLevel | 0;

  const [selectedClass, setSelectedClass] = useState<ClassLevel | 0>(initialClass);
  const [selectedSubject, setSelectedSubject] = useState<Subject | 'All'>(
    SUBJECTS.find((s) => s.value === initialSubject) ? initialSubject : 'All'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const { studiedChapterIds } = useProgressStore();

  const filtered = useMemo(() => {
    return ALL_CHAPTERS.filter((ch) => {
      if (selectedClass !== 0 && ch.classLevel !== selectedClass) return false;
      if (selectedSubject !== 'All' && ch.subject !== selectedSubject) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          ch.title.toLowerCase().includes(q) ||
          ch.subject.toLowerCase().includes(q) ||
          ch.topics.some((t) => t.toLowerCase().includes(q)) ||
          ch.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [selectedClass, selectedSubject, searchQuery]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-br from-navy-700 to-navy-800 text-white px-4 py-12">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-fraunces text-3xl sm:text-4xl font-bold mb-2">Chapter Library</h1>
          <p className="text-navy-200 text-base">
            All Class 10 &amp; 12 Science and Math chapters. NCERT PDFs + YouTube links included.
          </p>
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <div className="text-sm text-navy-300">
              <span className="font-semibold text-white">{ALL_CHAPTERS.length}</span> chapters total
            </div>
            {studiedChapterIds.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {studiedChapterIds.length} / {ALL_CHAPTERS.length} studied
                </div>
                <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((studiedChapterIds.length / ALL_CHAPTERS.length) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-16 z-30 bg-[#FDFAF6]/95 backdrop-blur border-b border-[#E8E4DC] px-4 py-3">
        <div className="max-w-5xl mx-auto space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8AAA]" />
            <input
              type="text"
              placeholder="Search chapters, topics, or subjects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-[#E8E4DC] rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron-400 focus:border-transparent placeholder:text-[#8A8AAA]"
            />
          </div>

          {/* Class Tabs */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            {CLASSES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setSelectedClass(value)}
                className={clsx(
                  'flex-shrink-0 text-sm font-medium px-4 py-1.5 rounded-xl border transition-all duration-150',
                  selectedClass === value
                    ? 'bg-navy-700 text-white border-navy-700 shadow-sm'
                    : 'bg-white text-[#4A4A6A] border-gray-200 hover:border-navy-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Subject Pills */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            {SUBJECTS.map(({ label, value, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setSelectedSubject(value)}
                className={clsx(
                  'flex-shrink-0 flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-xl border transition-all duration-150',
                  selectedSubject === value
                    ? SUBJECT_PILL_STYLES[value]
                    : SUBJECT_PILL_INACTIVE[value]
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="font-fraunces text-xl font-bold text-navy-700 mb-2">No chapters found</h3>
            <p className="text-[#4A4A6A]">Try changing your filters or search query.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-[#8A8AAA] mb-5">
              Showing <span className="font-semibold text-navy-700">{filtered.length}</span> chapter
              {filtered.length !== 1 ? 's' : ''}
              {selectedClass !== 0 ? ` · Class ${selectedClass}` : ''}
              {selectedSubject !== 'All' ? ` · ${selectedSubject}` : ''}
              {searchQuery ? ` for "${searchQuery}"` : ''}
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((chapter, i) => (
                <div
                  key={chapter.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(i * 0.04, 0.4)}s` }}
                >
                  <ChapterCard chapter={chapter} />
                </div>
              ))}
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-saffron-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[#4A4A6A] text-sm">Loading chapters...</p>
        </div>
      </div>
    }>
      <ChaptersContent />
    </Suspense>
  );
}
