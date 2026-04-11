'use client';

import { useEffect, useState } from 'react';
import { Settings, School, Shield, Bell, Database } from 'lucide-react';

interface AdminSession {
  role: string;
  schoolId?: string;
  schoolCode?: string;
  schoolName?: string;
  displayName?: string;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

export default function AdminSettingsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    fetch('/api/admin/session/me', { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (res.ok) setSession(unwrap<AdminSession | null>(body));
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-600" /> Settings
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">School configuration and system settings.</p>
      </div>

      <div className="space-y-4">
        {/* School info */}
        <div className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><School className="w-4 h-4 text-indigo-600" /> School Information</h2>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">School Name</p>
              <p className="font-semibold text-gray-800">{session?.schoolName ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">School Code</p>
              <p className="font-semibold text-gray-800">{session?.schoolCode ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">School ID</p>
              <p className="font-mono text-xs text-gray-500">{session?.schoolId ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Admin Role</p>
              <p className="font-semibold text-gray-800 capitalize">{session?.role ?? '—'}</p>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-indigo-600" /> Security</h2>
          <p className="text-sm text-gray-500 mb-3">Admin access is protected by HMAC-signed session tokens. All sessions expire automatically.</p>
          <div className="flex gap-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 font-medium">Session signing: Enabled</div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 font-medium">CSRF protection: Enabled</div>
          </div>
        </div>

        {/* Notifications */}
        <div className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Bell className="w-4 h-4 text-indigo-600" /> Push Notifications</h2>
          <p className="text-sm text-gray-500 mb-3">Web push notifications are configured via VAPID keys. Students and teachers can opt in to receive push notifications.</p>
          <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            VAPID: Configured
          </div>
        </div>

        {/* Storage */}
        <div className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-indigo-600" /> Database</h2>
          <p className="text-sm text-gray-500">Using Supabase PostgreSQL for persistent storage. Check the Overview page for real-time storage status.</p>
        </div>
      </div>
    </div>
  );
}
