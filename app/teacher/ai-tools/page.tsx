'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALL_CHAPTERS } from '@/lib/data';
import type { TeacherScope } from '@/lib/teacher-types';
import {
  Wand2, Copy, Check, RefreshCw, Sparkles, Download, Printer,
  History, ChevronDown, ChevronUp, Send,
} from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

const TOOL_TYPES = [
  { id: 'worksheet',      label: 'Worksheet',      desc: 'Structured practice worksheet with answer key' },
  { id: 'lesson-plan',    label: 'Lesson Plan',    desc: '45-min lesson plan with activities & CBSE alignment' },
  { id: 'question-paper', label: 'Question Paper', desc: 'Board-format question paper with sections & marks' },
] as const;

type ToolId = typeof TOOL_TYPES[number]['id'];

const DIFFICULTY_OPTIONS = [
  { id: 'easy',   label: 'Foundation',  color: 'text-emerald-600' },
  { id: 'medium', label: 'Standard',    color: 'text-amber-600' },
  { id: 'hard',   label: 'Advanced',    color: 'text-rose-600' },
  { id: 'mixed',  label: 'Mixed',       color: 'text-violet-600' },
];

interface HistoryEntry {
  id: string;
  toolType: ToolId;
  chapterTitle: string;
  subject: string;
  difficulty?: string;
  result: string;
  generatedAt: string;
}

const HISTORY_KEY = 'vidyapath_ai_tools_history';
const MAX_HISTORY = 10;

function loadLocalHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch { return []; }
}

function saveLocalHistory(entry: HistoryEntry) {
  try {
    const existing = loadLocalHistory().filter((e) => e.id !== entry.id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...existing].slice(0, MAX_HISTORY)));
  } catch { /* ignore */ }
}

async function fetchApiHistory(): Promise<HistoryEntry[] | null> {
  try {
    const res = await fetch('/api/teacher/ai-history', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const entries = body?.data?.entries;
    return Array.isArray(entries) ? entries as HistoryEntry[] : null;
  } catch { return null; }
}

async function postApiHistory(entry: HistoryEntry & { chapterId?: string }): Promise<void> {
  try {
    await fetch('/api/teacher/ai-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolType: entry.toolType,
        chapterTitle: entry.chapterTitle,
        subject: entry.subject,
        chapterId: entry.chapterId,
        difficulty: entry.difficulty ?? 'mixed',
        result: entry.result,
      }),
    });
  } catch { /* fire-and-forget */ }
}

/* ── Plain-text renderer: converts structure into readable HTML-like sections */
function ContentRenderer({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={i} className="h-2" />);
      return;
    }

    // ALL CAPS section headers (e.g. "SECTION A — ...", "LEARNING OBJECTIVES")
    const isHeader = /^[A-Z][A-Z\s\-—|()0-9]+$/.test(trimmed) && trimmed.length > 3;
    if (isHeader) {
      elements.push(
        <h3 key={i} className="text-sm font-bold text-navy-700 uppercase tracking-wide mt-4 mb-1 pb-1 border-b border-gray-200">
          {trimmed}
        </h3>
      );
      return;
    }

    // Numbered questions (Q1. / 1. / Q1:)
    if (/^(Q\d+[\.\):]|\d+[\.\)])\s/.test(trimmed)) {
      elements.push(
        <p key={i} className="text-sm text-gray-800 font-medium mt-2">
          {trimmed}
        </p>
      );
      return;
    }

    // Options a) b) c) d) or sub-items
    if (/^[a-d][\)\.]/.test(trimmed)) {
      elements.push(
        <p key={i} className="text-sm text-gray-600 ml-4">
          {trimmed}
        </p>
      );
      return;
    }

    // Numbered list items
    if (/^\d+\.\s/.test(trimmed)) {
      elements.push(
        <p key={i} className="text-sm text-gray-700 ml-2 mt-1">
          {trimmed}
        </p>
      );
      return;
    }

    // Bullet points
    if (/^[-•]\s/.test(trimmed)) {
      elements.push(
        <p key={i} className="text-sm text-gray-600 ml-4">
          {'• '}{trimmed.slice(2)}
        </p>
      );
      return;
    }

    // Default paragraph
    elements.push(
      <p key={i} className="text-sm text-gray-700 leading-relaxed">
        {trimmed}
      </p>
    );
  });

  return <div className="space-y-0.5">{elements}</div>;
}

