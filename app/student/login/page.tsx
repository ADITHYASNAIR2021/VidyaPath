'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, UserRound } from 'lucide-react';

export default function StudentLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next')?.trim() || '/dashboard';
  const reason = searchParams.get('reason')?.trim() || '';

  const [roll, setRoll] = useState('');
  const [key, setKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function login() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/student/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          roll,
          password: key,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.message || data?.error || data?.hint || 'Student login failed.');
        return;
      }
      const session = data?.data && typeof data.data === 'object'
        ? data.data as Record<string, unknown>
        : data as Record<string, unknown>;
      if (session.mustChangePassword === true) {
        router.replace('/student/first-login');
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
        <p className="text-sm text-[#5F5A73] mt-2">Enter your student ID and password.</p>
        {reason === 'auth-required' && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            Student login is required before starting practice/exam mode.
          </p>
        )}
        {reason === 'password-updated' && (
          <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
            Password updated successfully. Please login with your new password.
          </p>
        )}

        <div className="space-y-3 mt-5">
          <input
            value={roll}
            onChange={(event) => setRoll(event.target.value)}
            placeholder="Student ID (e.g. APS.STU.10.A.2600001)"
            className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
          />
          <div className="relative">
            <input
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Password"
              type={showPassword ? 'text' : 'password'}
              className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 px-3 text-[#6A6580] hover:text-[#373347]"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
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
        <p className="mt-1 text-xs text-[#7A7490]">
          Home: <Link href="/" className="font-semibold text-indigo-700 hover:text-indigo-800">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
