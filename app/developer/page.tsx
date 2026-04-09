'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface SchoolItem {
  id: string;
  schoolName: string;
  schoolCode: string;
  board: string;
  city?: string;
  state?: string;
  status: 'active' | 'inactive' | 'archived';
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
  adminContacts: Array<{ id: string; name: string; phone?: string; email?: string; adminIdentifier: string }>;
}

interface TokenUsagePayload {
  events: number;
  totalTokens: number;
  records: Array<{
    id: string;
    createdAt: string;
    schoolId?: string;
    role?: string;
    endpoint: string;
    provider?: string;
    model?: string;
    totalTokens: number;
    estimated: boolean;
  }>;
}

interface AuditPayload {
  events: Array<{
    id: string;
    type: string;
    createdAt: string;
    actor: string;
    action: string;
    metadata: Record<string, unknown>;
  }>;
}

export default function DeveloperPage() {
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [schoolDirectory, setSchoolDirectory] = useState<SchoolDirectoryItem[]>([]);
  const [usage, setUsage] = useState<TokenUsagePayload | null>(null);
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [error, setError] = useState('');
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    async function load() {
      try {
        const [schoolRes, usageRes, auditRes] = await Promise.all([
          fetch('/api/developer/schools', { cache: 'no-store', signal: controller.signal }),
          fetch('/api/developer/usage/tokens?limit=120', { cache: 'no-store', signal: controller.signal }),
          fetch('/api/developer/audit?limit=120', { cache: 'no-store', signal: controller.signal }),
        ]);
        if (!alive) return;
        if (!schoolRes.ok) {
          const payload = await schoolRes.json().catch(() => null);
          setError(payload?.error || 'Failed to load developer console.');
          return;
        }
        const schoolPayload = await schoolRes.json().catch(() => ({ schools: [], schoolDirectory: [] }));
        const usagePayload = await usageRes.json().catch(() => null);
        const auditPayload = await auditRes.json().catch(() => null);
        setSchools(Array.isArray(schoolPayload.schools) ? schoolPayload.schools : []);
        setSchoolDirectory(Array.isArray(schoolPayload.schoolDirectory) ? schoolPayload.schoolDirectory : []);
        setUsage(usagePayload);
        setAudit(auditPayload);
      } catch {
        if (alive) setError('Failed to load developer console.');
      }
    }

    void load();
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  const activeSchools = useMemo(() => schools.filter((school) => school.status === 'active').length, [schools]);
  const totalTokens = usage?.totalTokens ?? 0;

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-8 lg:px-12">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
          <h1 className="font-fraunces text-3xl font-bold text-navy-700">Developer Console</h1>
          <p className="mt-2 text-sm text-[#5F5A73]">
            Platform-wide oversight for schools, auth roles, audits, and token usage.
          </p>
          {error && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
              <p className="text-xs uppercase tracking-wide text-[#7A7490]">Schools</p>
              <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{schools.length}</p>
              <p className="text-xs text-[#7A7490]">{activeSchools} active</p>
            </div>
            <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
              <p className="text-xs uppercase tracking-wide text-[#7A7490]">Token Events</p>
              <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{usage?.events ?? 0}</p>
              <p className="text-xs text-[#7A7490]">AI endpoint usage logs</p>
            </div>
            <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
              <p className="text-xs uppercase tracking-wide text-[#7A7490]">Total Tokens</p>
              <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{totalTokens.toLocaleString()}</p>
              <p className="text-xs text-[#7A7490]">Across tracked requests</p>
            </div>
          </div>
        </div>

        {(tab === 'overview' || tab === 'schools') && (
          <section className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
            <h2 className="font-fraunces text-2xl font-bold text-navy-700">Registered Schools</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#7A7490]">
                    <th className="py-2 pr-4">School</th>
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">Teachers</th>
                    <th className="py-2 pr-4">Students (10/12)</th>
                    <th className="py-2 pr-4">Admins</th>
                    <th className="py-2 pr-4">Tokens</th>
                    <th className="py-2 pr-4">Admin Contacts</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {schoolDirectory.map((school) => (
                    <tr key={school.schoolId} className="border-t border-[#F0ECE3] align-top">
                      <td className="py-2 pr-4 font-medium text-[#1C1C2E]">{school.schoolName}</td>
                      <td className="py-2 pr-4">{school.schoolCode}</td>
                      <td className="py-2 pr-4">{school.teachers}</td>
                      <td className="py-2 pr-4">{school.students} ({school.studentsClass10}/{school.studentsClass12})</td>
                      <td className="py-2 pr-4">{school.admins}</td>
                      <td className="py-2 pr-4">{school.totalTokens.toLocaleString()}</td>
                      <td className="py-2 pr-4">
                        {school.adminContacts.length === 0 ? (
                          <span className="text-[#7A7490]">-</span>
                        ) : (
                          <div className="space-y-1">
                            {school.adminContacts.slice(0, 2).map((contact) => (
                              <p key={contact.id} className="text-xs text-[#4A4560]">
                                {contact.name}
                                {contact.phone ? ` | ${contact.phone}` : ''}
                                {contact.email ? ` | ${contact.email}` : ''}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4 capitalize">{school.status}</td>
                    </tr>
                  ))}
                  {schoolDirectory.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-4 text-[#7A7490]">No schools configured yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {(tab === 'overview' || tab === 'usage') && (
          <section className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
            <h2 className="font-fraunces text-2xl font-bold text-navy-700">Token Usage (Recent)</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#7A7490]">
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Endpoint</th>
                    <th className="py-2 pr-4">Provider</th>
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {(usage?.records ?? []).slice(0, 30).map((row) => (
                    <tr key={row.id} className="border-t border-[#F0ECE3]">
                      <td className="py-2 pr-4">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-4">{row.role || '-'}</td>
                      <td className="py-2 pr-4">{row.endpoint}</td>
                      <td className="py-2 pr-4">{row.provider || '-'}</td>
                      <td className="py-2 pr-4">{row.model || '-'}</td>
                      <td className="py-2 pr-4">{row.totalTokens}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {(tab === 'overview' || tab === 'audit') && (
          <section className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
            <h2 className="font-fraunces text-2xl font-bold text-navy-700">Audit Feed</h2>
            <div className="mt-4 space-y-2">
              {(audit?.events ?? []).slice(0, 30).map((event) => (
                <div key={event.id} className="rounded-xl border border-[#EFE9DD] bg-[#FCFAF4] p-3">
                  <p className="text-xs text-[#7A7490]">{new Date(event.createdAt).toLocaleString()}</p>
                  <p className="mt-1 text-sm font-semibold text-[#1C1C2E]">{event.actor} - {event.action}</p>
                  <p className="mt-1 text-xs text-[#6B6580]">{event.type}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
