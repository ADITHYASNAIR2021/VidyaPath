import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/teacher'],
      },
    ],
    sitemap: 'https://sreyas-vidyapath.vercel.com/sitemap.xml',
  };
}
