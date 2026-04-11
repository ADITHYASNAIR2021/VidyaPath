'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BookOpen,
  CheckCircle,
  Database,
  RefreshCw,
  Save,
  School,
  Settings,
  Shield,
  Users,
} from 'lucide-react';

interface SchoolProfile {
  id: string;
  schoolName: string;
  schoolCode: string;
  board: string;
  city?: string;
  state?: string;
  contactPhone?: string;
  contactEmail?: string;
}

interface SettingsState {
  pinPolicy: {
    expiryDays: number;
  };
  notifications: {
    emailAnnouncements: boolean;
    pushAlerts: boolean;
    weeklyDigest: boolean;
  };
}

interface AdminOverview {
  totalTeachers: number;
  activeTeachers: number;
  assignmentCompletionsThisWeek: number;
  highRiskExamSessions: number;
  analytics?: {
    totalStudents?: number;
    activeStudents?: number;
  };
}

interface SettingsResponse {
  school: SchoolProfile;
  settings: SettingsState;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function defaultSettings(): SettingsState {
  return {
    pinPolicy: { expiryDays: 90 },
    notifications: {
      emailAnnouncements: true,
      pushAlerts: true,
      weeklyDigest: false,
    },
  };
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [school, setSchool] = useState<SchoolProfile | null>(null);
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [settingsRes, overviewRes] = await Promise.all([
        fetch('/api/admin/settings', { cache: 'no-store' }),
        fetch('/api/admin/overview', { cache: 'no-store' }),
      ]);

      const settingsBody = await settingsRes.json().catch(() => null);
      const overviewBody = await overviewRes.json().catch(() => null);

      if (!settingsRes.ok) {
        setError(settingsBody?.message || 'Failed to load settings.');
        return;
      }

      const settingsData = unwrap<SettingsResponse>(settingsBody);
      setSchool(settingsData.school);
      setSettings(settingsData.settings ?? defaultSettings());

      if (overviewRes.ok) {
        setOverview(unwrap<AdminOverview>(overviewBody));
      }
    } catch {
      setError('Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const stats = useMemo(
    () => [
      {
        label: 'Total Teachers',
        value: overview?.totalTeachers ?? 0,
        sub: `${overview?.activeTeachers ?? 0} active`,
        icon: <Users className="h-4 w-4 text-indigo-500" />,
        color: 'bg-indigo-50 border-indigo-100',
      },
      {
        label: 'Total Students',
        value: overview?.analytics?.totalStudents ?? 0,
        sub: `${overview?.analytics?.activeStudents ?? 0} active`,
        icon: <Users className="h-4 w-4 text-emerald-500" />,
        color: 'bg-emerald-50 border-emerald-100',
      },
      {
        label: 'Completions This Week',
        value: overview?.assignmentCompletionsThisWeek ?? 0,
        sub: 'assignment submissions',
        icon: <BookOpen className="h-4 w-4 text-amber-500" />,
        color: 'bg-amber-50 border-amber-100',
      },
      {
        label: 'High-Risk Exam Sessions',
        value: overview?.highRiskExamSessions ?? 0,
        sub: 'flagged for review',
        icon: <Shield className="h-4 w-4 text-rose-500" />,
        color: 'bg-rose-50 border-rose-100',
      },
    ],
    [overview]
  );

  async function saveSettings() {
    if (!school) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolName: school.schoolName,
          board: school.board,
          city: school.city || '',
          state: school.state || '',
          contactPhone: school.contactPhone || '',
          contactEmail: school.contactEmail || '',
          pinExpiryDays: settings.pinPolicy.expiryDays,
          notifications: settings.notifications,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to update settings.');
        return;
      }
      const data = unwrap<SettingsResponse>(body);
      setSchool(data.school);
      setSettings(data.settings);
      setSuccess('Settings saved successfully.');
      setTimeout(() => setSuccess(''), 2500);
    } catch {
      setError('Failed to update settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="flex h-48 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-5">
      <div>
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <Settings className="h-6 w-6 text-indigo-600" />
          Settings
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">School profile, policy controls, and notification preferences.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${item.color}`}>
            <div className="mb-1.5">{item.icon}</div>
            <p className="text-2xl font-bold text-gray-800 leading-none">{item.value}</p>
            <p className="mt-1 text-xs font-medium text-gray-600">{item.label}</p>
            <p className="text-[11px] text-gray-400">{item.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 flex items-center gap-2">
          <School className="h-4 w-4 text-indigo-600" />
          School Profile
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">School Name</label>
            <input
              value={school?.schoolName ?? ''}
              onChange={(event) => setSchool((prev) => (prev ? { ...prev, schoolName: event.target.value } : prev))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">School Code</label>
            <input
              value={school?.schoolCode ?? ''}
              disabled
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Board</label>
            <input
              value={school?.board ?? ''}
              onChange={(event) => setSchool((prev) => (prev ? { ...prev, board: event.target.value } : prev))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">City</label>
            <input
              value={school?.city ?? ''}
              onChange={(event) => setSchool((prev) => (prev ? { ...prev, city: event.target.value } : prev))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">State</label>
            <input
              value={school?.state ?? ''}
              onChange={(event) => setSchool((prev) => (prev ? { ...prev, state: event.target.value } : prev))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Contact Phone</label>
            <input
              value={school?.contactPhone ?? ''}
              onChange={(event) => setSchool((prev) => (prev ? { ...prev, contactPhone: event.target.value } : prev))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-500">Contact Email</label>
            <input
              value={school?.contactEmail ?? ''}
              onChange={(event) => setSchool((prev) => (prev ? { ...prev, contactEmail: event.target.value } : prev))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Shield className="h-4 w-4 text-indigo-600" />
          Policy Controls
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">PIN Expiry (days)</label>
            <input
              type="number"
              min={30}
              max={365}
              value={settings.pinPolicy.expiryDays}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  pinPolicy: {
                    expiryDays: Math.max(30, Math.min(365, Number(event.target.value) || 90)),
                  },
                }))
              }
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 self-end">
            Session signing and CSRF protections are active.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Bell className="h-4 w-4 text-indigo-600" />
          Notification Preferences
        </h2>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.notifications.emailAnnouncements}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  notifications: { ...prev.notifications, emailAnnouncements: event.target.checked },
                }))
              }
            />
            Email announcements for admins and class teachers
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.notifications.pushAlerts}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  notifications: { ...prev.notifications, pushAlerts: event.target.checked },
                }))
              }
            />
            Push alerts for school operations and outages
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.notifications.weeklyDigest}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  notifications: { ...prev.notifications, weeklyDigest: event.target.checked },
                }))
              }
            />
            Weekly digest with assignment and attendance trends
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Database className="h-4 w-4 text-indigo-600" />
          Data Layer
        </h2>
        <p className="text-sm text-gray-500">Settings are persisted in Supabase with audit logging enabled for admin updates.</p>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={() => void loadAll()}
          disabled={saving}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Reload
        </button>
        <button
          onClick={() => void saveSettings()}
          disabled={saving || !school}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
