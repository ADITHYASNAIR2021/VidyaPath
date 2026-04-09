import { NextResponse } from 'next/server';
import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { updateSchool } from '@/lib/platform-rbac-db';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await getDeveloperSessionFromRequestCookies())) return unauthorizedJson('Developer session required.');
  const schoolId = params.id?.trim();
  if (!schoolId) {
    return NextResponse.json({ error: 'School id is required.' }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  try {
    const school = await updateSchool(schoolId, {
      schoolName: typeof body.schoolName === 'string' ? body.schoolName : undefined,
      schoolCode: typeof body.schoolCode === 'string' ? body.schoolCode : undefined,
      board: typeof body.board === 'string' ? body.board : undefined,
      city: typeof body.city === 'string' ? body.city : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
      contactPhone: typeof body.contactPhone === 'string' ? body.contactPhone : undefined,
      contactEmail: typeof body.contactEmail === 'string' ? body.contactEmail : undefined,
      status: body.status === 'active' || body.status === 'inactive' || body.status === 'archived'
        ? body.status
        : undefined,
    });
    if (!school) return NextResponse.json({ error: 'School not found.' }, { status: 404 });
    return NextResponse.json({ school });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update school.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
