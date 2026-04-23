'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';

type LoginRole = 'student' | 'teacher' | 'admin' | 'developer';

function resolvePortalDefaultNext(portal: string | null): string {
  if (portal === 'teacher') return '/teacher';
  if (portal === 'admin') return '/admin';
  if (portal === 'developer') return '/developer';
  return '/chapters';
}

function normalizeNextPath(rawNext: string | null, portal: string | null): string {
  const fallback = resolvePortalDefaultNext(portal);
  const next = (rawNext || '').trim();
  if (!next) return fallback;
  if (!/^\/(?!\/)/.test(next)) return fallback;
  if (
    /^\/(login|student\/login|teacher\/login|admin\/login|developer\/login|parent\/login)(\/|$)/.test(next)
  ) {
    return fallback;
  }
  return next;
}

function extractRole(payload: unknown): LoginRole | null {
  if (!payload || typeof payload !== 'object') return null;
  const role = (payload as Record<string, unknown>).role;
  if (role === 'student' || role === 'teacher' || role === 'admin' || role === 'developer') return role;
  return null;
}

function resolveRoleDefaultPath(role: LoginRole): string {
  if (role === 'student') return '/chapters';
  if (role === 'teacher') return '/teacher';
  if (role === 'admin') return '/admin';
  return '/developer';
}

function isNextPathAllowedForRole(nextPath: string, role: LoginRole): boolean {
  if (nextPath.startsWith('/admin')) return role === 'admin';
  if (nextPath.startsWith('/teacher')) return role === 'teacher';
  if (nextPath.startsWith('/developer')) return role === 'developer';
  if (nextPath.startsWith('/api-lab')) return role === 'admin' || role === 'developer';
  if (
    nextPath.startsWith('/student') ||
    nextPath.startsWith('/dashboard') ||
    nextPath.startsWith('/bookmarks') ||
    nextPath.startsWith('/mock-exam') ||
    nextPath.startsWith('/exam/assignment/')
  ) {
    return role === 'student';
  }
  return true;
}

function resolvePostLoginDestination(role: LoginRole, payload: Record<string, unknown>, nextPath: string): string {
  if (role === 'student' && payload.mustChangePassword === true) return '/student/first-login';
  if (role === 'teacher' && payload.mustChangePassword === true) return '/teacher/first-login';
  if (!isNextPathAllowedForRole(nextPath, role)) return resolveRoleDefaultPath(role);
  return nextPath || resolveRoleDefaultPath(role);
}

export default function UnifiedLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portal = searchParams.get('portal');
  const nextPath = normalizeNextPath(searchParams.get('next'), portal);
  const reason = searchParams.get('reason')?.trim() || '';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function navigateAfterLogin(path: string) {
    if (typeof window !== 'undefined') {
      window.location.assign(path);
      return;
    }
    router.replace(path);
  }

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store', credentials: 'include' })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!active || !response.ok || !result) return;
        const payload = result?.data && typeof result.data === 'object'
          ? result.data as Record<string, unknown>
          : result as Record<string, unknown>;
        const role = extractRole(payload);
        if (!role) return;
        navigateAfterLogin(resolvePostLoginDestination(role, payload, nextPath));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [nextPath, router]);

  async function login() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          identifier: identifier.trim(),
          password: password.trim(),
          portal: portal || undefined,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) {
        setError(result?.message || result?.error || result?.hint || 'Login failed.');
        return;
      }

      const payload = result?.data && typeof result.data === 'object'
        ? result.data as Record<string, unknown>
        : result as Record<string, unknown>;
      const role = extractRole(payload);
      if (!role) {
        setError('Unable to resolve account role from login response.');
        return;
      }
      navigateAfterLogin(resolvePostLoginDestination(role, payload, nextPath));
    } catch {
      setError('Failed to login.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-14">
      <div className="max-w-md mx-auto bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-6">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <LogIn className="w-5 h-5 text-indigo-600" />
          Login
        </h1>
        <p className="text-sm text-[#5F5A73] mt-2">
          Use your ID and password. Works for Student, Teacher, Admin, and Developer accounts.
        </p>
        {reason === 'auth-required' && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            Login is required to access that page.
          </p>
        )}
        {reason === 'password-updated' && (
          <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
            Password updated successfully. Please login with your new password.
          </p>
        )}

        <div className="space-y-3 mt-5">
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="ID (student ID / email / username)"
            className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
          />
          <div className="relative">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type={showPassword ? 'text' : 'password'}
              className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 px-3 text-[#6A6580] hover:text-[#373347]"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={login}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        <p className="mt-4 text-xs text-[#7A7490]">
          Home: <Link href="/" className="font-semibold text-indigo-700 hover:text-indigo-800">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
