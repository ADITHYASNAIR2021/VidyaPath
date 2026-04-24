'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, CheckCircle2, Clock, ChevronDown, ChevronUp, Send } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';
import type { StudentQuestionItem } from '@/lib/school-ops-db';
import type { TeacherScope } from '@/lib/teacher-types';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function StatusBadge({ status }: { status: StudentQuestionItem['status'] }) {
  if (status === 'answered') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Answered
      </span>
    );
  }
  if (status === 'closed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
        Closed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

interface QuestionCardProps {
  item: StudentQuestionItem;
  onAnswered: (id: string, answer: string) => void;
}

function normalizeSubject(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractScopedSubjects(effectiveScopes: unknown): string[] {
  if (!Array.isArray(effectiveScopes)) return [];
  const dedup = new Map<string, string>();
  for (const scope of effectiveScopes as TeacherScope[]) {
    if (!scope?.isActive) continue;
    const subject = normalizeSubject(scope.subject || '');
    if (!subject) continue;
    const key = subject.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, subject);
  }
  return [...dedup.values()].sort((a, b) => a.localeCompare(b));
}

function QuestionCard({ item, onAnswered }: QuestionCardProps) {
  const [expanded, setExpanded] = useState(item.status === 'pending');
  const [draft, setDraft] = useState(item.answer ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submitAnswer() {
    if (!draft.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/teacher/questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: item.id, answer: draft.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.message || 'Failed to save.'); return; }
      onAnswered(item.id, draft.trim());
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={clsx('rounded-2xl border bg-white shadow-sm overflow-hidden', item.status === 'pending' ? 'border-amber-200' : 'border-[#E8E4DC]')}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={item.status} />
            <span className="text-[11px] text-gray-400">{item.subject} · Class {item.classLevel}</span>
            {item.topic && <span className="text-[11px] bg-indigo-50 text-indigo-600 rounded px-1.5 py-0.5">{item.topic}</span>}
          </div>
          <p className="text-sm font-semibold text-gray-800 line-clamp-2">{item.question}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />}
      </button>

      {expanded && (
        <div className="border-t border-[#E8E4DC] px-4 pb-4 pt-3 space-y-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-500 mb-1">Student question</p>
            <p className="text-sm text-gray-800 leading-relaxed">{item.question}</p>
          </div>

          {item.status === 'answered' && item.answer && (
            <div className="bg-emerald-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-700 mb-1">Your answer</p>
              <p className="text-sm text-gray-800 leading-relaxed">{item.answer}</p>
            </div>
          )}

          {item.status !== 'answered' && (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type your answer for the student..."
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 placeholder-gray-400"
              />
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <button
                onClick={submitAnswer}
                disabled={saving || !draft.trim()}
                className="flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors active:scale-95"
              >
                <Send className="h-3.5 w-3.5" />
                {saving ? 'Saving…' : 'Send Answer'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeacherQuestionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState<StudentQuestionItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'answered'>('all');
  const [subjectFilter, setSubjectFilter] = useState('my-subjects');
  const [scopeSubjects, setScopeSubjects] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const questionsUrl = subjectFilter === 'my-subjects'
        ? '/api/teacher/questions'
        : `/api/teacher/questions?subject=${encodeURIComponent(subjectFilter)}`;
      const [sessionRes, qRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch(questionsUrl, { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { setError('Session expired. Please sign in again.'); return; }
      const sessionBody = await sessionRes.json().catch(() => null);
      const sessionData = unwrap<{ effectiveScopes?: TeacherScope[] } | null>(sessionBody);
      setScopeSubjects(extractScopedSubjects(sessionData?.effectiveScopes));

      const body = await qRes.json().catch(() => null);
      if (!qRes.ok) {
        if (qRes.status === 403 && subjectFilter !== 'my-subjects') {
          setError('Selected subject is outside your assigned scope.');
          setItems([]);
          return;
        }
        setError(body?.message || 'Failed to load questions.');
        return;
      }
      setItems(unwrap<StudentQuestionItem[]>(body));
    } catch {
      setError('Failed to load questions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [subjectFilter]);

  function handleAnswered(id: string, answer: string) {
    setItems((prev) => prev.map((q) => q.id === id ? { ...q, answer, status: 'answered', answeredAt: new Date().toISOString() } : q));
  }

  const visible = filter === 'all' ? items : items.filter((q) => q.status === filter);
  const pendingCount = items.filter((q) => q.status === 'pending').length;
  const answeredCount = items.filter((q) => q.status === 'answered').length;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-amber-600" />
            Student Questions
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Review and answer questions from your students.</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50 disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </span>
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="subject-filter" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Subject
        </label>
        <select
          id="subject-filter"
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700"
        >
          <option value="my-subjects">My Subjects</option>
          {scopeSubjects.map((subject) => (
            <option key={subject.toLowerCase()} value={subject}>
              {subject}
            </option>
          ))}
        </select>
      </div>

      {/* Stats */}
      {!loading && items.length > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-gray-800">{items.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-amber-700">{pendingCount}</p>
            <p className="text-xs text-amber-600 mt-0.5">Pending</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-emerald-700">{answeredCount}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Answered</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2">
        {(['all', 'pending', 'answered'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
              filter === f ? 'bg-amber-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            )}
          >
            {f} {f !== 'all' && `(${f === 'pending' ? pendingCount : answeredCount})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading questions…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
          <MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">{filter === 'pending' ? 'No pending questions' : filter === 'answered' ? 'No answered questions' : 'No questions yet'}</p>
          <p className="mt-1 text-sm text-gray-400">Students can ask questions from any chapter page.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <QuestionCard key={item.id} item={item} onAnswered={handleAnswered} />
          ))}
        </div>
      )}
    </div>
  );
}
