import { NextResponse } from 'next/server';
import { getRequestAuthContext } from '@/lib/auth/guards';

export async function requireInteractiveAuth() {
  const context = await getRequestAuthContext();
  if (!context) {
    return {
      context: null,
      response: NextResponse.json(
        {
          error: 'Login required to use AI features.',
          errorCode: 'auth-required',
          message: 'Please login to use VidyaAI features.',
        },
        { status: 401 }
      ),
    };
  }
  return { context, response: null };
}