/* ── Main page ─────────────────────────────────────────────────────────── */
export default function AIToolsPage() {
  const router = useRouter();
  const [scopes, setScopes] = useState<TeacherScope[]>([]);
  const [toolType, setToolType] = useState<ToolId>('worksheet');
  const [chapterId, setChapterId] = useState('');
  const [questionCount, setQuestionCount] = useState(15);
  const [difficulty, setDifficulty] = useState('mixed');
  const [customContext, setCustomContext] = useState('');
  const [tweakInput, setTweakInput] = useState('');
  const [result, setResult] = useState('');
  const [resultMeta, setResultMeta] = useState<{ chapterTitle: string; subject: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'raw'>('preview');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

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
    // Load history from API; fall back to localStorage if unavailable
    fetchApiHistory().then((entries) => {
      if (entries && entries.length > 0) {
        setHistory(entries);
      } else {
        setHistory(loadLocalHistory());
      }
    });
  }, []);

  useEffect(() => {
    if (!chapterId && chapters.length > 0) setChapterId(chapters[0].id);
  }, [chapters]);

  async function generate(tweakContext?: string) {
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
          customContext: tweakContext ?? (customContext || undefined),
        }),
      });
      const body = await res.json().catch(() => null);
      const data = unwrap<{ result?: string; chapterTitle?: string; subject?: string } | null>(body);
      if (!res.ok || !data) { setError(body?.message ?? 'Generation failed. Try again.'); return; }
      const text = data.result ?? '';
      setResult(text);
      setResultMeta({ chapterTitle: data.chapterTitle ?? chapter?.title ?? '', subject: data.subject ?? chapter?.subject ?? '' });
      setActiveTab('preview');
      setTweakInput('');

      // Save to history (API + localStorage fallback)
      const entry: HistoryEntry = {
        id: `${Date.now()}`,
        toolType,
        chapterTitle: data.chapterTitle ?? chapter?.title ?? chapterId,
        subject: data.subject ?? chapter?.subject ?? '',
        difficulty,
        result: text,
        generatedAt: new Date().toISOString(),
      };
      saveLocalHistory(entry);
      postApiHistory({ ...entry, chapterId });
      setHistory((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, MAX_HISTORY));
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

  function downloadResult() {
    if (!result) return;
    const chapter = ALL_CHAPTERS.find((c) => c.id === chapterId);
    const filename = `${toolType}-${chapter?.title ?? chapterId}-${new Date().toISOString().slice(0, 10)}.txt`;
    const blob = new Blob([result], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function printResult() {
    if (!printRef.current) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Print</title><style>
      body { font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6; padding: 24px; }
      h3 { font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 20px; }
    </style></head><body>`);
    w.document.write(printRef.current.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  }

  function restoreHistory(entry: HistoryEntry) {
    setResult(entry.result);
    setResultMeta({ chapterTitle: entry.chapterTitle, subject: entry.subject });
    setToolType(entry.toolType);
    setActiveTab('preview');
    setShowHistory(false);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-amber-600" /> AI Tools
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Generate CBSE-quality teaching materials in seconds.</p>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 border border-gray-200 bg-white px-3 py-2 rounded-xl hover:bg-gray-50"
          >
            <History className="w-3.5 h-3.5" />
            History ({history.length})
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* History dropdown */}
      {showHistory && history.length > 0 && (
        <div className="mb-5 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Recent Generations
          </div>
          <div className="divide-y divide-gray-100">
            {history.map((entry) => (
              <button
                key={entry.id}
                onClick={() => restoreHistory(entry)}
                className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-amber-700 capitalize">{entry.toolType.replace('-', ' ')}</span>
                    <span className="mx-1.5 text-gray-300">·</span>
                    <span className="text-xs text-gray-700">{entry.chapterTitle}</span>
                    <span className="mx-1.5 text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{entry.subject}</span>
                  </div>
                  <span className="text-[11px] text-gray-400 shrink-0">{new Date(entry.generatedAt).toLocaleString()}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        {/* ── Config panel (2/5) ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Tool type */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Output Type</label>
            <div className="space-y-2">
              {TOOL_TYPES.map(({ id, label, desc }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setToolType(id)}
                  className={clsx(
                    'w-full text-left rounded-xl border px-4 py-3 transition-colors',
                    toolType === id ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-300' : 'border-gray-200 bg-white hover:bg-gray-50'
                  )}
                >
                  <p className="text-sm font-semibold text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Chapter */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Chapter</label>
            <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="">— Any chapter —</option>
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>Class {ch.classLevel} — {ch.subject} — {ch.title}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Question count / marks */}
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                {toolType === 'question-paper' ? 'Total Marks' : 'Questions'}
              </label>
              <input type="number" min={5} max={50} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
            {/* Difficulty */}
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Difficulty</label>
              <div className="grid grid-cols-2 gap-1">
                {DIFFICULTY_OPTIONS.map(({ id, label, color }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDifficulty(id)}
                    className={clsx(
                      'rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors',
                      difficulty === id ? 'bg-amber-600 text-white border-amber-600' : `border-gray-200 bg-white ${color} hover:bg-gray-50`
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Custom instructions */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Custom Instructions (optional)</label>
            <textarea
              rows={3}
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              placeholder="e.g. Focus on numerical problems, include case-study, NCERT examples only…"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm resize-none"
            />
          </div>

          <button
            onClick={() => generate()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Generating…' : 'Generate'}
          </button>

          {error && <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

          {/* Regenerate with tweaks */}
          {result && !loading && (
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Regenerate with tweaks</label>
              <div className="flex gap-2">
                <input
                  value={tweakInput}
                  onChange={(e) => setTweakInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && tweakInput.trim()) generate(tweakInput.trim()); }}
                  placeholder="e.g. More numerical questions, simpler language…"
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs"
                />
                <button
                  onClick={() => generate(tweakInput.trim() || undefined)}
                  disabled={loading}
                  className="px-3 py-2 rounded-xl bg-amber-600 text-white disabled:opacity-50 hover:bg-amber-700"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Result panel (3/5) ─────────────────────────────────────── */}
        <div className="lg:col-span-3 flex flex-col min-h-[520px]">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-2">
            {/* Tabs */}
            <div className="flex gap-1">
              {(['preview', 'raw'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                    activeTab === tab ? 'bg-amber-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
              {resultMeta && (
                <span className="ml-2 text-xs text-gray-400 self-center">
                  {resultMeta.chapterTitle} · {resultMeta.subject}
                </span>
              )}
            </div>
            {/* Actions */}
            {result && (
              <div className="flex items-center gap-1.5">
                <button onClick={copyResult} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button onClick={downloadResult} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg transition-colors">
                  <Download className="w-3.5 h-3.5" /> .txt
                </button>
                <button onClick={printResult} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg transition-colors">
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
              </div>
            )}
          </div>

          {/* Content area */}
          <div className={clsx(
            'flex-1 rounded-2xl border overflow-auto',
            result ? 'bg-white border-gray-200' : 'bg-gray-50 border-dashed border-gray-300'
          )}>
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-400 min-h-80">
                <div className="text-center">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-400" />
                  <p className="text-sm">Generating {TOOL_TYPES.find((t) => t.id === toolType)?.label}…</p>
                  <p className="text-xs text-gray-400 mt-1">This takes 10–20 seconds</p>
                </div>
              </div>
            ) : result ? (
              activeTab === 'preview' ? (
                <div ref={printRef} className="p-5">
                  <ContentRenderer text={result} />
                </div>
              ) : (
                <pre className="p-5 text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">{result}</pre>
              )
            ) : (
              <div className="flex items-center justify-center h-full text-center text-gray-400 min-h-80 p-8">
                <div>
                  <Wand2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Your generated content will appear here.</p>
                  <p className="text-xs mt-1">Select a tool type, chapter, and click Generate.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
