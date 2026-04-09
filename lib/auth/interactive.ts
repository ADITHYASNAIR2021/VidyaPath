import { NextResponse } from 'next/server';
import { getRequestAuthContext } from '@/lib/auth/guards';

export async function requireInteractiveAuth() {
  const context = await getRequestAuthContext();
  if (!context) {
    return {
      context: null,
      response: NextResponse.json(
        {
          error: 'Authentication required. Login as student, teacher, admin, or developer to use interactive AI features.',
        },
        { status: 401 }
      ),
    };
  }
  return { context, response: null };
}
