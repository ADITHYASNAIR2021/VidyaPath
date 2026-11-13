import { NextResponse } from 'next/server';
import { requireDeveloper } from '@/lib/developer/guard';
import { getDeveloperOverview } from '@/lib/developer/overview';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireDeveloper();
  if (denied) return denied;
  return NextResponse.json({ ok: true, data: await getDeveloperOverview() });
}
