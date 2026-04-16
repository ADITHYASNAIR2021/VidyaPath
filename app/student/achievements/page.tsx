'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Badge {
  badgeType: string;
  earnedAt: string;
}

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  totalStudyDays: number;
  lastActive?: string;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function StudentAchievementsPage() {
  const router = useRouter();
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const sessionRes = await fetch('/api/student/session/me', { cache: 'no-store' });
        if (!sessionRes.ok) { router.replace('/student/login'); return; }
        const res = await fetch('/api/student/streaks', { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        if (res.status === 401) { router.replace('/student/login'); return; }
        const data = unwrap<{ streak?: StreakData; badges?: Badge[] } | null>(body);
        if (!res.ok) {
          if (active) setError((body && typeof body === 'object' && 'message' in body ? String((body as Record<string, unknown>).message) : 'Failed to load achievements.'));
          return;
        }
        if (!active) return;
        setStreak(data?.streak ?? null);
        setBadges(Array.isArray(data?.badges) ? data.badges : []);
      } catch {
        if (active) setError('Failed to load achievements.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700">Achievements</h1>
        <p className="mt-1 text-sm text-[#6D6A7C]">Track your streak and milestone badges.</p>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {loading && <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-6 text-sm text-[#8A8AAA]">Loading...</div>}

        {!loading && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5">
                <p className="text-xs uppercase tracking-wide text-[#8A8AAA]">Current Streak</p>
                <p className="mt-2 text-2xl font-bold text-navy-700">{streak?.currentStreak ?? 0} days</p>
              </div>
              <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5">
                <p className="text-xs uppercase tracking-wide text-[#8A8AAA]">Longest Streak</p>
                <p className="mt-2 text-2xl font-bold text-navy-700">{streak?.longestStreak ?? 0} days</p>
              </div>
              <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5">
                <p className="text-xs uppercase tracking-wide text-[#8A8AAA]">Study Days</p>
                <p className="mt-2 text-2xl font-bold text-navy-700">{streak?.totalStudyDays ?? 0}</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-5">
              <h2 className="font-semibold text-navy-700">Badges</h2>
              {badges.length === 0 ? (
                <p className="mt-2 text-sm text-[#8A8AAA]">No badges unlocked yet. Keep studying daily.</p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {badges.map((badge) => (
                    <div key={`${badge.badgeType}-${badge.earnedAt}`} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-sm font-semibold text-amber-900">{badge.badgeType.replace(/-/g, ' ')}</p>
                      <p className="text-xs text-amber-700">Earned {new Date(badge.earnedAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

