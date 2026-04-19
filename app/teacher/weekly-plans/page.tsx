'use client';

import { useEffect, useMemo, useState } from 'react';
import { ALL_CHAPTERS } from '@/lib/data';
import type { TeacherScope, TeacherWeeklyPlan } from '@/lib/teacher-types';
import { CalendarDays, Plus, RefreshCw, Archive, AlertCircle, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

const CLASS_LEVELS = [10, 12] as const;

export default function WeeklyPlansPage() {
  const [scopes, setScopes] = useState<TeacherScope[]>([]);
  const [plans, setPlans] = useState<TeacherWeeklyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formClassLevel, setFormClassLevel] = useState<10 | 12>(10);
  const [formChapterIds, setFormChapterIds] = useState<string[]>([]);
  const [formWeekCount, setFormWeekCount] = useState(4);
  const [formDueDate, setFormDueDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Expand plan
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const chapters = useMemo(() => {
    const filtered = scopes.length === 0
      ? ALL_CHAPTERS
      : ALL_CHAPTERS.filter((ch) =>
          scopes.some((s) => s.isActive && s.classLevel === ch.classLevel && s.subject === ch.subject)
        );
    return filtered.filter((ch) => ch.classLevel === formClassLevel);
  }, [scopes, formClassLevel]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, plansRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher/weekly-plans', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { setError('Session expired. Please sign in again.'); return; }
      const sessionData = unwrap<{ effectiveScopes?: TeacherScope[] } | null>(await sessionRes.json().catch(() => null));
      setScopes(Array.isArray(sessionData?.effectiveScopes) ? sessionData.effectiveScopes : []);

      if (plansRes.ok) {
        const plansData = unwrap<{ plans?: TeacherWeeklyPlan[] } | null>(await plansRes.json().catch(() => null));
        setPlans(Array.isArray(plansData?.plans) ? plansData.plans : []);
      }
    } catch {
      setError('Failed to load weekly plans.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function toggleChapter(id: string) {
    setFormChapterIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  }

  async function createPlan() {
    if (!formTitle.trim() || formChapterIds.length === 0) {
      setCreateError('Title and at least one chapter are required.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      // Build placeholder weeks
      const planWeeks = Array.from({ length: formWeekCount }, (_, i) => ({
        week: i + 1,
        focusChapters: formChapterIds,
        tasks: [`Week ${i + 1} teaching plan`],
        targetMarks: 0,
      }));

      const res = await fetch('/api/teacher/weekly-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle.trim(),
          classPreset: 'standard',
          classLevel: formClassLevel,
          focusChapterIds: formChapterIds,
          planWeeks,
          dueDate: formDueDate || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setCreateError(data?.message ?? 'Failed to create plan.'); return; }
      const plan = unwrap<{ plan?: TeacherWeeklyPlan } | null>(data);
      if (plan?.plan) setPlans((prev) => [plan.plan!, ...prev]);
      setShowCreate(false);
      setFormTitle('');
      setFormChapterIds([]);
      setFormDueDate('');
      setFormWeekCount(4);
    } catch {
      setCreateError('Failed to create. Check your connection.');
    } finally {
      setCreating(false);
    }
  }

  async function archivePlan(planId: string) {
    setArchivingId(planId);
    try {
      const res = await fetch(`/api/teacher/weekly-plans/${planId}`, { method: 'PATCH' });
      if (res.ok) {
        setPlans((prev) => prev.filter((p) => p.planId !== planId));
        if (expandedPlanId === planId) setExpandedPlanId(null);
      }
    } catch { /* ignore */ } finally {
      setArchivingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-amber-600" /> Weekly Plans
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Create and manage classroom weekly plans.</p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Plan
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-bold text-amber-800 mb-4">New Weekly Plan</h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Plan Title</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Term 2 — Physics Schedule"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Class Level</label>
                <div className="flex gap-2">
                  {CLASS_LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => { setFormClassLevel(lvl); setFormChapterIds([]); }}
                      className={clsx(
                        'flex-1 py-2 rounded-xl border text-sm font-semibold transition-colors',
                        formClassLevel === lvl ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-gray-200 text-gray-700'
                      )}
                    >
                      Class {lvl}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Weeks</label>
                <input
                  type="number"
                  min={1} max={16}
                  value={formWeekCount}
                  onChange={(e) => setFormWeekCount(Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Due Date (optional)</label>
                <input
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-2">
                Focus Chapters <span className="text-gray-400 font-normal">({formChapterIds.length} selected)</span>
              </label>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
                {chapters.length === 0 ? (
                  <p className="text-xs text-gray-400 p-3">No chapters for Class {formClassLevel} in your scope.</p>
                ) : chapters.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => toggleChapter(ch.id)}
                    className={clsx(
                      'w-full text-left px-3 py-2 flex items-center gap-2 transition-colors text-sm',
                      formChapterIds.includes(ch.id) ? 'bg-amber-50 text-amber-800' : 'hover:bg-gray-50 text-gray-700'
                    )}
                  >
                    <span className={clsx(
                      'w-4 h-4 rounded border shrink-0 flex items-center justify-center',
                      formChapterIds.includes(ch.id) ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                    )}>
                      {formChapterIds.includes(ch.id) && <span className="text-white text-[10px] font-bold">✓</span>}
                    </span>
                    <span>{ch.title}</span>
                    <span className="text-xs text-gray-400 ml-auto">{ch.subject}</span>
                  </button>
                ))}
              </div>
            </div>

            {createError && (
              <p className="text-sm text-rose-600">{createError}</p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={createPlan}
                disabled={creating}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
              >
                {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {creating ? 'Creating…' : 'Create Plan'}
              </button>
              <button onClick={() => setShowCreate(false)} className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plans list */}
      {plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center py-16 text-gray-400">
          <CalendarDays className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium">No active weekly plans.</p>
          <p className="text-xs mt-1">Create your first plan to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const isExpanded = expandedPlanId === plan.planId;
            const chapterNames = plan.focusChapterIds
              .map((id) => ALL_CHAPTERS.find((c) => c.id === id)?.title ?? id)
              .slice(0, 3);
            return (
              <div key={plan.planId} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800 text-sm truncate">{plan.title}</h3>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-400">Class {plan.classLevel}</span>
                      <span className="text-xs text-gray-400">{plan.planWeeks.length} weeks</span>
                      {plan.dueDate && <span className="text-xs text-gray-400">Due {plan.dueDate}</span>}
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <BookOpen className="w-3 h-3" />
                        {chapterNames.join(', ')}
                        {plan.focusChapterIds.length > 3 && ` +${plan.focusChapterIds.length - 3}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <button
                      onClick={() => archivePlan(plan.planId)}
                      disabled={archivingId === plan.planId}
                      title="Archive plan"
                      className="p-2 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-50"
                    >
                      {archivingId === plan.planId
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        : <Archive className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setExpandedPlanId(isExpanded ? null : plan.planId)}
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                    <div className="grid gap-2">
                      {plan.planWeeks.map((week) => (
                        <div key={week.week} className="rounded-xl bg-white border border-gray-200 px-4 py-3">
                          <p className="text-xs font-bold text-amber-700 mb-1">Week {week.week}</p>
                          <ul className="space-y-0.5">
                            {week.tasks.map((task, ti) => (
                              <li key={ti} className="text-xs text-gray-600">• {task}</li>
                            ))}
                          </ul>
                          {week.miniTests && week.miniTests.length > 0 && (
                            <p className="text-xs text-violet-600 mt-1.5">Mini-tests: {week.miniTests.join(', ')}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
