'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ALL_CHAPTERS } from '@/lib/data';
import type { TeacherQuestionBankItem, TeacherScope } from '@/lib/teacher-types';
import { HelpCircle, Plus, Trash2, RefreshCw } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

type QuestionKind = 'mcq' | 'short' | 'long';

export default function QuestionBankPage() {
  const searchParams = useSearchParams();
  const preselectedChapter = searchParams.get('chapter') ?? '';
  const [scopes, setScopes] = useState<TeacherScope[]>([]);
  const [chapterId, setChapterId] = useState(preselectedChapter);
  const [items, setItems] = useState<TeacherQuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [kind, setKind] = useState<QuestionKind>('mcq');
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState('');
  const [answerIndex, setAnswerIndex] = useState('0');
  const [marks, setMarks] = useState('1');
  const [rubric, setRubric] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const chapters = useMemo(() => {
    if (scopes.length === 0) return ALL_CHAPTERS;
    return ALL_CHAPTERS.filter((ch) =>
      scopes.some((s) => s.isActive && s.classLevel === ch.classLevel && s.subject === ch.subject)
    );
  }, [scopes]);

  async function loadSession() {
    const res = await fetch('/api/teacher/session/me', { cache: 'no-store' });
    if (!res.ok) { setError('Session expired. Please sign in again.'); return; }
    const body = unwrap<{ effectiveScopes?: TeacherScope[] } | null>(await res.json().catch(() => null));
    setScopes(Array.isArray(body?.effectiveScopes) ? body.effectiveScopes : []);
  }

  async function loadItems(chapId: string) {
    if (!chapId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/teacher/question-bank/item?chapterId=${encodeURIComponent(chapId)}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      const data = unwrap<{ items?: TeacherQuestionBankItem[] } | null>(body);
      setItems(res.ok && data ? (data.items ?? []) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadSession(); }, []);
  useEffect(() => {
    // Only auto-select first chapter if not already set via query param
    if (!chapterId && chapters.length > 0) setChapterId(chapters[0].id);
  }, [chapters]);
  useEffect(() => { void loadItems(chapterId); }, [chapterId]);

  async function createQuestion() {
    if (!chapterId || !prompt.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/teacher/question-bank/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId,
          kind,
          prompt: prompt.trim(),
          options: kind === 'mcq' ? options.split('\n').map((x) => x.trim()).filter(Boolean) : undefined,
          answerIndex: kind === 'mcq' ? Number(answerIndex) : undefined,
          maxMarks: Number(marks),
          rubric: rubric || undefined,
          imageUrl: imageUrl || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.message ?? 'Failed to create question.'); return; }
      setPrompt(''); setOptions(''); setRubric(''); setImageUrl(''); setMarks('1'); setAnswerIndex('0');
      setShowForm(false);
      await loadItems(chapterId);
    } catch {
      setError('Failed to create question.');
    } finally {
      setCreating(false);
    }
  }

  async function deleteQuestion(itemId: string) {
    try {
      const res = await fetch(`/api/teacher/question-bank/item/${itemId}`, { method: 'DELETE' });
      if (!res.ok) return;
      await loadItems(chapterId);
    } catch {
      // no-op
    }
  }

  const kindCounts = { mcq: items.filter((i) => i.kind === 'mcq').length, short: items.filter((i) => i.kind === 'short').length, long: items.filter((i) => i.kind === 'long').length };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-amber-600" /> Question Bank
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Build a reusable library of questions for your chapters.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors">
          <Plus className="w-4 h-4" /> Add Question
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="flex gap-4 mb-5 flex-wrap">
        <div className="flex-1 min-w-48">
          <label className="text-xs font-medium text-gray-600 block mb-1">Chapter</label>
          <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
            {chapters.map((ch) => <option key={ch.id} value={ch.id}>Class {ch.classLevel} — {ch.subject} — {ch.title}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          {(['mcq', 'short', 'long'] as const).map((k) => (
            <span key={k} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
              {k.toUpperCase()}: {kindCounts[k]}
            </span>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-4">
          <h2 className="font-semibold text-amber-800">New Question</h2>
          <div className="flex gap-2">
            {(['mcq', 'short', 'long'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors', kind === k ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')}>
                {k === 'mcq' ? 'MCQ' : k === 'short' ? 'Short Answer' : 'Long Answer'}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Question Prompt</label>
            <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Write the question…" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm resize-none" />
          </div>
          {kind === 'mcq' && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Options (one per line)</label>
                <textarea rows={4} value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Option A&#10;Option B&#10;Option C&#10;Option D" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm resize-none font-mono text-xs" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Correct Answer Index (0-based)</label>
                <input type="number" min={0} max={9} value={answerIndex} onChange={(e) => setAnswerIndex(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm w-24" />
              </div>
            </>
          )}
          {kind !== 'mcq' && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Marking Rubric (optional)</label>
              <textarea rows={2} value={rubric} onChange={(e) => setRubric(e.target.value)} placeholder="Key points for marking…" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm resize-none" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Max Marks</label>
              <input type="number" min={0.25} step={0.25} value={marks} onChange={(e) => setMarks(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Image URL (optional)</label>
              <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createQuestion} disabled={!prompt.trim() || creating} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
              {creating ? 'Saving…' : 'Add Question'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-32 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading questions…
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <HelpCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No questions yet</p>
          <p className="text-sm mt-1">Add your first question for this chapter.</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={item.id} className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-xs font-bold text-amber-700">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={clsx(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase',
                    item.kind === 'mcq' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    item.kind === 'short' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    'bg-purple-50 text-purple-700 border-purple-200'
                  )}>{item.kind}</span>
                  <span className="text-xs text-gray-400">{item.maxMarks ?? 1} mark{(item.maxMarks ?? 1) !== 1 ? 's' : ''}</span>
                </div>
                <p className="text-sm text-gray-800">{item.prompt}</p>
                {item.kind === 'mcq' && item.options && (
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {item.options.map((opt, j) => (
                      <span key={j} className={clsx('text-xs px-2 py-1 rounded', j === item.answerIndex ? 'bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200' : 'text-gray-500')}>{opt}</span>
                    ))}
                  </div>
                )}
                {item.rubric && <p className="mt-1.5 text-xs text-gray-500 italic">{item.rubric}</p>}
              </div>
              <button onClick={() => deleteQuestion(item.id)} className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
