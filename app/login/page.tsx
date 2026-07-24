'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn, GraduationCap, School, ChevronDown } from 'lucide-react';

function useClientSearchParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

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
  if (/^\/(login|student\/login|teacher\/login|admin\/login|developer\/login|parent\/login)(\/|$)/.test(next)) {
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
  if (nextPath.startsWith('/student') || nextPath.startsWith('/dashboard') || nextPath.startsWith('/bookmarks') ||
      nextPath.startsWith('/mock-exam') || nextPath.startsWith('/exam/assignment/')) {
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
  const searchParams = useClientSearchParams();
  const portal = searchParams.get('portal');
  const nextPath = normalizeNextPath(searchParams.get('next'), portal);
  const reason = searchParams.get('reason')?.trim() || '';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Student-specific fields
  const [classLevel, setClassLevel] = useState<'10' | '12' | ''>('');
  const [schoolCode, setSchoolCode] = useState('');

  function navigateAfterLogin(path: string) {
    if (typeof window !== 'undefined') {
      window.location.assign(path);
      return;
    }
    router.replace(path);
  }

  useEffect(() => {
    if (reason === 'auth-required') return;
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
    return () => { active = false; };
  }, [nextPath, router, reason]);

  async function login() {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const body: Record<string, unknown> = {
        identifier: identifier.trim(),
        password: password.trim(),
        portal: portal || undefined,
      };

      // Attach class level + school code for student-oriented logins
      if (classLevel) body.classLevel = Number(classLevel);
      if (schoolCode.trim()) body.schoolCode = schoolCode.trim().toUpperCase();

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) {
        setError(result?.message || result?.error || 'Login failed.');
        return;
      }

      // Show success briefly before redirecting
      setSuccessMsg('Login successful! Redirecting...');

      const payload = result?.data && typeof result.data === 'object'
        ? result.data as Record<string, unknown>
        : result as Record<string, unknown>;
      const role = extractRole(payload);
      if (!role) {
        setError('Unable to resolve account role from login response.');
        setSuccessMsg('');
        return;
      }
      navigateAfterLogin(resolvePostLoginDestination(role, payload, nextPath));
    } catch {
      setError('Failed to login. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FDFAF6] via-[#F0EDF8] to-[#E8F0FE] px-4 py-10">
      <div className="max-w-md mx-auto">
        {/* Logo / Brand */}
        <div className="text-center mb-6">
          <h1 className="font-fraunces text-3xl font-bold bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-600 bg-clip-text text-transparent">
            VidyaPath
          </h1>
          <p className="text-sm text-[#6A6580] mt-1">CBSE Board Prep Toolkit</p>
        </div>

        {/* Card */}
        <div className="bg-white/80 backdrop-blur-sm border border-[#E8E4DC] rounded-2xl shadow-lg shadow-indigo-100/50 p-6">
          <h2 className="font-fraunces text-xl font-bold text-navy-700 flex items-center gap-2">
            <LogIn className="w-5 h-5 text-indigo-600" />
            Login
          </h2>
          <p className="text-sm text-[#5F5A73] mt-1.5">
            Sign in with your ID and password. Works for all account types.
          </p>

          {/* Status banners */}
          {reason === 'auth-required' && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Login required to access that page.
            </p>
          )}
          {reason === 'password-updated' && (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Password updated! Please login with your new password.
            </p>
          )}

          <form className="space-y-3 mt-4" onSubmit={(e) => { e.preventDefault(); login(); }}>
            {/* Identifier */}
            <div>
              <label className="block text-xs font-medium text-[#5F5A73] mb-1">
                Student ID / Email / Username
              </label>
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="e.g. C10-ABC-001 or teacher@school.edu"
                className="w-full text-sm border border-[#E0DCD4] rounded-xl px-3 py-2.5 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none transition-colors"
                autoComplete="username"
              />
            </div>

            {/* Student extra fields — collapsible */}
            <details className="group">
              <summary className="flex items-center gap-1 text-xs text-[#6A6580] cursor-pointer hover:text-indigo-600 transition-colors select-none">
                <GraduationCap className="w-3.5 h-3.5" />
                Student? Add class & school
                <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="mt-2 space-y-2 pl-1">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-[#5F5A73] mb-1">Class</label>
                    <select
                      value={classLevel}
                      onChange={(e) => setClassLevel(e.target.value as '10' | '12' | '')}
                      className="w-full text-sm border border-[#E0DCD4] rounded-xl px-3 py-2.5 bg-white focus:border-indigo-400 outline-none"
                    >
                      <option value="">Any</option>
                      <option value="10">Class 10</option>
                      <option value="12">Class 12</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-[#5F5A73] mb-1">
                      <School className="w-3 h-3 inline mr-1" />
                      School Code
                    </label>
                    <input
                      value={schoolCode}
                      onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                      placeholder="e.g. VID"
                      maxLength={6}
                      className="w-full text-sm border border-[#E0DCD4] rounded-xl px-3 py-2.5 focus:border-indigo-400 outline-none uppercase"
                    />
                  </div>
                </div>
              </div>
            </details>

            {/* Password */}
            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label className="block text-xs font-medium text-[#5F5A73]">Password</label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  type={showPassword ? 'text' : 'password'}
                  className="w-full text-sm border border-[#E0DCD4] rounded-xl px-3 py-2.5 pr-11 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none transition-colors"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 px-3 text-[#6A6580] hover:text-[#373347]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-md shadow-indigo-200/50"
            >
              {loading ? 'Signing in...' : 'Login'}
            </button>
          </form>

          {/* Messages */}
          {error && (
            <p className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {successMsg && (
            <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 animate-pulse">
              {successMsg}
            </p>
          )}

          {/* Footer links */}
          <div className="mt-4 pt-3 border-t border-[#F0EDF4] flex justify-between text-xs text-[#7A7490]">
            <Link href="/" className="font-medium text-indigo-700 hover:text-indigo-800 transition-colors">
              ← Back to home
            </Link>
            <div className="flex gap-3">
              <Link href="/student/login" className="hover:text-indigo-600 transition-colors">Student</Link>
              <Link href="/teacher/login" className="hover:text-indigo-600 transition-colors">Teacher</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
