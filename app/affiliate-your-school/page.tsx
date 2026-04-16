'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function AffiliateYourSchoolPage() {
  const [form, setForm] = useState({
    schoolName: '',
    schoolCodeHint: '',
    board: 'CBSE',
    state: '',
    city: '',
    affiliateNo: '',
    websiteUrl: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submitRequest() {
    setError('');
    setSuccess('');
    const required: Array<[string, string]> = [
      [form.schoolName.trim(), 'School name is required.'],
      [form.state.trim(), 'State is required.'],
      [form.city.trim(), 'City is required.'],
      [form.contactName.trim(), 'Contact name is required.'],
      [form.contactPhone.trim(), 'Contact phone is required.'],
    ];
    for (const [val, msg] of required) {
      if (!val) { setError(msg); return; }
    }
    if (form.contactPhone.trim().replace(/\D/g, '').length < 10) {
      setError('Contact phone must be at least 10 digits.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/affiliate/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.message || payload?.error || 'Failed to submit school affiliation request.');
        return;
      }
      const request = payload?.data?.request ?? payload?.request;
      setSuccess(
        request?.id
          ? `Request submitted successfully. Tracking ID: ${request.id}`
          : 'Request submitted successfully. Developer team will review and contact you.'
      );
      setForm({
        schoolName: '',
        schoolCodeHint: '',
        board: 'CBSE',
        state: '',
        city: '',
        affiliateNo: '',
        websiteUrl: '',
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        notes: '',
      });
    } catch {
      setError('Failed to submit school affiliation request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
        <h1 className="font-fraunces text-3xl font-bold text-navy-700">Affiliate Your School</h1>
        <p className="mt-2 text-sm text-[#5F5A73]">
          Submit your school onboarding request. Developer team reviews each request and approves/rejects it.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            value={form.schoolName}
            onChange={(event) => setForm((prev) => ({ ...prev, schoolName: event.target.value }))}
            placeholder="School name *"
            className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm"
          />
          <input
            value={form.schoolCodeHint}
            onChange={(event) => setForm((prev) => ({ ...prev, schoolCodeHint: event.target.value }))}
            placeholder="Preferred school code (optional)"
            className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm"
          />
          <input
            value={form.board}
            onChange={(event) => setForm((prev) => ({ ...prev, board: event.target.value }))}
            placeholder="Board (CBSE/ISC/State)"
            className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm"
          />
          <input
            value={form.affiliateNo}
            onChange={(event) => setForm((prev) => ({ ...prev, affiliateNo: event.target.value }))}
            placeholder="Affiliation number"
            className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm"
          />
          <input
            value={form.state}
            onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
            placeholder="State *"
            className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm"
          />
          <input
            value={form.city}
            onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
            placeholder="City *"
            className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm"
          />
          <input
            value={form.contactName}
            onChange={(event) => setForm((prev) => ({ ...prev, contactName: event.target.value }))}
            placeholder="Contact person name *"
            className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm"
          />
          <input
            value={form.contactPhone}
            onChange={(event) => setForm((prev) => ({ ...prev, contactPhone: event.target.value }))}
            placeholder="Contact phone *"
            className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm"
          />
          <input
            value={form.contactEmail}
            onChange={(event) => setForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
            placeholder="Contact email"
            className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm md:col-span-2"
          />
          <input
            value={form.websiteUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, websiteUrl: event.target.value }))}
            placeholder="School website URL"
            className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm md:col-span-2"
          />
          <textarea
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            placeholder="Any additional details"
            className="min-h-[120px] rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm md:col-span-2"
          />
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
            {success}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submitRequest}
            disabled={submitting}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? 'Submitting...' : 'Submit Affiliation Request'}
          </button>
          <Link href="/" className="text-sm font-semibold text-indigo-700 hover:text-indigo-800">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
