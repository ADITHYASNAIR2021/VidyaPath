'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';

export default function TeacherLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next')?.trim() || '/teacher';
  const reason = searchParams.get('reason')?.trim() || '';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function login() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/teacher/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ identifier, password, schoolCode: schoolCode.trim() || undefined }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.message || data?.error || data?.hint || 'Login failed.');
        return;
      }
      router.replace(nextPath);
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
          <KeyRound className="w-5 h-5 text-saffron-500" />
          Teacher Login
        </h1>
        <p className="text-sm text-[#5F5A73] mt-2">Sign in with your teacher phone/staff code and key/PIN.</p>
        {reason === 'auth-required' && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            Teacher login is required to access that page.
          </p>
        )}

        <div className="space-y-3 mt-5">
          <input
            value={schoolCode}
            onChange={(event) => setSchoolCode(event.target.value)}
            placeholder="School code (recommended)"
            className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
          />
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="Phone or staff code"
            className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Key / PIN"
            type="password"
            className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
          />
          <button
            onClick={login}
            disabled={loading}
            className="w-full bg-saffron-500 hover:bg-saffron-600 text-white font-semibold text-sm px-4 py-2.5 rounded-xl disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        <p className="mt-2 text-[11px] text-[#7A7490]">
          Tip: use school code for exact identity matching when multiple schools exist.
        </p>
        <p className="mt-4 text-xs text-[#7A7490]">
          Admin access: <Link href="/admin/login" className="font-semibold text-indigo-700 hover:text-indigo-800">/admin/login</Link>
        </p>
      </div>
    </div>
  );
}
