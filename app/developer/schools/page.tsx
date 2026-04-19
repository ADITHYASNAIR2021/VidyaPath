'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, School } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

interface SchoolDirectoryItem {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  status: 'active' | 'inactive' | 'archived';
  teachers: number;
  students: number;
  studentsClass10: number;
  studentsClass12: number;
  admins: number;
  totalTokens: number;
  adminContacts: Array<{ id: string; name: string; phone?: string; email?: string }>;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function DeveloperSchoolsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [schoolDirectory, setSchoolDirectory] = useState<SchoolDirectoryItem[]>([]);

  async function loadSchools() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, schoolsRes] = await Promise.all([
        fetch('/api/developer/session/me', { cache: 'no-store' }),
        fetch('/api/developer/schools', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        setError('Session error. Please refresh or sign in again.');
        return;
      }
      const body = await schoolsRes.json().catch(() => null);
      if (!schoolsRes.ok) {
        setError(body?.message || 'Failed to load schools.');
        setSchoolDirectory([]);
        return;
      }
      const data = unwrap<{ schoolDirectory?: SchoolDirectoryItem[] }>(body);
      setSchoolDirectory(Array.isArray(data.schoolDirectory) ? data.schoolDirectory : []);
    } catch {
      setError('Failed to load schools.');
      setSchoolDirectory([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchools();
  }, []);

  const totals = useMemo(
    () =>
      schoolDirectory.reduce(
        (acc, row) => {
          acc.schools += 1;
          acc.teachers += row.teachers;
          acc.students += row.students;
          acc.admins += row.admins;
          acc.tokens += row.totalTokens;
          return acc;
        },
        { schools: 0, teachers: 0, students: 0, admins: 0, tokens: 0 }
      ),
    [schoolDirectory]
  );

  function getHealthScore(row: SchoolDirectoryItem): number {
    let score = 0;
    if (row.status === 'active') score += 30;
    if (row.admins > 0) score += 15;
    if (row.teachers > 0) score += 15;
    if (row.students > 0) score += 20;
    if (row.totalTokens > 0) score += 10;
    if (row.students > 0 && row.teachers > 0) {
      const ratio = row.students / row.teachers;
      if (ratio >= 10 && ratio <= 60) score += 10;
    }
    return Math.min(100, score);
  }

  function healthBadge(score: number): string {
    if (score >= 80) return 'bg-emerald-50 text-emerald-700';
    if (score >= 55) return 'bg-amber-50 text-amber-700';
    return 'bg-rose-50 text-rose-700';
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <BackButton href="/developer" label="Console" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <School className="h-6 w-6 text-violet-600" />
            Schools
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">School directory with enrollment, admins, and token stats.</p>
        </div>
        <button
          onClick={() => void loadSchools()}
          disabled={loading}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50 disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </span>
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-3"><p className="text-xs text-gray-500">Schools</p><p className="text-xl font-semibold">{totals.schools}</p></div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-3"><p className="text-xs text-gray-500">Teachers</p><p className="text-xl font-semibold">{totals.teachers}</p></div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-3"><p className="text-xs text-gray-500">Students</p><p className="text-xl font-semibold">{totals.students}</p></div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-3"><p className="text-xs text-gray-500">Admins</p><p className="text-xl font-semibold">{totals.admins}</p></div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-3"><p className="text-xs text-gray-500">Tokens</p><p className="text-xl font-semibold">{totals.tokens.toLocaleString()}</p></div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading schools...
        </div>
      ) : schoolDirectory.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No schools found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E8E4DC] bg-white shadow-sm">
          <table className="min-w-[1080px] w-full">
            <thead>
              <tr className="border-b border-[#E8E4DC] bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">School</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Code</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Teachers</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Students</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Class 10/12</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Admins</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Tokens</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Health</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Contacts</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schoolDirectory.map((row) => {
                const health = getHealthScore(row);
                return (
                <tr key={row.schoolId} className="border-b border-[#E8E4DC] last:border-0">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                    <Link href={`/developer/schools/${row.schoolId}`} className="hover:underline text-violet-700">
                      {row.schoolName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{row.schoolCode}</td>
                  <td className="px-4 py-3 text-right text-sm">{row.teachers}</td>
                  <td className="px-4 py-3 text-right text-sm">{row.students}</td>
                  <td className="px-4 py-3 text-right text-sm">{row.studentsClass10}/{row.studentsClass12}</td>
                  <td className="px-4 py-3 text-right text-sm">{row.admins}</td>
                  <td className="px-4 py-3 text-right text-sm">{row.totalTokens.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={clsx('rounded-full px-2 py-1 text-[11px] font-semibold', healthBadge(health))}>
                      {health}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {row.adminContacts.length === 0 ? '-' : row.adminContacts.slice(0, 2).map((contact) => (
                      <p key={contact.id}>{contact.name}{contact.phone ? ` | ${contact.phone}` : ''}</p>
                    ))}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'rounded-full px-2 py-1 text-[11px] font-semibold capitalize',
                      row.status === 'active' ? 'bg-emerald-50 text-emerald-700' : row.status === 'inactive' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-700'
                    )}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/developer/schools/${row.schoolId}`}
                      className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
