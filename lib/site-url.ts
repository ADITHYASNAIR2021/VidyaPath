const DEFAULT_SITE_URL = 'https://sreyas-vidyapath.vercel.app';

/** Canonical public URL (no trailing slash). Configure with NEXT_PUBLIC_APP_URL. */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (configured || DEFAULT_SITE_URL).replace(/\/+$/, '');
}
