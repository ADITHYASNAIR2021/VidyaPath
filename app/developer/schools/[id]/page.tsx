'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  School,
  Users,
  GraduationCap,
  ShieldCheck,
  Zap,
  Edit2,
  X,
  Check,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  adminIdentifier: string;
}

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
  adminContacts: AdminContact[];
}

interface SchoolProfile {
  id: string;
  schoolName: string;
  schoolCode: string;
  board: string;
  city?: string;
  state?: string;
  contactPhone?: string;
  contactEmail?: string;
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
  updatedAt: string;
}

interface SchoolOverview {
  school: SchoolProfile;
  schoolDirectory: SchoolDirectoryItem[];
  counts: {
    schools: number;
    teachers: number;
    students: number;
    admins: number;
  };
  classCounts: Array<{ classLevel: 10 | 12; count: number }>;
  tokenUsage: {
    totalTokens: number;
    events: number;
    byEndpoint: Array<{ endpoint: string; totalTokens: number; events: number }>;
  };
}

interface AdminAccount {
  id: string;
  schoolId: string;
  schoolCode?: string;
  schoolName?: string;
  name: string;
  adminIdentifier: string;
  phone?: string;
  authEmail?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface EditForm {
  schoolName: string;
  board: string;
  city: string;
  state: string;
  status: 'active' | 'inactive' | 'archived';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function statusBadge(status: 'active' | 'inactive' | 'archived') {
  return clsx(
    'rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize',
    status === 'active' && 'bg-emerald-50 text-emerald-700',
    status === 'inactive' && 'bg-amber-50 text-amber-700',
    status === 'archived' && 'bg-gray-100 text-gray-700'
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-gray-500">
        {icon}
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeveloperSchoolDetailPage() {
  const params = useParams();
  const schoolId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<SchoolOverview | null>(null);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);

  // Edit form state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    schoolName: '',
    board: '',
    city: '',
    state: '',
    status: 'active',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Status toggle state
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  async function loadData() {
    if (!schoolId) return;
    setLoading(true);
    setError('');
    try {
      const [sessionRes, overviewRes] = await Promise.all([
        fetch('/api/developer/session/me', { cache: 'no-store' }),
        fetch(`/api/developer/schools/${schoolId}/overview`, { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        setError('Session error. Please refresh or sign in again.');
        return;
      }
      const overviewBody = await overviewRes.json().catch(() => null);
      if (!overviewRes.ok) {
        setError(overviewBody?.message || 'Failed to load school overview.');
        return;
      }
      const data = unwrap<SchoolOverview>(overviewBody);
      setOverview(data);
      setEditForm({
        schoolName: data.school.schoolName,
        board: data.school.board ?? '',
        city: data.school.city ?? '',
        state: data.school.state ?? '',
        status: data.school.status,
      });
    } catch {
      setError('Failed to load school overview.');
    } finally {
      setLoading(false);
    }
  }

  async function loadAdmins() {
    if (!schoolId) return;
    setAdminsLoading(true);
    try {
      const res = await fetch(`/api/developer/schools/${schoolId}/admins`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        const data = unwrap<{ admins: AdminAccount[] }>(body);
        setAdmins(Array.isArray(data.admins) ? data.admins : []);
      }
    } catch {
      // non-critical — leave empty
    } finally {
      setAdminsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    void loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  async function handleSaveEdit() {
    if (!schoolId || !overview) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/developer/schools/${schoolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(body?.message || 'Failed to save changes.');
        return;
      }
      const data = unwrap<{ school: SchoolProfile }>(body);
      setOverview((prev) =>
        prev ? { ...prev, school: data.school } : prev
      );
      setEditing(false);
    } catch {
      setSaveError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(newStatus: 'active' | 'inactive' | 'archived') {
    if (!schoolId) return;
    setStatusSaving(true);
    setStatusMsg('');
    try {
      const res = await fetch(`/api/developer/schools/${schoolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setStatusMsg(body?.message || 'Failed to update status.');
        return;
      }
      const data = unwrap<{ school: SchoolProfile }>(body);
      setOverview((prev) =>
        prev ? { ...prev, school: data.school } : prev
      );
      setStatusMsg('Status updated.');
    } catch {
      setStatusMsg('Failed to update status.');
    } finally {
      setStatusSaving(false);
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const schoolEntry = overview?.schoolDirectory.find((s) => s.schoolId === schoolId);
  const totalTokens = schoolEntry?.totalTokens ?? overview?.tokenUsage.totalTokens ?? 0;
  const TOKEN_DISPLAY_MAX = 1_000_000;
  const tokenPercent = Math.min(100, (totalTokens / TOKEN_DISPLAY_MAX) * 100);
  const schoolTeachers = schoolEntry?.teachers ?? overview?.counts.teachers ?? 0;
  const schoolStudents = schoolEntry?.students ?? overview?.counts.students ?? 0;
  const schoolAdmins = schoolEntry?.admins ?? overview?.counts.admins ?? 0;
  const healthScore = Math.min(
    100,
    (overview?.school.status === 'active' ? 30 : overview?.school.status === 'inactive' ? 15 : 0) +
      (schoolAdmins > 0 ? 15 : 0) +
      (schoolTeachers > 0 ? 15 : 0) +
      (schoolStudents > 0 ? 20 : 0) +
      (totalTokens > 0 ? 10 : 0) +
      (schoolTeachers > 0 && schoolStudents > 0 && schoolStudents / schoolTeachers >= 10 && schoolStudents / schoolTeachers <= 60 ? 10 : 0)
  );
  const healthTone =
    healthScore >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : healthScore >= 55 ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-rose-700 bg-rose-50 border-rose-200';

  const adminContacts = schoolEntry?.adminContacts ?? [];

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
        Loading school…
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <Link href="/developer/schools" className="mb-4 inline-flex items-center gap-1.5 text-sm text-violet-600 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Schools
        </Link>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || 'School not found.'}
        </div>
      </div>
    );
  }

  const { school } = overview;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">

      {/* ── Back link ── */}
      <Link
        href="/developer/schools"
        className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Schools
      </Link>

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
              <School className="h-6 w-6 text-violet-600" />
              {school.schoolName}
            </h1>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
              {school.schoolCode}
            </span>
            <span className={statusBadge(school.status)}>{school.status}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{school.city}{school.city && school.state ? ', ' : ''}{school.state}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50 disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </span>
          </button>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Inline Edit Form ── */}
      {editing && (
        <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-violet-700">Edit School Details</p>
            <button
              onClick={() => { setEditing(false); setSaveError(''); }}
              type="button"
              aria-label="Discard changes"
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-school-name" className="mb-1 block text-xs font-medium text-gray-600">School Name</label>
              <input
                id="edit-school-name"
                type="text"
                value={editForm.schoolName}
                onChange={(e) => setEditForm((f) => ({ ...f, schoolName: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="edit-board" className="mb-1 block text-xs font-medium text-gray-600">Board</label>
              <input
                id="edit-board"
                type="text"
                value={editForm.board}
                onChange={(e) => setEditForm((f) => ({ ...f, board: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="edit-city" className="mb-1 block text-xs font-medium text-gray-600">City</label>
              <input
                id="edit-city"
                type="text"
                value={editForm.city}
                onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="edit-state" className="mb-1 block text-xs font-medium text-gray-600">State</label>
              <input
                id="edit-state"
                type="text"
                value={editForm.state}
                onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="edit-status" className="mb-1 block text-xs font-medium text-gray-600">Status</label>
              <select
                id="edit-status"
                value={editForm.status}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    status: e.target.value as 'active' | 'inactive' | 'archived',
                  }))
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          {saveError && (
            <p className="text-sm text-rose-600">{saveError}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleSaveEdit()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              onClick={() => { setEditing(false); setSaveError(''); }}
              disabled={saving}
              className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Overview Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard
          label="Teachers"
          value={schoolEntry?.teachers ?? overview.counts.teachers}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Students"
          value={schoolEntry?.students ?? overview.counts.students}
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <StatCard
          label="Class 10"
          value={schoolEntry?.studentsClass10 ?? (overview.classCounts.find((c) => c.classLevel === 10)?.count ?? 0)}
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <StatCard
          label="Class 12"
          value={schoolEntry?.studentsClass12 ?? (overview.classCounts.find((c) => c.classLevel === 12)?.count ?? 0)}
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <StatCard
          label="Admins"
          value={schoolEntry?.admins ?? overview.counts.admins}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>

      <div className={`rounded-2xl border p-5 shadow-sm ${healthTone}`}>
        <h2 className="text-sm font-semibold">School Health Score</h2>
        <p className="mt-1 text-3xl font-bold">{healthScore}/100</p>
        <p className="mt-1 text-xs">
          Based on status, admins, teachers, students, usage activity, and teacher-student balance.
        </p>
      </div>

      {/* ── Token Usage ── */}
      <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-gray-800">Token Usage</h2>
        </div>
        <p className="text-3xl font-bold text-gray-900">{totalTokens.toLocaleString()}</p>
        <p className="mt-0.5 text-xs text-gray-500">total tokens consumed</p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-500"
            style={{ width: `${tokenPercent}%` }}
          />
        </div>
        <p className="mt-1 text-right text-xs text-gray-400">
          {tokenPercent.toFixed(1)}% of {TOKEN_DISPLAY_MAX.toLocaleString()} display cap
        </p>
      </div>

      {/* ── Admin Contacts ── */}
      {adminContacts.length > 0 && (
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">Admin Contacts</h2>
          <ul className="divide-y divide-gray-100">
            {adminContacts.map((contact) => (
              <li key={contact.id} className="py-2.5 text-sm">
                <p className="font-medium text-gray-900">{contact.name}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {[contact.phone, contact.email].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── School Info ── */}
      <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">School Info</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 text-sm">
          {[
            { label: 'Board', value: school.board },
            { label: 'City', value: school.city },
            { label: 'State', value: school.state },
            { label: 'Contact Phone', value: school.contactPhone },
            { label: 'Contact Email', value: school.contactEmail },
            { label: 'Created', value: formatDate(school.createdAt) },
          ].map(({ label, value }) =>
            value ? (
              <div key={label}>
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="mt-0.5 font-medium text-gray-900">{value}</dd>
              </div>
            ) : null
          )}
        </dl>
      </div>

      {/* ── Admins Panel ── */}
      <div className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#E8E4DC] px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800">Admin Accounts</h2>
          {adminsLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-gray-400" />}
        </div>
        {admins.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-gray-400">
            {adminsLoading ? 'Loading…' : 'No admin accounts found.'}
          </p>
        ) : (
          <ul className="divide-y divide-[#E8E4DC]">
            {admins.map((admin) => (
              <li key={admin.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{admin.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {admin.adminIdentifier}
                    {admin.authEmail ? ` · ${admin.authEmail}` : ''}
                  </p>
                </div>
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                    admin.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  )}
                >
                  {admin.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Quick Actions ── */}
      <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Quick Actions</h2>
        <div className="flex flex-wrap items-start gap-3">
          {/* View Onboarding */}
          <Link
            href="/developer/onboarding"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
          >
            View Onboarding
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>

          {/* View Audit Log */}
          <Link
            href="/developer/audit"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
          >
            View Audit Log
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>

          {/* Status toggle buttons */}
          {(['active', 'inactive', 'archived'] as const)
            .filter((s) => s !== school.status)
            .map((s) => (
              <button
                key={s}
                onClick={() => void handleStatusChange(s)}
                disabled={statusSaving}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold capitalize disabled:opacity-60',
                  s === 'active' && 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                  s === 'inactive' && 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
                  s === 'archived' && 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {statusSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                Set {s}
              </button>
            ))}
        </div>
        {statusMsg && (
          <p className="mt-2 text-xs text-violet-600">{statusMsg}</p>
        )}
      </div>
    </div>
  );
}
