'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus('success');
        setMessage(data.message || 'Check your email for a reset link.');
      } else {
        setStatus('error');
        setMessage(data.message || 'Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please check your connection and try again.');
    }
  };

  return (
    <main className="min-h-screen bg-[#FDFAF6] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-[#E8E4DC] p-8 shadow-sm">
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 text-center">
            Forgot Password
          </h1>
          <p className="mt-2 text-sm text-gray-500 text-center">
            Enter your email and we&apos;ll send you a reset link.
          </p>

          {status === 'success' ? (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
              {message}
              <div className="mt-4 text-center">
                <Link
                  href="/login"
                  className="text-saffron-600 font-medium hover:underline"
                >
                  Back to login
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {status === 'error' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  {message}
                </div>
              )}

              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="teacher@aps.school"
                  required
                  className="w-full rounded-xl border border-[#E8E4DC] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-saffron-300 focus:border-saffron-400"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Students: contact your school admin to reset your password.
                </p>
              </div>

              <button
                type="submit"
                disabled={status === 'loading' || !identifier.trim()}
                className="w-full rounded-xl bg-saffron-500 px-6 py-3 text-sm font-semibold text-white hover:bg-saffron-600 disabled:opacity-50 transition-colors"
              >
                {status === 'loading' ? 'Sending...' : 'Send Reset Link'}
              </button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-sm text-gray-500 hover:text-saffron-600 underline"
                >
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
