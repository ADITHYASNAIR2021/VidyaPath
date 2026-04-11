'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALL_CHAPTERS } from '@/lib/data';
import type { TeacherScope } from '@/lib/teacher-types';
import { Wand2, Copy, Check, RefreshCw, Sparkles } from 'lucide-react';
import clsx from 'clsx';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

const TOOL_TYPES = [
  { id: 'worksheet',      label: 'Worksheet',      desc: 'Practice worksheet with questions and answers' },
  { id: 'lesson-plan',    label: 'Lesson Plan',    desc: 'Structured lesson plan with objectives and activities' },
  { id: 'question-paper', label: 'Question Paper', desc: 'Formal exam question paper with marks' },
];

const DIFFICULTY_OPTIONS = [
  { id: 'easy',   label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard',   label: 'Hard' },
  { id: 'mixed',  label: 'Mixed' },
];

export default function AIToolsPage() {
  const router = useRouter();
  const [scopes, setScopes] = useState<TeacherScope[]>([]);
  const [toolType, setToolType] = useState<'worksheet' | 'lesson-plan' | 'question-paper'>('worksheet');
  const [chapterId, setChapterId] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState('mixed');
  const [customContext, setCustomContext] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const chapters = useMemo(() => {
    if (scopes.length === 0) return ALL_CHAPTERS;
    return ALL_CHAPTERS.filter((ch) =>
      scopes.some((s) => s.isActive && s.classLevel === ch.classLevel && s.subject === ch.subject)
    );
  }, [scopes]);

  useEffect(() => {
    fetch('/api/teacher/session/me', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) { router.replace('/teacher/login'); return; }
        const body = unwrap<{ effectiveScopes?: TeacherScope[] } | null>(await res.json().catch(() => null));
        setScopes(Array.isArray(body?.effectiveScopes) ? body.effectiveScopes : []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!chapterId && chapters.length > 0) setChapterId(chapters[0].id);
  }, [chapters]);

  async function generate() {
    const chapter = ALL_CHAPTERS.find((c) => c.id === chapterId);
    setLoading(true);
    setError('');
    setResult('');
    try {
      const res = await fetch('/api/teacher/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: toolType,
          chapterId: chapterId || undefined,
          chapterTitle: chapter?.title,
          subject: chapter?.subject,
          classLevel: chapter?.classLevel,
          topics: chapter?.topics ?? [],
          questionCount,
          difficulty,
          customContext: customContext || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      const data = unwrap<{ result?: string } | null>(body);
      if (!res.ok || !data) { setError(body?.message ?? 'Generation failed. Try again.'); return; }
      setResult(data.result ?? '');
    } catch {
      setError('Generation failed. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    await navigator.clipboard.writeText(result).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <Wand2 className="w-6 h-6 text-amber-600" /> AI Tools
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Generate worksheets, lesson plans, and question papers using AI.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Config panel */}
        <div className="space-y-5">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Output Type</label>
            <div className="space-y-2">
              {TOOL_TYPES.map(({ id, label, desc }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setToolType(id as typeof toolType)}
                  className={clsx(
                    'w-full text-left rounded-xl border px-4 py-3 transition-colors',
                    toolType === id ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400' : 'border-gray-200 bg-white hover:bg-gray-50'
                  )}
                >
                  <p className="text-sm font-semibold text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Chapter</label>
            <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="">— Any chapter —</option>
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>Class {ch.classLevel} — {ch.subject} — {ch.title}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Questions</label>
              <input type="number" min={5} max={40} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Difficulty</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                {DIFFICULTY_OPTIONS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Custom Instructions (optional)</label>
            <textarea
              rows={3}
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              placeholder="e.g. Focus on numerical problems, NCERT style, include diagrams…"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm resize-none"
            />
          </div>

          <button
            onClick={generate}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Generating…' : 'Generate'}
          </button>

          {error && <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}
        </div>

        {/* Result panel */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-600">Result</label>
            {result && (
              <button onClick={copyResult} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>
          <div className={clsx(
            'flex-1 min-h-96 rounded-2xl border p-4 text-sm font-mono overflow-auto whitespace-pre-wrap',
            result ? 'bg-white border-gray-200 text-gray-800' : 'bg-gray-50 border-dashed border-gray-300 text-gray-400 flex items-center justify-center'
          )}>
            {result || (
              <div className="text-center">
                <Wand2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Your generated content will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
