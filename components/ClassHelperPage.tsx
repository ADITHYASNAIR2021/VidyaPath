import Link from 'next/link';
import { ALL_CHAPTERS } from '@/lib/data';
import { CLASS_BRANCH_CONFIG, type HelperClassLevel } from '@/lib/academic-taxonomy';
import { Atom, BookOpen, Briefcase, Calculator, LineChart, FlaskConical, Leaf } from 'lucide-react';

const SUBJECT_ICON: Record<string, React.ElementType> = {
  Physics: Atom,
  Chemistry: FlaskConical,
  Biology: Leaf,
  Math: Calculator,
  Accountancy: Briefcase,
  'Business Studies': LineChart,
  Economics: LineChart,
  'English Core': BookOpen,
};

const SUBJECT_BADGE: Record<string, string> = {
  Physics: 'bg-sky-50 text-sky-700 border-sky-200',
  Chemistry: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Biology: 'bg-green-50 text-green-700 border-green-200',
  Math: 'bg-purple-50 text-purple-700 border-purple-200',
  Accountancy: 'bg-amber-50 text-amber-700 border-amber-200',
  'Business Studies': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Economics: 'bg-rose-50 text-rose-700 border-rose-200',
  'English Core': 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

export default function ClassHelperPage({ classLevel }: { classLevel: HelperClassLevel }) {
  const branch = CLASS_BRANCH_CONFIG[classLevel];
  const chapters = ALL_CHAPTERS.filter((chapter) => chapter.classLevel === classLevel);

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="rounded-3xl border border-[#E8E4DC] bg-white px-6 py-7 shadow-sm">
          <h1 className="font-fraunces text-3xl font-bold text-navy-700">{branch.title}</h1>
          <p className="text-[#5F5A73] mt-2 text-sm max-w-2xl">{branch.description}</p>
          <div className="mt-5 flex gap-2 flex-wrap">
            <Link href={`/chapters?class=${classLevel}`} className="text-sm font-semibold bg-saffron-500 hover:bg-saffron-600 text-white px-4 py-2 rounded-xl">
              Open chapter library
            </Link>
            <Link href="/dashboard" className="text-sm font-semibold border border-[#DCD7CC] bg-white hover:bg-[#F5F2EC] text-navy-700 px-4 py-2 rounded-xl">
              Go to dashboard
            </Link>
          </div>
        </div>

        <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branch.subjects.map((subject) => {
            const Icon = SUBJECT_ICON[subject] ?? BookOpen;
            const subjectChapters = chapters.filter((chapter) => chapter.subject === subject);
            const hasContent = subjectChapters.length > 0;
            return (
              <div key={subject} className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-[#F7F5F0] flex items-center justify-center">
                      <Icon className="w-4.5 h-4.5 text-[#3D3A53]" />
                    </div>
                    <h2 className="font-semibold text-navy-700">{subject}</h2>
                  </div>
                  <span className={`text-[11px] font-semibold border rounded-full px-2 py-1 ${SUBJECT_BADGE[subject] ?? 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                    {hasContent ? `${subjectChapters.length} chapters` : 'Coming soon'}
                  </span>
                </div>
                <p className="text-xs text-[#6E6984] mt-2">
                  {hasContent
                    ? `Start chapter intelligence and PYQ-driven practice for ${subject}.`
                    : `Commerce scaffold ready. Chapter content for ${subject} will plug in without UI refactor.`}
                </p>
                <div className="mt-3">
                  {hasContent ? (
                    <Link href={`/chapters?class=${classLevel}&subject=${encodeURIComponent(subject)}`} className="text-sm font-semibold text-indigo-700 hover:text-indigo-800">
                      Open {subject} helper
                    </Link>
                  ) : (
                    <span className="text-xs font-semibold text-[#8A8AAA]">Content pipeline ready</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

