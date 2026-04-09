import { NextResponse } from 'next/server';
import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { getDeveloperSchoolOverview } from '@/lib/platform-rbac-db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getDeveloperSessionFromRequestCookies())) return unauthorizedJson('Developer session required.');
  const schoolId = params.id?.trim();
  if (!schoolId) {
    return NextResponse.json({ error: 'School id is required.' }, { status: 400 });
  }
  const overview = await getDeveloperSchoolOverview(schoolId);
  if (!overview) {
    return NextResponse.json({ error: 'School not found.' }, { status: 404 });
  }
  return NextResponse.json(overview);
}
