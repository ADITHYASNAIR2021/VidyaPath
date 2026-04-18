import { redirect } from 'next/navigation';

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export default function DeveloperLoginRedirectPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, raw] of Object.entries(searchParams)) {
      const value = firstParam(raw).trim();
      if (value) params.set(key, value);
    }
  }
  if (!params.get('next')) params.set('next', '/developer');
  params.set('portal', 'developer');
  redirect(`/login?${params.toString()}`);
}
