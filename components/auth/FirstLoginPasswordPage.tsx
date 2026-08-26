'use client';

import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';

type FirstLoginRole = 'student' | 'teacher' | 'admin';

interface FirstLoginPasswordPageProps {
  role: FirstLoginRole;
  sessionEndpoint: string;
  loginHref: string;
  workspaceHref: string;
}

const ROLE_COPY: Record<FirstLoginRole, { label: string; description: string; accent: string; soft: string }> = {
  student: {
    label: 'Student',
    description: 'Protect your learning record, assignments, and progress.',
    accent: 'bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-500',
    soft: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200',
  },
  teacher: {
    label: 'Teacher',
    description: 'Protect your classes, grading, and student information.',
    accent: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500',
    soft: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100',
  },
  admin: {
    label: 'Principal',
    description: 'Protect your school settings, staff accounts, and student records.',
    accent: 'bg-violet-600 hover:bg-violet-700 focus-visible:ring-violet-500',
    soft: 'bg-violet-50 text-violet-800 dark:bg-violet-500/15 dark:text-violet-100',
  },
};

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</label>
      {hint ? <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
      <div className="relative mt-2">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 pr-12 text-base text-slate-950 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-500/15"
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:text-white"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export default function FirstLoginPasswordPage({ role, sessionEndpoint, loginHref, workspaceHref }: FirstLoginPasswordPageProps) {
  const router = useRouter();
  const currentId = useId();
  const newId = useId();
  const confirmId = useId();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const copy = ROLE_COPY[role];

  useEffect(() => {
    const controller = new AbortController();
    fetch(sessionEndpoint, { cache: 'no-store', credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          router.replace(`${loginHref}?reason=auth-required`);
          return;
        }
        const payload = await response.json().catch(() => null);
        const data = payload?.data && typeof payload.data === 'object' ? payload.data as Record<string, unknown> : null;
        const profileKey = role === 'teacher' ? 'teacher' : role === 'admin' ? 'admin' : 'student';
        const profile = data?.[profileKey] && typeof data[profileKey] === 'object'
          ? data[profileKey] as Record<string, unknown>
          : null;
        if (!profile || profile.mustChangePassword !== true) router.replace(workspaceHref);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        router.replace(`${loginHref}?reason=auth-required`);
      })
      .finally(() => setBootLoading(false));
    return () => controller.abort();
  }, [loginHref, role, router, sessionEndpoint, workspaceHref]);

  const checks = useMemo(() => [
    { label: '6–18 characters', ok: newPassword.length >= 6 && newPassword.length <= 18 },
    { label: 'Uppercase and lowercase', ok: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) },
    { label: 'A number', ok: /[0-9]/.test(newPassword) },
    { label: 'A special symbol', ok: /[^A-Za-z0-9]/.test(newPassword) },
  ], [newPassword]);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match yet.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/password/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'We could not update your password. Please try again.');
        return;
      }
      setSuccess('Your account is secure. Taking you back to sign in…');
      window.setTimeout(() => router.replace(`${loginHref}?reason=password-updated&force=1`), 850);
    } catch {
      setError('The connection was interrupted. Your password was not changed—please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main data-auth-experience className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-[#f7f8fc] px-4 py-8 sm:px-6 dark:bg-slate-950">
      <div className="pointer-events-none absolute -left-28 -top-28 h-72 w-72 rounded-full bg-indigo-200/50 blur-3xl dark:bg-indigo-900/20" aria-hidden="true" />
      <div className="relative w-full max-w-lg rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur sm:p-8 dark:border-white/10 dark:bg-slate-900/90">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="font-fraunces text-xl font-bold text-slate-950 dark:text-white">VidyaPath</Link>
          <span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide', copy.soft)}>{copy.label} setup</span>
        </div>

        <div className="mt-8 flex items-start gap-3">
          <div className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', copy.soft)}>
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Final setup · about one minute</p>
            <h1 className="mt-2 font-fraunces text-2xl font-bold text-slate-950 sm:text-3xl dark:text-white">Make this account yours</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.description} Replace the temporary password before entering your workspace.</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 text-xs" aria-label="Setup progress">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100">
            <span className="font-bold">1. Identity</span><span className="mt-0.5 block">Confirmed</span>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-100">
            <span className="font-bold">2. Password</span><span className="mt-0.5 block">In progress</span>
          </div>
        </div>

        {bootLoading ? (
          <div className="mt-7 flex min-h-40 items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-300" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking your secure session…
          </div>
        ) : (
          <form className="mt-7 space-y-5" onSubmit={submitPasswordChange}>
            <PasswordField
              id={currentId}
              label="Temporary password"
              value={currentPassword}
              onChange={setCurrentPassword}
              visible={visible.current}
              onToggle={() => setVisible((state) => ({ ...state, current: !state.current }))}
              autoComplete="current-password"
              hint="Use the temporary password issued by your school."
            />
            <PasswordField
              id={newId}
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              visible={visible.next}
              onToggle={() => setVisible((state) => ({ ...state, next: !state.next }))}
              autoComplete="new-password"
            />

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/35" aria-live="polite">
              {checks.map((check) => (
                <div key={check.label} className={clsx('flex items-center gap-1.5 text-[11px]', check.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400')}>
                  <span className={clsx('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', check.ok ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600')}>
                    {check.ok ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : null}
                  </span>
                  {check.label}
                </div>
              ))}
            </div>

            <PasswordField
              id={confirmId}
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              visible={visible.confirm}
              onToggle={() => setVisible((state) => ({ ...state, confirm: !state.confirm }))}
              autoComplete="new-password"
            />
            {confirmPassword ? (
              <p className={clsx('text-xs font-medium', passwordsMatch ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')} role="status">
                {passwordsMatch ? 'Passwords match.' : 'Passwords do not match yet.'}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className={clsx('flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65 dark:focus-visible:ring-offset-slate-900', copy.accent)}
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Securing your account…</> : <><KeyRound className="h-4 w-4" aria-hidden="true" /> Save password and continue</>}
            </button>
          </form>
        )}

        <div aria-live="polite" aria-atomic="true">
          {error ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100" role="alert">{error}</p> : null}
          {success ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100" role="status">{success}</p> : null}
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">Never share your password. VidyaPath staff will not ask for it.</p>
      </div>
    </main>
  );
}
