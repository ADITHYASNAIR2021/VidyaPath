'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';
import type { StudentQuestionItem } from '@/lib/school-ops-db';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function StudentQuestionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState<StudentQuestionItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, qRes] = await Promise.all([
        fetch('/api/student/session/me', { cache: 'no-store' }),
        fetch('/api/student/questions', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { setError('Session expired. Please sign in again.'); return; }
      const body = await qRes.json().catch(() => null);
      if (!qRes.ok) { setError(body?.message || 'Failed to load questions.'); return; }
      setItems(unwrap<StudentQuestionItem[]>(body));
    } catch {
      setError('Failed to load questions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const pendingCount = items.filter((q) => q.status === 'pending').length;
  const answeredCount = items.filter((q) => q.status === 'answered').length;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-indigo-600" />
            My Questions
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Questions you&apos;ve asked your teachers across all chapters.</p>
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

      {!loading && items.length > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-gray-800">{items.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total Asked</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-amber-700">{pendingCount}</p>
            <p className="text-xs text-amber-600 mt-0.5">Awaiting Answer</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-emerald-700">{answeredCount}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Answered</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
          <MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">No questions yet</p>
          <p className="mt-1 text-sm text-gray-400">Ask your teacher from any chapter page using the &ldquo;Ask Your Teacher&rdquo; button.</p>
          <Link href="/chapters" className="mt-3 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            Browse chapters →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={clsx(
                'rounded-2xl border bg-white shadow-sm overflow-hidden',
                item.status === 'answered' ? 'border-emerald-200' : 'border-amber-200'
              )}
            >
              <button
                onClick={() => setExpanded((e) => e === item.id ? null : item.id)}
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className={clsx('mt-0.5 flex-shrink-0 rounded-full p-1', item.status === 'answered' ? 'bg-emerald-100' : 'bg-amber-100')}>
                  {item.status === 'answered'
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : <Clock className="h-4 w-4 text-amber-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={clsx('text-[10px] font-semibold rounded-full px-2 py-0.5', item.status === 'answered' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                      {item.status === 'answered' ? 'Answered' : 'Pending'}
                    </span>
                    <span className="text-[11px] text-gray-400">{item.subject} · Class {item.classLevel}</span>
                    {item.topic && <span className="text-[11px] bg-indigo-50 text-indigo-600 rounded px-1.5 py-0.5">{item.topic}</span>}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 line-clamp-2">{item.question}</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {item.answeredAt && ` · Answered ${new Date(item.answeredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                  </p>
                </div>
              </button>

              {expanded === item.id && (
                <div className="border-t border-[#E8E4DC] px-4 pb-4 pt-3 space-y-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Your question</p>
                    <p className="text-sm text-gray-800 leading-relaxed">{item.question}</p>
                  </div>
                  {item.answer ? (
                    <div className="bg-emerald-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-emerald-700 mb-1">Teacher&apos;s answer</p>
                      <p className="text-sm text-gray-800 leading-relaxed">{item.answer}</p>
                    </div>
                  ) : (
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-amber-700">Your teacher hasn&apos;t answered yet. Check back soon.</p>
                    </div>
                  )}
                  <Link
                    href={`/chapters/${item.chapterId}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Go to chapter →
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
