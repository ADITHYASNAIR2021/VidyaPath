import { NextResponse } from 'next/server';
import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { createSchool, getDeveloperOverview, listSchools } from '@/lib/platform-rbac-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await getDeveloperSessionFromRequestCookies())) return unauthorizedJson('Developer session required.');
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const schools = await listSchools(
    status === 'active' || status === 'inactive' || status === 'archived' ? status : undefined
  );
  const overview = await getDeveloperOverview();
  const allowedSchoolIds = new Set(schools.map((school) => school.id));
  return NextResponse.json({
    schools,
    schoolDirectory: overview.schoolDirectory.filter((item) => allowedSchoolIds.has(item.schoolId)),
    counts: overview.counts,
  });
}

export async function POST(req: Request) {
  if (!(await getDeveloperSessionFromRequestCookies())) return unauthorizedJson('Developer session required.');
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  try {
    const school = await createSchool({
      schoolName: typeof body.schoolName === 'string' ? body.schoolName : '',
      schoolCode: typeof body.schoolCode === 'string' ? body.schoolCode : '',
      board: typeof body.board === 'string' ? body.board : 'CBSE',
      city: typeof body.city === 'string' ? body.city : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
      contactPhone: typeof body.contactPhone === 'string' ? body.contactPhone : undefined,
      contactEmail: typeof body.contactEmail === 'string' ? body.contactEmail : undefined,
    });
    return NextResponse.json({ school });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create school.';
    const status = /required|valid/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
