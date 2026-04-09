import Link from 'next/link';
import { ALL_CHAPTERS } from '@/lib/data';
import { Atom, BookOpen, Briefcase, Calculator, FlaskConical, Leaf, LineChart } from 'lucide-react';

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

const SUBJECT_META: Record<string, { title: string; description: string }> = {
  Physics: {
    title: 'Physics Helper',
    description: 'Numerical-heavy prep with formulas, derivations, and board-style application drills.',
  },
  Chemistry: {
    title: 'Chemistry Helper',
    description: 'Reaction flow, concept linking, and chapter-targeted PYQ + AI revision support.',
  },
  Biology: {
    title: 'Biology Helper',
    description: 'Fast recall tools, NCERT-first framing, and high-frequency board question focus.',
  },
  Math: {
    title: 'Math Helper',
    description: 'Stepwise practice, formula use-cases, and speed-accuracy training by chapter.',
  },
  Accountancy: {
    title: 'Accountancy Helper',
    description: 'Partnership, ratios, cash flow, and adjustment-focused board practice support.',
  },
  'Business Studies': {
    title: 'Business Studies Helper',
    description: 'Case-style answer framing, chapter logic maps, and board marking-pattern practice.',
  },
  Economics: {
    title: 'Economics Helper',
    description: 'Macro + IED concept clarity with formula-backed numericals and PYQ trend focus.',
  },
  'English Core': {
    title: 'English Core Helper',
    description: 'Chapter comprehension, writing strategy, and paper-pattern aligned preparation.',
  },
};

const SUBJECT_ORDER = [
  'Physics',
  'Chemistry',
  'Biology',
  'Math',
  'English Core',
  'Accountancy',
  'Business Studies',
  'Economics',
] as const;

export default function HelperPage() {
  const chapters = ALL_CHAPTERS.filter((chapter) => chapter.classLevel !== 11);

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="rounded-3xl border border-[#E8E4DC] bg-white px-6 py-7 shadow-sm">
          <h1 className="font-fraunces text-3xl font-bold text-navy-700">Subject Helper</h1>
          <p className="text-[#5F5A73] mt-2 text-sm max-w-3xl">
            One unified helper. Pick your subject, then jump into chapter intelligence, PYQ trends, formulas,
            AI mentor, and exam-mode practice.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {SUBJECT_ORDER.map((subject) => {
            const Icon = SUBJECT_ICON[subject] ?? BookOpen;
            const byClass = [10, 12]
              .map((classLevel) => ({
                classLevel,
                count: chapters.filter(
                  (chapter) => chapter.classLevel === classLevel && chapter.subject === subject
                ).length,
              }))
              .filter((entry) => entry.count > 0);

            if (byClass.length === 0) return null;
            const meta = SUBJECT_META[subject];

            return (
              <article key={subject} className="rounded-2xl border border-[#E8E4DC] bg-white px-5 py-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-[#F4F1EA] border border-[#E8E4DC] flex items-center justify-center">
                      <Icon className="w-5 h-5 text-navy-700" />
                    </div>
                    <div>
                      <h2 className="font-fraunces text-xl font-bold text-navy-700">{meta.title}</h2>
                      <p className="text-xs text-[#7A748F]">{subject}</p>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-[#4F4A66] mt-3">{meta.description}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {byClass.map((entry) => (
                    <Link
                      key={`${subject}-${entry.classLevel}`}
                      href={`/chapters?class=${entry.classLevel}&subject=${encodeURIComponent(subject)}`}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      Class {entry.classLevel} - {entry.count} chapters
                    </Link>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
