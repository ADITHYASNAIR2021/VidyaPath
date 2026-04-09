import { NextResponse } from 'next/server';
import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { getTokenUsageRollup } from '@/lib/platform-rbac-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await getDeveloperSessionFromRequestCookies())) return unauthorizedJson('Developer session required.');
  const url = new URL(req.url);
  const schoolId = url.searchParams.get('schoolId')?.trim() || undefined;
  const endpoint = url.searchParams.get('endpoint')?.trim() || undefined;
  const limit = Number(url.searchParams.get('limit'));
  const payload = await getTokenUsageRollup({
    schoolId,
    endpoint,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  return NextResponse.json(payload);
}
