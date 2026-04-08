import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ALL_CHAPTERS } from '@/lib/data';
import { getPYQData } from '@/lib/pyq';
import { chapterNotesSlug, parseChapterFromNotesSlug, slugify } from '@/lib/seo-notes';

interface NotesParams {
  classLevel: string;
  subject: string;
  chapterSlug: string;
}

export function generateStaticParams(): NotesParams[] {
  return ALL_CHAPTERS
    .filter((chapter) => chapter.classLevel !== 11)
    .map((chapter) => ({
      classLevel: String(chapter.classLevel),
      subject: slugify(chapter.subject),
      chapterSlug: chapterNotesSlug(chapter),
    }));
}

export function generateMetadata({ params }: { params: NotesParams }): Metadata {
  const chapter = parseChapterFromNotesSlug(params.classLevel, params.subject, params.chapterSlug);
  if (!chapter) return { title: 'CBSE Notes | VidyaPath' };
  const pyq = getPYQData(chapter.id);
  const baseTitle = `CBSE Class ${chapter.classLevel} ${chapter.subject} ${chapter.title} Notes`;
  return {
    title: `${baseTitle} | VidyaPath`,
    description: `${chapter.title} notes with high-yield topics, PYQ trend${
      pyq ? ` (${pyq.yearsAsked.length} years asked, avg ${pyq.avgMarks} marks)` : ''
    }, formulas, and exam strategy.`,
    keywords: [
      `CBSE Class ${chapter.classLevel} ${chapter.subject} ${chapter.title} Notes`,
      `${chapter.title} important questions`,
      `Class ${chapter.classLevel} ${chapter.subject} chapter ${chapter.chapterNumber}`,
      'board exam revision notes',
    ],
  };
}

export default function CbseNotesChapterPage({ params }: { params: NotesParams }) {
  const chapter = parseChapterFromNotesSlug(params.classLevel, params.subject, params.chapterSlug);
  if (!chapter) notFound();
  const pyq = getPYQData(chapter.id);
  const formulaNames = (chapter.formulas ?? []).map((formula) => formula.name).slice(0, 6);
  const highYieldTopics = pyq?.importantTopics?.slice(0, 8) ?? chapter.topics.slice(0, 8);
  const yearsAsked = pyq?.yearsAsked ? [...pyq.yearsAsked].sort((a, b) => b - a) : [];
  const subjectSlug = slugify(chapter.subject);

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      <article className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-xs font-semibold text-saffron-600">
          Class {chapter.classLevel} - {chapter.subject} - Chapter {chapter.chapterNumber}
        </p>
        <h1 className="font-fraunces text-3xl font-bold text-navy-700 mt-2">
          {chapter.title} - CBSE Notes
        </h1>
        <p className="text-[#4F4A64] mt-3">{chapter.description}</p>

        <section className="mt-8 bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-5">
          <h2 className="font-fraunces text-xl font-bold text-navy-700">High-Yield Topics</h2>
          <ul className="mt-3 grid sm:grid-cols-2 gap-2">
            {highYieldTopics.map((topic) => (
              <li key={topic} className="text-sm text-[#3A3652] bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                {topic}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-5">
          <h2 className="font-fraunces text-xl font-bold text-navy-700">PYQ Trend</h2>
          <p className="text-sm text-[#4F4A64] mt-2">
            {pyq
              ? `This chapter is asked repeatedly in board exams with around ${pyq.avgMarks} marks weightage.`
              : `Use chapter weightage (~${chapter.marks} marks) and NCERT coverage for revision planning.`}
          </p>
          {yearsAsked.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {yearsAsked.map((year) => (
                <span key={year} className="text-xs font-semibold bg-saffron-50 border border-saffron-200 text-saffron-700 px-2 py-1 rounded-full">
                  {year}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-5">
          <h2 className="font-fraunces text-xl font-bold text-navy-700">Formula Focus</h2>
          {formulaNames.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {formulaNames.map((name) => (
                <li key={name} className="text-sm text-[#3A3652]">
                  - {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#4F4A64] mt-2">
              Revise definitions and derivation conditions for this chapter.
            </p>
          )}
          <Link href="/formulas" className="inline-flex mt-3 text-xs font-semibold text-indigo-700 hover:text-indigo-800">
            Open full formula database ->
          </Link>
        </section>

        <section className="mt-6 bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-5">
          <h2 className="font-fraunces text-xl font-bold text-navy-700">Board Exam Strategy</h2>
          <ol className="mt-3 list-decimal pl-5 space-y-2 text-sm text-[#3A3652]">
            <li>Start with NCERT definitions and canonical examples.</li>
            <li>Practice PYQ-style mixed questions with strict time limits.</li>
            <li>Write final answers with units/sign conventions where applicable.</li>
            <li>Reattempt mistakes after 24 hours for recall reinforcement.</li>
          </ol>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/chapters/${chapter.id}`}
            className="inline-flex items-center bg-saffron-500 hover:bg-saffron-600 text-white font-semibold text-sm px-4 py-2.5 rounded-xl"
          >
            Open Interactive Chapter
          </Link>
          <Link
            href={`/cbse-notes/${chapter.classLevel}/${subjectSlug}/${chapterNotesSlug(chapter)}`}
            className="inline-flex items-center bg-white border border-[#E8E4DC] text-navy-700 font-semibold text-sm px-4 py-2.5 rounded-xl"
          >
            Share Notes URL
          </Link>
        </div>
      </article>
    </div>
  );
}


