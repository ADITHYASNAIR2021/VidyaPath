import { NextResponse } from 'next/server';
import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { getDeveloperAuditFeed } from '@/lib/platform-rbac-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await getDeveloperSessionFromRequestCookies())) return unauthorizedJson('Developer session required.');
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit'));
  const events = await getDeveloperAuditFeed(Number.isFinite(limit) ? limit : undefined);
  return NextResponse.json({ events });
}
