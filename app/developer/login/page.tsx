'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Terminal } from 'lucide-react';

export default function DeveloperLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next')?.trim() || '/developer';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function login() {
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/developer/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.message || data?.error || 'Invalid credentials.');
        return;
      }
      router.replace(nextPath);
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] flex items-center justify-center px-4 py-14">
      <div className="w-full max-w-sm bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="w-5 h-5 text-indigo-600" />
          <h1 className="font-fraunces text-2xl font-bold text-navy-700">Developer Access</h1>
        </div>
        <p className="text-sm text-[#5F5A73] mb-5">
          Platform-wide console for schools, audits, and observability.
        </p>

        {error && (
          <div
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
            role="alert"
          >
            {error}
          </div>
        )}

        <label className="block text-xs font-semibold text-[#4A4560] mb-1">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && login()}
          placeholder="developer"
          autoComplete="username"
          className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />

        <label className="block text-xs font-semibold text-[#4A4560] mt-3 mb-1">Password</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && login()}
          placeholder="••••••••"
          type="password"
          autoComplete="current-password"
          className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />

        <button
          onClick={login}
          disabled={loading}
          className="mt-5 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition-colors"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
