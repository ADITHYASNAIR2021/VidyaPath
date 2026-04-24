'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, CalendarDays, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import type { TeacherWeeklyPlan } from '@/lib/teacher-types';

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function StudentWeeklyPlansPage() {
  const [plans, setPlans] = useState<TeacherWeeklyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/student/weekly-plans', { cache: 'no-store' });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          body && typeof body === 'object' && 'message' in (body as Record<string, unknown>)
            ? String((body as Record<string, unknown>).message)
            : 'Failed to load weekly plans.';
        setError(message);
        return;
      }
      const data = unwrap<{ weeklyPlans?: TeacherWeeklyPlan[] } | null>(body);
      setPlans(Array.isArray(data?.weeklyPlans) ? data.weeklyPlans : []);
    } catch {
      setError('Failed to load weekly plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-fraunces text-2xl font-bold text-navy-700">Weekly Plans</h1>
            <p className="mt-1 text-sm text-[#6D6A7C]">Read-only class plans shared by your teachers.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-[#E8E4DC] bg-white px-3 py-2 text-sm text-[#6D6A7C] hover:bg-[#F7F3EE] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-[#E8E4DC] bg-white p-6 text-sm text-[#8A8AAA]">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading weekly plans...
          </div>
        )}

        {!loading && !error && plans.length === 0 && (
          <div className="mt-8 rounded-2xl border border-[#E8E4DC] bg-white p-8 text-center text-sm text-[#8A8AAA]">
            No weekly plans available for your class right now.
          </div>
        )}

        {!loading && plans.length > 0 && (
          <div className="mt-6 space-y-3">
            {plans.map((plan) => {
              const expanded = expandedPlanId === plan.planId;
              return (
                <article
                  key={plan.planId}
                  className="overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedPlanId(expanded ? null : plan.planId)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[#FAF8F3]"
                  >
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-semibold text-[#1E1B2E]">{plan.title}</h2>
                      <p className="mt-1 text-xs text-[#8A8AAA]">
                        Class {plan.classLevel}
                        {plan.subject ? ` | ${plan.subject}` : ''}
                        {plan.dueDate ? ` | Due ${plan.dueDate}` : ''}
                      </p>
                    </div>
                    {expanded ? (
                      <ChevronUp className="h-4 w-4 text-[#8A8AAA]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-[#8A8AAA]" />
                    )}
                  </button>

                  {expanded && (
                    <div className="border-t border-[#F0EDE6] bg-[#FAF8F3] px-5 py-4">
                      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#6D6A7C]">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {plan.planWeeks.length} week(s)
                      </div>
                      <div className="space-y-2">
                        {plan.planWeeks.map((week) => (
                          <div key={week.week} className="rounded-xl border border-[#E8E4DC] bg-white px-4 py-3">
                            <p className="text-xs font-semibold text-navy-700">Week {week.week}</p>
                            {week.focusChapters.length > 0 && (
                              <p className="mt-1 text-xs text-[#6D6A7C]">
                                Chapters: {week.focusChapters.join(', ')}
                              </p>
                            )}
                            {week.tasks.length > 0 && (
                              <ul className="mt-2 space-y-1">
                                {week.tasks.map((task, index) => (
                                  <li key={index} className="flex items-start gap-1.5 text-xs text-[#4F4B62]">
                                    <BookOpen className="mt-0.5 h-3 w-3 text-amber-700" />
                                    <span>{task}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
