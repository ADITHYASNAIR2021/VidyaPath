'use client';

import { Suspense, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  LockKeyhole,
  School,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import clsx from 'clsx';

type LoginRole = 'student' | 'teacher' | 'admin' | 'developer';

const ROLE_LOGIN_PATHS: Record<LoginRole, string> = {
  student: '/student/login',
  teacher: '/teacher/login',
  admin: '/admin/login',
  developer: '/developer/login',
};

const ROLE_OPTIONS: Array<{
  id: LoginRole;
  label: string;
  shortLabel: string;
  description: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  icon: typeof GraduationCap;
}> = [
  {
    id: 'student',
    label: 'Student workspace',
    shortLabel: 'Student',
    description: 'Study plans, practice, assignments, and progress.',
    identifierLabel: 'Parent phone or Student ID',
    identifierPlaceholder: 'e.g. 9876543210 or school ID',
    icon: GraduationCap,
  },
  {
    id: 'teacher',
    label: 'Teacher workspace',
    shortLabel: 'Teacher',
    description: 'Classes, grading, resources, and student support.',
    identifierLabel: 'Teacher ID, email, or phone',
    identifierPlaceholder: 'e.g. teacher@school.edu',
    icon: Users,
  },
  {
    id: 'admin',
    label: 'Admin workspace',
    shortLabel: 'Admin',
    description: 'People, timetables, analytics, and school settings.',
    identifierLabel: 'Principal phone, ID, or email',
    identifierPlaceholder: 'e.g. 9876543210',
    icon: ShieldCheck,
  },
  {
    id: 'developer',
    label: 'Developer workspace',
    shortLabel: 'Developer',
    description: 'Platform health, schools, usage, and diagnostics.',
    identifierLabel: 'Developer username or email',
    identifierPlaceholder: 'Enter your developer account',
    icon: Code2,
  },
];

const ROLE_HEADLINES: Record<LoginRole, { eyebrow: string; title: string; body: string }> = {
  student: {
    eyebrow: 'Your learning space',
    title: 'Pick up exactly where you left off.',
    body: 'Your chapters, revision plan, assignments, and progress are waiting in one calm workspace.',
  },
  teacher: {
    eyebrow: 'Your classroom space',
    title: 'Start the day with your class already in focus.',
    body: 'Move from attendance to teaching, grading, and support without losing the thread.',
  },
  admin: {
    eyebrow: 'Your school operations space',
    title: 'See what needs attention without the noise.',
    body: 'Manage your school with clear priorities, scoped access, and a reliable record of changes.',
  },
  developer: {
    eyebrow: 'Your platform space',
    title: 'Keep the learning platform healthy and observable.',
    body: 'Review schools, quality, usage, and system health from a restricted operations workspace.',
  },
};

function parseRole(value: string | null): LoginRole | null {
  if (value === 'student' || value === 'teacher' || value === 'admin' || value === 'developer') return value;
  return null;
}

function resolvePortalDefaultNext(portal: LoginRole | null): string {
  if (portal === 'teacher') return '/teacher';
  if (portal === 'admin') return '/admin';
  if (portal === 'developer') return '/developer';
  return '/chapters';
}

function normalizeNextPath(rawNext: string | null, portal: LoginRole | null): string {
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
  return parseRole(String((payload as Record<string, unknown>).role || ''));
}

function resolveRoleDefaultPath(role: LoginRole): string {
  return resolvePortalDefaultNext(role);
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
  if (role === 'admin' && payload.mustChangePassword === true) return '/admin/first-login';
  if (!isNextPathAllowedForRole(nextPath, role)) return resolveRoleDefaultPath(role);
  return nextPath || resolveRoleDefaultPath(role);
}

function LoginFallback() {
  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-[#f7f8fc] px-4 dark:bg-slate-950">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Preparing secure sign in…
      </div>
    </main>
  );
}

function UnifiedLoginContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const portalFromUrl = parseRole(searchParams.get('portal'));
  const pathRole = parseRole(pathname.split('/').filter(Boolean)[0] ?? null);
  const initialRole = pathRole ?? portalFromUrl;
  const reason = searchParams.get('reason')?.trim() || '';
  const [selectedRole, setSelectedRole] = useState<LoginRole>(initialRole ?? portalFromUrl ?? 'student');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [classLevel, setClassLevel] = useState<'10' | '12' | ''>('');
  const [schoolCode, setSchoolCode] = useState('');
  const identifierId = useId();
  const passwordId = useId();
  const classId = useId();
  const schoolCodeId = useId();

  const activeRole = ROLE_OPTIONS.find((role) => role.id === selectedRole) ?? ROLE_OPTIONS[0];
  const headline = ROLE_HEADLINES[selectedRole];
  const nextPath = normalizeNextPath(searchParams.get('next'), selectedRole);

  useEffect(() => {
    if (initialRole) setSelectedRole(initialRole);
  }, [initialRole, portalFromUrl]);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfterSeconds]);

  function navigateAfterLogin(path: string) {
    if (typeof window !== 'undefined') {
      window.location.assign(path);
      return;
    }
    router.replace(path);
  }

  useEffect(() => {
    if (reason === 'auth-required') return;
    const controller = new AbortController();
    fetch('/api/auth/session', {
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) return;
        const payload = result?.data && typeof result.data === 'object'
          ? result.data as Record<string, unknown>
          : result as Record<string, unknown>;
        const role = extractRole(payload);
        if (!role) return;
        navigateAfterLogin(resolvePostLoginDestination(role, payload, nextPath));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [nextPath, reason]);

  function selectRole(role: LoginRole) {
    setError('');
    setSuccessMsg('');
    setRetryAfterSeconds(0);
    setIdentifier('');
    setPassword('');
    setClassLevel('');
    setSchoolCode('');

    const nextParams = new URLSearchParams();
    if (reason) nextParams.set('reason', reason);
    const requestedNext = searchParams.get('next');
    if (requestedNext && isNextPathAllowedForRole(requestedNext, role)) {
      nextParams.set('next', requestedNext);
    }
    const query = nextParams.toString();
    router.replace(`${ROLE_LOGIN_PATHS[role]}${query ? `?${query}` : ''}`);
  }

  async function login() {
    if (loading || retryAfterSeconds > 0) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const body: Record<string, unknown> = {
        identifier: identifier.trim(),
        password: password.trim(),
        portal: selectedRole,
      };

      if (selectedRole === 'student' && classLevel) body.classLevel = Number(classLevel);
      if (selectedRole !== 'developer' && schoolCode.trim()) body.schoolCode = schoolCode.trim().toUpperCase();

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) {
        if (response.status === 429) {
          const retryHeader = Number(response.headers.get('retry-after'));
          const retryHint = Number(String(result?.hint || '').match(/(\d+)/)?.[1]);
          const retrySeconds = Math.max(1, Number.isFinite(retryHeader) ? retryHeader : Number.isFinite(retryHint) ? retryHint : 60);
          setRetryAfterSeconds(retrySeconds);
          setError(`Too many sign-in attempts. Try again in ${retrySeconds} seconds.`);
        } else {
          setError(result?.message || result?.error || 'We could not sign you in. Check your details and try again.');
        }
        return;
      }

      const payload = result?.data && typeof result.data === 'object'
        ? result.data as Record<string, unknown>
        : result as Record<string, unknown>;
      const role = extractRole(payload);
      if (!role) {
        setError('Your account was verified, but its workspace could not be resolved. Please contact your administrator.');
        return;
      }

      setSuccessMsg(`${ROLE_OPTIONS.find((item) => item.id === role)?.shortLabel ?? 'Your'} workspace is ready.`);
      navigateAfterLogin(resolvePostLoginDestination(role, payload, nextPath));
    } catch {
      setError('The connection was interrupted. Your details are safe—please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main data-auth-experience className="relative min-h-[100svh] overflow-hidden bg-[#f7f8fc] px-4 py-7 sm:px-6 sm:py-10 dark:bg-slate-950">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-indigo-200/45 blur-3xl dark:bg-indigo-900/20" />
        <div className="absolute -bottom-40 right-[-5rem] h-96 w-96 rounded-full bg-amber-100/70 blur-3xl dark:bg-amber-900/10" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-6xl items-center">
        <div className="grid w-full overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/80 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur-xl lg:grid-cols-[0.88fr_1.12fr] dark:border-white/10 dark:bg-slate-900/80">
          <section className="relative hidden overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between" aria-labelledby="login-story-title">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.42),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.18),transparent_34%)]" aria-hidden="true" />
            <div className="relative">
              <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/12">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950">
                  <GraduationCap className="h-4 w-4" aria-hidden="true" />
                </span>
                VidyaPath
              </Link>
              <p className="mt-14 text-xs font-bold uppercase tracking-[0.2em] text-indigo-200">{headline.eyebrow}</p>
              <h1 id="login-story-title" className="mt-4 max-w-md font-fraunces text-4xl font-bold leading-tight text-white">
                {headline.title}
              </h1>
              <p className="mt-4 max-w-md text-base leading-7 text-slate-300">{headline.body}</p>
            </div>

            <div className="relative space-y-3 text-sm text-slate-300">
              {[
                'One account, only the tools your role can access',
                'Secure school-scoped sessions and clear workspace switching',
                'Designed for keyboard, touch, and screen-reader use',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="p-5 sm:p-8 lg:p-10" aria-labelledby="login-form-title">
            <div className="mb-7 flex items-center justify-between gap-4 lg:hidden">
              <Link href="/" className="inline-flex items-center gap-2 font-fraunces text-xl font-bold text-slate-900 dark:text-white">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950">
                  <GraduationCap className="h-5 w-5" aria-hidden="true" />
                </span>
                VidyaPath
              </Link>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
                Secure sign in
              </span>
            </div>

            <div className="max-w-2xl">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
                  <LockKeyhole className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="login-form-title" className="font-fraunces text-2xl font-bold text-slate-950 dark:text-white">Welcome back</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Choose your workspace, then use the ID your school or platform administrator gave you.</p>
                </div>
              </div>

              {reason === 'auth-required' && (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100" role="status">
                  Please sign in to continue to that page. We’ll take you back after login.
                </p>
              )}
              {reason === 'password-updated' && (
                <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100" role="status">
                  Your password is updated. Sign in once more with the new password.
                </p>
              )}

              <form className="mt-6 space-y-5" onSubmit={(event) => { event.preventDefault(); void login(); }}>
                <fieldset>
                  <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100">I’m signing in as</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {ROLE_OPTIONS.map((role) => {
                      const Icon = role.icon;
                      const selected = selectedRole === role.id;
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => selectRole(role.id)}
                          aria-label={role.label}
                          aria-pressed={selected}
                          className={clsx(
                            'flex min-h-20 flex-col items-start justify-between rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
                            selected
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-950 shadow-sm dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-slate-600'
                          )}
                        >
                          <Icon className={clsx('h-4 w-4', selected ? 'text-indigo-700 dark:text-indigo-200' : 'text-slate-500')} aria-hidden="true" />
                          <span className="text-xs font-bold sm:text-[11px]">{role.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{activeRole.description}</p>
                </fieldset>

                <div>
                  <label htmlFor={identifierId} className="text-sm font-semibold text-slate-800 dark:text-slate-100">{activeRole.identifierLabel}</label>
                  <input
                    id={identifierId}
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder={activeRole.identifierPlaceholder}
                    className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-500/15"
                    autoComplete="username"
                    inputMode={selectedRole === 'developer' ? 'email' : 'text'}
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    autoFocus
                  />
                </div>

                {selectedRole !== 'developer' && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-700 dark:bg-slate-950/35">
                    <div className="flex items-start gap-2">
                      <School className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">School details <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span></p>
                        <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">Use the school code when the same phone number is linked to more than one school.</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {selectedRole === 'student' ? <div>
                        <label htmlFor={classId} className="text-xs font-medium text-slate-700 dark:text-slate-200">Class</label>
                        <select
                          id={classId}
                          value={classLevel}
                          onChange={(event) => setClassLevel(event.target.value as '10' | '12' | '')}
                          className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        >
                          <option value="">Any class</option>
                          <option value="10">Class 10</option>
                          <option value="12">Class 12</option>
                        </select>
                      </div> : null}
                      <div>
                        <label htmlFor={schoolCodeId} className="text-xs font-medium text-slate-700 dark:text-slate-200">School code</label>
                        <input
                          id={schoolCodeId}
                          value={schoolCode}
                          onChange={(event) => setSchoolCode(event.target.value.toUpperCase())}
                          placeholder="e.g. VID"
                          maxLength={16}
                          autoCapitalize="characters"
                          spellCheck={false}
                          className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm uppercase text-slate-900 outline-none placeholder:normal-case focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={passwordId} className="text-sm font-semibold text-slate-800 dark:text-slate-100">Password</label>
                    {selectedRole === 'teacher' || selectedRole === 'admin' ? (
                      <Link href="/forgot-password" className="rounded text-xs font-semibold text-indigo-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-200">Forgot password?</Link>
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {selectedRole === 'student' ? 'Ask your school admin for access' : 'Contact the platform owner'}
                      </span>
                    )}
                  </div>
                  <div className="relative mt-2">
                    <input
                      id={passwordId}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      type={showPassword ? 'text' : 'password'}
                      className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 pr-12 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-500/15"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:text-white"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || retryAfterSeconds > 0}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-[0_10px_28px_-12px_rgba(79,70,229,0.9)] transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65 dark:focus-visible:ring-offset-slate-900"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Signing you in…</>
                  ) : retryAfterSeconds > 0 ? (
                    <>Try again in {retryAfterSeconds}s</>
                  ) : (
                    <>Continue to {activeRole.shortLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" /></>
                  )}
                </button>
              </form>

              <div className="min-h-0" aria-live="polite" aria-atomic="true">
                {error && (
                  <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-5 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100" role="alert">
                    {error}
                  </p>
                )}
                {successMsg && (
                  <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100" role="status">
                    <Sparkles className="h-4 w-4" aria-hidden="true" /> {successMsg}
                  </p>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <Link href="/" className="font-semibold text-slate-700 hover:text-indigo-700 dark:text-slate-200 dark:hover:text-indigo-200">← Back to home</Link>
                <span>Need access? Ask your school or platform administrator.</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function UnifiedLoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <UnifiedLoginContent />
    </Suspense>
  );
}
