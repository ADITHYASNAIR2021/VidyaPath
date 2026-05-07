import { redirect } from 'next/navigation';

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export default async function TeacherLoginRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  const resolvedSearchParams = (await searchParams) ?? {};
  for (const [key, raw] of Object.entries(resolvedSearchParams)) {
    const value = firstParam(raw).trim();
    if (value) params.set(key, value);
  }
  if (!params.get('next')) params.set('next', '/teacher');
  params.set('portal', 'teacher');
  redirect(`/login?${params.toString()}`);
}
