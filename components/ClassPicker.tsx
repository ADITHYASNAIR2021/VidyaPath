'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useStudentProfileStore, type LocalClassLevel, type LocalStream } from '@/lib/store';

const STREAM_OPTIONS: Array<{ value: LocalStream; label: string }> = [
  { value: 'pcm', label: 'PCM' },
  { value: 'pcb', label: 'PCB' },
  { value: 'commerce', label: 'Commerce' },
];

/**
 * "Which class are you in?" — replaces the old student login.
 * Stored only in this browser (localStorage) and used to personalise
 * the dashboard, papers, AI hub and revision planner.
 */
export default function ClassPicker({
  variant = 'compact',
  className,
}: {
  variant?: 'compact' | 'full';
  className?: string;
}) {
  const { classLevel, stream, setClassLevel, setStream } = useStudentProfileStore();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const currentClass = hydrated ? classLevel : null;
  const currentStream = hydrated ? stream : null;

  if (variant === 'compact') {
    return (
      <label className={clsx('inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]', className)}>
        <span className="sr-only">My class</span>
        <select
          value={currentClass ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            setClassLevel(value === '10' || value === '12' ? (Number(value) as LocalClassLevel) : null);
          }}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text)]"
          aria-label="My class"
        >
          <option value="">My class</option>
          <option value="10">Class 10</option>
          <option value="12">Class 12</option>
        </select>
      </label>
    );
  }

  return (
    <div className={clsx('rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4', className)}>
      <p className="text-sm font-semibold text-[var(--color-text)]">Which class are you in?</p>
      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
        No sign-up needed — this is saved only on this device.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {([10, 12] as LocalClassLevel[]).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setClassLevel(level)}
            className={clsx(
              'rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors',
              currentClass === level
                ? 'border-saffron-500 bg-saffron-50 text-saffron-700 dark:bg-saffron-900/30 dark:text-saffron-300'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)]'
            )}
          >
            Class {level}
          </button>
        ))}
      </div>
      {currentClass === 12 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {STREAM_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStream(option.value)}
              className={clsx(
                'rounded-xl border px-3 py-1 text-xs font-semibold transition-colors',
                currentStream === option.value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)]'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
