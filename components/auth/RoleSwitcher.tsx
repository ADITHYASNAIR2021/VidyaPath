'use client';

import { useEffect, useId, useState } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import type { PlatformRole } from '@/lib/auth/roles';
import { clearClientAuthSessionCache, fetchClientAuthSession } from '@/lib/client-auth-session';
import { clearClientStudentSessionCache } from '@/lib/client-student-session';

type ActiveRole = Exclude<PlatformRole, 'anonymous'>;

const ROLE_LABELS: Record<ActiveRole, string> = {
  student: 'Student',
  teacher: 'Teacher',
  admin: 'Admin',
  developer: 'Developer',
};

const ROLE_DESTINATIONS: Record<ActiveRole, string> = {
  student: '/dashboard',
  teacher: '/teacher',
  admin: '/admin',
  developer: '/developer',
};

function isActiveRole(value: unknown): value is ActiveRole {
  return value === 'student' || value === 'teacher' || value === 'admin' || value === 'developer';
}

export default function RoleSwitcher({ className }: { className?: string }) {
  const selectId = useId();
  const [currentRole, setCurrentRole] = useState<ActiveRole | null>(null);
  const [availableRoles, setAvailableRoles] = useState<ActiveRole[]>([]);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchClientAuthSession()
      .then((session) => {
        if (!active || !isActiveRole(session.role)) return;
        const roles = (session.availableRoles ?? [])
          .filter(isActiveRole)
          .filter((role, index, values) => values.indexOf(role) === index);
        setCurrentRole(session.role);
        setAvailableRoles(roles.length > 0 ? roles : [session.role]);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function switchRole(nextRole: ActiveRole) {
    if (!currentRole || nextRole === currentRole || switching) return;
    setSwitching(true);
    setError('');
    try {
      const response = await fetch('/api/auth/role/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: nextRole }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.message || 'Workspace switch failed. Please try again.');
        return;
      }
      clearClientAuthSessionCache();
      clearClientStudentSessionCache();
      window.location.assign(ROLE_DESTINATIONS[nextRole]);
    } catch {
      setError('The connection was interrupted. Please try again.');
    } finally {
      setSwitching(false);
    }
  }

  if (!currentRole || availableRoles.length < 2) return null;

  return (
    <div className={clsx('relative', className)}>
      <label htmlFor={selectId} className="sr-only">Switch workspace</label>
      <div className="relative">
        <ArrowRightLeft className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-secondary)]" aria-hidden="true" />
        <select
          id={selectId}
          value={currentRole}
          onChange={(event) => void switchRole(event.target.value as ActiveRole)}
          disabled={switching}
          className="min-h-9 appearance-none rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] py-1 pl-8 pr-8 text-xs font-semibold text-[var(--color-text)] outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-wait disabled:opacity-60 dark:focus:ring-indigo-500/20"
          aria-describedby={error ? `${selectId}-error` : undefined}
        >
          {availableRoles.map((role) => (
            <option key={role} value={role}>{ROLE_LABELS[role]} workspace</option>
          ))}
        </select>
        {switching ? (
          <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-indigo-600" aria-hidden="true" />
        ) : (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-secondary)]" aria-hidden="true">▾</span>
        )}
      </div>
      {error ? (
        <p id={`${selectId}-error`} className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-800 shadow-lg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
