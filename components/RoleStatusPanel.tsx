'use client';

import clsx from 'clsx';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

type Role = 'student' | 'teacher' | 'admin' | 'developer';
type Variant = 'loading' | 'empty' | 'error';

interface RoleStatusPanelProps {
  role: Role;
  variant: Variant;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const ROLE_TONES: Record<Role, { ring: string; bg: string; text: string }> = {
  student: { ring: 'border-emerald-200 dark:border-emerald-400/40', bg: 'bg-emerald-50 dark:bg-emerald-500/20', text: 'text-emerald-800 dark:text-emerald-100' },
  teacher: { ring: 'border-amber-200 dark:border-amber-400/40', bg: 'bg-amber-50 dark:bg-amber-500/20', text: 'text-amber-800 dark:text-amber-100' },
  admin: { ring: 'border-indigo-200 dark:border-indigo-400/40', bg: 'bg-indigo-50 dark:bg-indigo-500/20', text: 'text-indigo-800 dark:text-indigo-100' },
  developer: { ring: 'border-violet-200 dark:border-violet-400/40', bg: 'bg-violet-50 dark:bg-violet-500/20', text: 'text-violet-800 dark:text-violet-100' },
};

const DEFAULT_COPY: Record<Variant, { title: string; message: string }> = {
  loading: {
    title: 'Loading workspace',
    message: 'Please wait while we prepare your dashboard.',
  },
  empty: {
    title: 'Nothing to show yet',
    message: 'No records are available right now. Try again after data sync.',
  },
  error: {
    title: 'Something went wrong',
    message: 'We could not complete this request. Please try again.',
  },
};

export default function RoleStatusPanel({
  role,
  variant,
  title,
  message,
  actionLabel,
  onAction,
}: RoleStatusPanelProps) {
  const tone = ROLE_TONES[role];
  const defaults = DEFAULT_COPY[variant];
  const panelTitle = title || defaults.title;
  const panelMessage = message || defaults.message;

  return (
    <div className="min-h-[38vh] w-full px-4 py-10">
      <div className={clsx('mx-auto max-w-2xl rounded-2xl border p-6 shadow-sm', tone.ring, 'bg-[var(--color-surface)]')}>
        <div className={clsx('mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border', tone.ring, tone.bg, tone.text)}>
          {variant === 'loading' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : variant === 'empty' ? (
            <Inbox className="h-5 w-5" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
        </div>
        <h2 className="font-fraunces text-2xl font-bold text-[var(--color-text)]">{panelTitle}</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]" role={variant === 'error' ? 'alert' : undefined}>
          {panelMessage}
        </p>
        {onAction ? (
          <button
            type="button"
            onClick={onAction}
            className={clsx(
              'mt-4 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors',
              tone.ring,
              tone.bg,
              tone.text
            )}
          >
            {actionLabel || 'Try again'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

