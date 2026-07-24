'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

type RecoveryState = 'checking' | 'ready' | 'invalid' | 'saving' | 'complete';

function validatePassword(password: string): string | null {
  if (password.length < 6 || password.length > 18) {
    return 'Password must be 6-18 characters long.';
  }
  if (!/[A-Z]/.test(password)) return 'Add at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Add at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Add at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Add at least one special symbol.';
  return null;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, setState] = useState<RecoveryState>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
      '';
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function establishRecoverySession() {
      if (!supabase) {
        setMessage('Password recovery is not configured for this deployment.');
        setState('invalid');
        return;
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const query = new URLSearchParams(window.location.search);
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      const code = query.get('code');
      const errorDescription =
        hash.get('error_description') || query.get('error_description');

      if (errorDescription) {
        setMessage(errorDescription.replace(/\+/g, ' '));
        setState('invalid');
        return;
      }

      let error: Error | null = null;
      if (accessToken && refreshToken) {
        const result = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        error = result.error;
      } else if (code) {
        const result = await supabase.auth.exchangeCodeForSession(code);
        error = result.error;
      } else {
        const result = await supabase.auth.getSession();
        error = result.error;
        if (!result.data.session) {
          error = new Error('This recovery link is missing or has expired.');
        }
      }

      if (cancelled) return;
      if (error) {
        setMessage(error.message || 'This recovery link is invalid or has expired.');
        setState('invalid');
        return;
      }

      // Remove credentials from the address bar after the session is established.
      window.history.replaceState({}, document.title, '/reset-password');
      setState('ready');
    }

    void establishRecoverySession();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || state !== 'ready') return;

    const policyMessage = validatePassword(password);
    if (policyMessage) {
      setMessage(policyMessage);
      return;
    }
    if (password !== confirmPassword) {
      setMessage('The passwords do not match.');
      return;
    }

    setState('saving');
    setMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message || 'Could not update your password.');
      setState('ready');
      return;
    }

    await supabase.auth.signOut().catch(() => undefined);
    setState('complete');
    setMessage('Password updated. You can now sign in with your new password.');
    window.setTimeout(() => {
      router.replace('/login?reason=password-updated');
    }, 1_200);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FDFAF6] px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-[#E8E4DC] bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
          Account recovery
        </p>
        <h1 className="mt-2 font-fraunces text-2xl font-bold text-navy-700">
          Choose a new password
        </h1>

        {state === 'checking' && (
          <p className="mt-5 text-sm text-gray-600">Verifying your recovery link…</p>
        )}

        {state === 'invalid' && (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p>{message}</p>
            <Link href="/forgot-password" className="mt-3 inline-block font-semibold underline">
              Request a new recovery link
            </Link>
          </div>
        )}

        {(state === 'ready' || state === 'saving') && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {message && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {message}
              </p>
            )}
            <div>
              <label htmlFor="new-password" className="text-sm font-medium text-gray-700">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                maxLength={18}
                required
                className="mt-1 w-full rounded-xl border border-[#E8E4DC] px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              />
              <p className="mt-1 text-xs text-gray-500">
                6-18 characters with uppercase, lowercase, number, and symbol.
              </p>
            </div>
            <div>
              <label htmlFor="confirm-password" className="text-sm font-medium text-gray-700">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={6}
                maxLength={18}
                required
                className="mt-1 w-full rounded-xl border border-[#E8E4DC] px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <button
              type="submit"
              disabled={state === 'saving'}
              className="w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
            >
              {state === 'saving' ? 'Updating password…' : 'Update password'}
            </button>
          </form>
        )}

        {state === 'complete' && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {message}
          </div>
        )}

        <Link href="/login" className="mt-6 inline-block text-sm text-gray-600 underline">
          Back to login
        </Link>
      </section>
    </main>
  );
}
