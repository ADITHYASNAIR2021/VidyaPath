import { ALL_CHAPTERS, type Chapter } from '@/lib/data';

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function chapterNotesSlug(chapter: Chapter): string {
  return `${chapter.id}-${slugify(chapter.title)}`;
}

export function parseChapterFromNotesSlug(
  classLevel: string,
  subject: string,
  chapterSlug: string
): Chapter | undefined {
  const parsedClassLevel = Number(classLevel);
  const normalizedSubject = subject.toLowerCase();
  const chapter = ALL_CHAPTERS.find((item) => chapterSlug.startsWith(`${item.id}-`));
  if (!chapter) return undefined;
  if (chapter.classLevel !== parsedClassLevel) return undefined;
  if (chapter.subject.toLowerCase() !== normalizedSubject) return undefined;
  return chapter;
}
