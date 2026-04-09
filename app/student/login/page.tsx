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

  const [schoolCode, setSchoolCode] = useState('');
  const [classLevel, setClassLevel] = useState<'10' | '12'>('12');
  const [section, setSection] = useState('');
  const [batch, setBatch] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [password, setPassword] = useState('');
  const [legacyRollCode, setLegacyRollCode] = useState('');
  const [legacyPin, setLegacyPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function login() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/student/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          schoolCode && rollNo
            ? {
                schoolCode,
                classLevel: Number(classLevel),
                section: section || undefined,
                batch: batch || undefined,
                rollNo,
                password,
              }
            : { rollCode: legacyRollCode, pin: legacyPin.trim() || undefined }
        ),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Student login failed.');
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
        <p className="text-sm text-[#5F5A73] mt-2">
          Login with school-based roster credentials before assignments/exam mode.
        </p>
        {reason === 'auth-required' && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            Student login is required before starting practice/exam mode.
          </p>
        )}

        <div className="space-y-3 mt-5">
          <input
            value={schoolCode}
            onChange={(event) => setSchoolCode(event.target.value)}
            placeholder="School code"
            className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={classLevel}
              onChange={(event) => setClassLevel(event.target.value === '10' ? '10' : '12')}
              className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 bg-white"
            >
              <option value="10">Class 10</option>
              <option value="12">Class 12</option>
            </select>
            <input
              value={section}
              onChange={(event) => setSection(event.target.value)}
              placeholder="Section"
              className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={batch}
              onChange={(event) => setBatch(event.target.value)}
              placeholder="Batch (optional)"
              className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
            />
            <input
              value={rollNo}
              onChange={(event) => setRollNo(event.target.value)}
              placeholder="Roll no"
              className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
            />
          </div>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
            className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
          />
          <p className="text-[11px] text-[#7A7490]">Legacy fallback (if roster auth is not configured):</p>
          <input
            value={legacyRollCode}
            onChange={(event) => setLegacyRollCode(event.target.value)}
            placeholder="Roll code"
            className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5"
          />
          <input
            value={legacyPin}
            onChange={(event) => setLegacyPin(event.target.value)}
            placeholder="PIN (optional)"
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
