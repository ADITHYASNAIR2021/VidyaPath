import { NextResponse } from 'next/server';
import { getDeveloperKeyStatus, hasDeveloperSession } from '@/lib/developer/auth';

/** Returns an error response when the caller is not an authenticated developer, otherwise null. */
export async function requireDeveloper(): Promise<NextResponse | null> {
  const status = getDeveloperKeyStatus();
  if (status !== 'ok') {
    return NextResponse.json(
      {
        ok: false,
        errorCode: 'developer-console-disabled',
        message:
          status === 'missing'
            ? 'Developer console is disabled. Set DEVELOPER_DASHBOARD_KEY (24+ characters) to enable it.'
            : 'DEVELOPER_DASHBOARD_KEY must be at least 24 characters.',
      },
      { status: 503 }
    );
  }
  if (!(await hasDeveloperSession())) {
    return NextResponse.json(
      { ok: false, errorCode: 'developer-auth-required', message: 'Developer key required.' },
      { status: 401 }
    );
  }
  return null;
}
