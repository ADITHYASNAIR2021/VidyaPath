'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock } from 'lucide-react';

export default function TeacherFirstLoginPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/teacher/session/me', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          router.replace('/teacher/login?reason=auth-required');
          return;
        }
        const payload = await response.json().catch(() => null);
        const data = payload?.data && typeof payload.data === 'object'
          ? payload.data as Record<string, unknown>
          : null;
        const teacher = data?.teacher && typeof data.teacher === 'object'
          ? data.teacher as Record<string, unknown>
          : null;
        if (!teacher || teacher.mustChangePassword !== true) {
          router.replace('/teacher');
          return;
        }
      })
      .catch(() => {
        router.replace('/teacher/login?reason=auth-required');
      })
      .finally(() => {
        if (active) setBootLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function submitPasswordChange() {
    setError('');
    setSuccess('');
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setError('All password fields are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/password/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to update password.');
        return;
      }
      setSuccess('Password updated. Please login again with your new password.');
      setTimeout(() => {
        router.replace('/teacher/login?reason=password-updated&force=1');
      }, 700);
    } catch {
      setError('Password update failed. Please retry.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-14 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <Lock className="w-5 h-5 text-saffron-500" />
          Secure Your Account
        </h1>
        <p className="mt-2 text-sm text-[#5F5A73]">
          This is your first login. Set a new password to continue.
        </p>

        {bootLoading ? (
          <p className="mt-4 text-sm text-[#5F5A73]">Checking session...</p>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="relative">
              <input
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                type={showCurrent ? 'text' : 'password'}
                placeholder="Current password (your email address)"
                className="w-full rounded-xl border border-[#E8E4DC] px-3 py-2.5 pr-11 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((value) => !value)}
                className="absolute inset-y-0 right-0 px-3 text-[#6A6580] hover:text-[#373347]"
                aria-label={showCurrent ? 'Hide password' : 'Show password'}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="relative">
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type={showNew ? 'text' : 'password'}
                placeholder="New password"
                className="w-full rounded-xl border border-[#E8E4DC] px-3 py-2.5 pr-11 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowNew((value) => !value)}
                className="absolute inset-y-0 right-0 px-3 text-[#6A6580] hover:text-[#373347]"
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="relative">
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type={showConfirm ? 'text' : 'password'}
                placeholder="Confirm new password"
                className="w-full rounded-xl border border-[#E8E4DC] px-3 py-2.5 pr-11 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((value) => !value)}
                className="absolute inset-y-0 right-0 px-3 text-[#6A6580] hover:text-[#373347]"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-[#7A7490]">
              Password must be 6-18 chars and include uppercase, lowercase, number, and special symbol.
            </p>
            <button
              onClick={submitPasswordChange}
              disabled={loading}
              className="w-full rounded-xl bg-saffron-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-saffron-600 disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        {success && <p className="mt-3 text-sm text-emerald-700">{success}</p>}
        <p className="mt-4 text-xs text-[#7A7490]">
          Home: <Link href="/" className="font-semibold text-indigo-700 hover:text-indigo-800">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
