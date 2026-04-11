'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface SchoolItem {
  id: string;
  schoolName: string;
  schoolCode: string;
  board: string;
  city?: string;
  state?: string;
  status: 'active' | 'inactive' | 'archived';
}

interface AffiliateRequestItem {
  id: string;
  schoolName: string;
  schoolCodeHint?: string;
  board?: string;
  state?: string;
  city?: string;
  affiliateNo?: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  linkedSchoolId?: string;
  createdAt: string;
}

export default function DeveloperOnboardingPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [requests, setRequests] = useState<AffiliateRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewState, setReviewState] = useState<Record<string, { schoolCode: string; reviewNotes: string }>>({});
  const [adminForm, setAdminForm] = useState({
    schoolId: '',
    name: '',
    adminIdentifier: '',
    phone: '',
    authEmail: '',
    password: '',
  });
  const [issuedCredentials, setIssuedCredentials] = useState<Record<string, unknown> | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [schoolsRes, requestsRes] = await Promise.all([
        fetch('/api/developer/schools', { cache: 'no-store' }),
        fetch('/api/developer/affiliate-requests?status=pending&limit=200', { cache: 'no-store' }),
      ]);
      const schoolsPayload = await schoolsRes.json().catch(() => null);
      const requestsPayload = await requestsRes.json().catch(() => null);
      if (schoolsRes.status === 401 || requestsRes.status === 401) {
        router.replace('/developer/login');
        return;
      }
      if (!schoolsRes.ok || !requestsRes.ok) {
        setError(
          schoolsPayload?.message ||
          requestsPayload?.message ||
          schoolsPayload?.error ||
          requestsPayload?.error ||
          'Failed to load onboarding console.'
        );
        return;
      }
      const schoolsData = schoolsPayload?.data ?? schoolsPayload;
      const requestsData = requestsPayload?.data ?? requestsPayload;
      const nextSchools = Array.isArray(schoolsData?.schools) ? schoolsData.schools : [];
      const nextRequests = Array.isArray(requestsData?.requests) ? requestsData.requests : [];
      setSchools(nextSchools);
      setRequests(nextRequests);
      setAdminForm((prev) => ({
        ...prev,
        schoolId: prev.schoolId || nextSchools[0]?.id || '',
      }));
    } catch {
      setError('Failed to load onboarding console.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getReviewDraft(requestId: string): { schoolCode: string; reviewNotes: string } {
    return reviewState[requestId] ?? { schoolCode: '', reviewNotes: '' };
  }

  async function reviewRequest(requestId: string, decision: 'approve' | 'reject') {
    setLoading(true);
    setError('');
    try {
      const draft = getReviewDraft(requestId);
      const response = await fetch(`/api/developer/affiliate-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          schoolCode: draft.schoolCode || undefined,
          reviewNotes: draft.reviewNotes || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.message || payload?.error || 'Failed to review request.');
        return;
      }
      await load();
    } catch {
      setError('Failed to review request.');
    } finally {
      setLoading(false);
    }
  }

  async function provisionSchoolAdmin() {
    setLoading(true);
    setError('');
    setIssuedCredentials(null);
    try {
      if (!adminForm.schoolId || !adminForm.name) {
        setError('School and admin name are required.');
        return;
      }
      const response = await fetch(`/api/developer/schools/${adminForm.schoolId}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: adminForm.name,
          adminIdentifier: adminForm.adminIdentifier || undefined,
          phone: adminForm.phone || undefined,
          authEmail: adminForm.authEmail || undefined,
          password: adminForm.password || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.message || payload?.error || 'Failed to provision school admin.');
        return;
      }
      const data = payload?.data ?? payload;
      setIssuedCredentials(data?.issuedCredentials ?? null);
      setAdminForm((prev) => ({
        ...prev,
        name: '',
        adminIdentifier: '',
        phone: '',
        authEmail: '',
        password: '',
      }));
      await load();
    } catch {
      setError('Failed to provision school admin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-fraunces text-3xl font-bold text-navy-700">Developer Onboarding Console</h1>
              <p className="mt-1 text-sm text-[#5F5A73]">
                Review affiliate requests, approve/reject schools, and provision admin credentials.
              </p>
            </div>
            <Link href="/developer" className="rounded-xl border border-[#E8E4DC] bg-white px-3 py-2 text-sm font-semibold text-navy-700">
              Back to developer dashboard
            </Link>
          </div>
          {error && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {error}
            </p>
          )}
        </div>

        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
          <h2 className="font-fraunces text-2xl font-bold text-navy-700">Affiliate Requests</h2>
          <p className="mt-1 text-xs text-[#7A7490]">{requests.length} pending requests</p>
          <div className="mt-4 space-y-4">
            {requests.map((request) => {
              const draft = getReviewDraft(request.id);
              return (
                <div key={request.id} className="rounded-xl border border-[#E8E4DC] p-4">
                  <p className="text-sm font-semibold text-[#1C1C2E]">{request.schoolName}</p>
                  <p className="text-xs text-[#6A6482]">
                    Contact: {request.contactName} | {request.contactPhone}{request.contactEmail ? ` | ${request.contactEmail}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-[#6A6482]">
                    {request.city || '-'}, {request.state || '-'} | Board: {request.board || '-'} | Affiliation: {request.affiliateNo || '-'}
                  </p>
                  {request.notes && <p className="mt-2 text-xs text-[#5A5572]">Notes: {request.notes}</p>}
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <input
                      value={draft.schoolCode}
                      onChange={(event) => setReviewState((prev) => ({ ...prev, [request.id]: { ...getReviewDraft(request.id), schoolCode: event.target.value } }))}
                      placeholder="School code override (optional)"
                      className="rounded-lg border border-[#E8E4DC] px-2.5 py-2 text-xs"
                    />
                    <input
                      value={draft.reviewNotes}
                      onChange={(event) => setReviewState((prev) => ({ ...prev, [request.id]: { ...getReviewDraft(request.id), reviewNotes: event.target.value } }))}
                      placeholder="Review notes"
                      className="rounded-lg border border-[#E8E4DC] px-2.5 py-2 text-xs md:col-span-2"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => reviewRequest(request.id, 'approve')}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => reviewRequest(request.id, 'reject')}
                      className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
            {requests.length === 0 && (
              <p className="rounded-lg border border-[#E8E4DC] bg-[#FAF8F3] px-3 py-2 text-sm text-[#6A6482]">
                No pending affiliate requests.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
          <h2 className="font-fraunces text-2xl font-bold text-navy-700">Provision School Admin (Developer Only)</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <select
              value={adminForm.schoolId}
              onChange={(event) => setAdminForm((prev) => ({ ...prev, schoolId: event.target.value }))}
              className="rounded-lg border border-[#E8E4DC] px-2.5 py-2 text-sm"
            >
              <option value="">Select school</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.schoolName} ({school.schoolCode})
                </option>
              ))}
            </select>
            <input
              value={adminForm.name}
              onChange={(event) => setAdminForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Admin full name *"
              className="rounded-lg border border-[#E8E4DC] px-2.5 py-2 text-sm"
            />
            <input
              value={adminForm.adminIdentifier}
              onChange={(event) => setAdminForm((prev) => ({ ...prev, adminIdentifier: event.target.value }))}
              placeholder="Admin identifier (optional)"
              className="rounded-lg border border-[#E8E4DC] px-2.5 py-2 text-sm"
            />
            <input
              value={adminForm.phone}
              onChange={(event) => setAdminForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="Admin phone"
              className="rounded-lg border border-[#E8E4DC] px-2.5 py-2 text-sm"
            />
            <input
              value={adminForm.authEmail}
              onChange={(event) => setAdminForm((prev) => ({ ...prev, authEmail: event.target.value }))}
              placeholder="Admin email (optional)"
              className="rounded-lg border border-[#E8E4DC] px-2.5 py-2 text-sm"
            />
            <input
              value={adminForm.password}
              onChange={(event) => setAdminForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Initial password (optional)"
              className="rounded-lg border border-[#E8E4DC] px-2.5 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={provisionSchoolAdmin}
            className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Processing...' : 'Provision Admin'}
          </button>

          {issuedCredentials && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-semibold">Issued Credentials (show once)</p>
              <p className="mt-1">School: {String(issuedCredentials.schoolName || issuedCredentials.schoolCode || issuedCredentials.schoolId || '-')}</p>
              <p>Login Identifier: {String(issuedCredentials.loginIdentifier || '-')}</p>
              <p>Auth Email: {String(issuedCredentials.authEmail || '-')}</p>
              <p>Password: {String(issuedCredentials.password || '-')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
