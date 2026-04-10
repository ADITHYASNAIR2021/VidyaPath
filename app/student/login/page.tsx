'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { UserRound } from 'lucide-react';

export default function StudentLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next')?.trim() || '/dashboard';
  const reason = searchParams.get('reason')?.trim() || '';

  const [roll, setRoll] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function login() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/student/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roll, password: key }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || data?.message || 'Student login failed.');
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
          <UserRound className="w-5 h-5 text-emerald-600" />
          Student Login
        </h1>
        <p className="text-sm text-[#5F5A73] mt-2">Enter your roll number (or roll code) and key/PIN.</p>
        {reason === 'auth-required' && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            Student login is required before starting practice/exam mode.
          </p>
        )}

        <div className="space-y-3 mt-5">
          <input
            value={roll}
            onChange={(event) => setRoll(event.target.value)}
            placeholder="Roll number or roll code"
            className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
          />
          <input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="Key / PIN"
            type="password"
            className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
          />
          <button
            onClick={login}
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Continue as Student'}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        <p className="mt-4 text-xs text-[#7A7490]">
          Teacher portal: <Link href="/teacher/login" className="font-semibold text-indigo-700 hover:text-indigo-800">/teacher/login</Link>
        </p>
      </div>
    </div>
  );
}
