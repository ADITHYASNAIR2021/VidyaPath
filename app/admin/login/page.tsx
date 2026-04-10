'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next')?.trim() || '/admin';
  const bootstrapKey = searchParams.get('key')?.trim() || '';
  const reason = searchParams.get('reason')?.trim() || '';

  const [key, setKey] = useState(bootstrapKey);
  const [schoolCode, setSchoolCode] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function login() {
    setLoading(true);
    setError('');
    try {
      const candidateKey = key.trim() || bootstrapKey;
      const response = await fetch('/api/admin/session/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          candidateKey
            ? { key: candidateKey }
            : { schoolCode, identifier, password }
        ),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || data?.message || 'Invalid admin key.');
        return;
      }
      const role = data?.role || data?.data?.role;
      const redirectTo = role === 'developer' ? '/developer' : nextPath;
      router.replace(redirectTo);
    } catch {
      setError('Failed to login.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-14">
      <div className="max-w-md mx-auto bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-6">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          Admin Access
        </h1>
        <p className="text-sm text-[#5F5A73] mt-2">Sign in with school admin credentials, or use bootstrap key for emergency access.</p>
        {reason === 'auth-required' && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            Admin login is required to access that page.
          </p>
        )}
        {reason === 'developer-required' && (
          <p className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-800">
            Developer privileges are required for this page.
          </p>
        )}
        <input
          value={schoolCode}
          onChange={(event) => setSchoolCode(event.target.value)}
          placeholder="School code (e.g. VIDYAPATH-001)"
          className="w-full mt-4 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
        />
        <input
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="Admin ID or phone"
          className="w-full mt-3 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
        />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          type="password"
          className="w-full mt-3 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
        />
        <p className="mt-3 text-[11px] text-[#7A7490]">Or enter bootstrap key below (optional fallback).</p>
        <input
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="Admin secret key"
          type="password"
          className="w-full mt-4 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
        />
        <button
          onClick={login}
          disabled={loading}
          className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl disabled:opacity-50"
        >
          {loading ? 'Authorizing...' : 'Login'}
        </button>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
