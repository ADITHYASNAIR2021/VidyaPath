'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ParentLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function login() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/parent/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message || 'Parent login failed.');
        return;
      }
      router.replace('/parent');
    } catch {
      setError('Parent login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-10 md:px-6">
      <div className="mx-auto max-w-md rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700">Parent Portal Login</h1>
        <p className="mt-1 text-sm text-[#6D6A7C]">Use the phone and PIN provided by your school admin.</p>

        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-navy-700">
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Parent phone" />
          </label>
          <label className="block text-sm font-medium text-navy-700">
            PIN
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="4-8 digit PIN" />
          </label>
        </div>

        <button type="button" onClick={login} disabled={loading || !phone.trim() || !pin.trim()} className="mt-5 w-full rounded-xl bg-navy-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50">
          {loading ? 'Logging in...' : 'Login'}
        </button>
        <p className="mt-3 text-xs text-[#7A7490]">
          Home: <Link href="/" className="font-semibold text-indigo-700 hover:text-indigo-800">Back to home</Link>
        </p>
      </div>
    </div>
  );
}

