import { MetadataRoute } from 'next';
import { ALL_CHAPTERS } from '@/lib/data';
import { chapterNotesSlug, slugify } from '@/lib/seo-notes';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://vidyapath.vercel.app';

  const chapterUrls = ALL_CHAPTERS.map((chapter) => ({
    url: `${baseUrl}/chapters/${chapter.id}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const notesUrls = ALL_CHAPTERS
    .filter((chapter) => chapter.classLevel !== 11)
    .map((chapter) => ({
      url: `${baseUrl}/cbse-notes/${chapter.classLevel}/${slugify(chapter.subject)}/${chapterNotesSlug(chapter)}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.78,
    }));

  const routes = ['', '/chapters', '/papers', '/career', '/bookmarks', '/dashboard', '/formulas', '/concept-web', '/cbse-notes'].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1 : 0.9,
  }));

  return [...routes, ...chapterUrls, ...notesUrls];
}
