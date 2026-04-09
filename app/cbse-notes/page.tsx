import Link from 'next/link';
import { ALL_CHAPTERS } from '@/lib/data';
import { chapterNotesSlug, slugify } from '@/lib/seo-notes';

const chapters = ALL_CHAPTERS
  .filter((chapter) => chapter.classLevel !== 11)
  .sort((a, b) => {
    if (a.classLevel !== b.classLevel) return a.classLevel - b.classLevel;
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    return a.chapterNumber - b.chapterNumber;
  });

export const metadata = {
  title: 'CBSE Notes by Chapter | VidyaPath',
  description:
    'Class 10 and Class 12 CBSE chapter-wise notes, high-yield topics, PYQ trends, formula focus, and revision strategy.',
};

export default function CbseNotesIndexPage() {
  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      <div className="bg-gradient-to-br from-sky-700 to-indigo-700 text-white px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-fraunces text-3xl sm:text-4xl font-bold">CBSE Notes Library</h1>
          <p className="text-sky-100 mt-2 max-w-2xl">
            SEO-ready chapter notes for Class 10 and 12 with board-focused revision guidance.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-4">
          {chapters.map((chapter) => {
            const subjectSlug = slugify(chapter.subject);
            const notesSlug = chapterNotesSlug(chapter);
            const href = `/cbse-notes/${chapter.classLevel}/${subjectSlug}/${notesSlug}`;
            return (
              <Link
                key={chapter.id}
                href={href}
                className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4 hover:shadow-md transition-shadow"
              >
                <p className="text-xs font-semibold text-saffron-600">
                  Class {chapter.classLevel} - {chapter.subject} - Chapter {chapter.chapterNumber}
                </p>
                <h2 className="font-fraunces text-lg font-bold text-navy-700 mt-1">{chapter.title}</h2>
                <p className="text-sm text-[#5C5870] mt-1 line-clamp-2">{chapter.description}</p>
              <p className="text-xs text-indigo-700 font-semibold mt-3">Open notes</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}


