import { MetadataRoute } from 'next';
import { ALL_CHAPTERS } from '@/lib/data';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://vidyapath.vercel.app';

  const chapterUrls = ALL_CHAPTERS.map((chapter) => ({
    url: `${baseUrl}/chapters/${chapter.id}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const routes = ['', '/chapters', '/papers', '/career', '/bookmarks'].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1 : 0.9,
  }));

  return [...routes, ...chapterUrls];
}
