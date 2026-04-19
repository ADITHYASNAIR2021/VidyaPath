'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_CHAPTERS } from '@/lib/data';
import {
  BrainCircuit, Copy, Check, RefreshCw, Sparkles,
  ChevronLeft, ChevronRight, RotateCcw,
} from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

interface MCQItem {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

interface FlashcardItem {
  front: string;
  back: string;
}

type ToolId = 'practice-quiz' | 'flashcard-set' | 'study-summary';

type ResultData =
  | { type: 'practice-quiz'; questions: MCQItem[] }
  | { type: 'flashcard-set'; cards: FlashcardItem[] }
  | { type: 'study-summary'; text: string };

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

const TOOL_TYPES: { id: ToolId; label: string; desc: string }[] = [
  { id: 'practice-quiz',  label: 'Practice Quiz',  desc: 'MCQs with explanations — test your knowledge' },
  { id: 'flashcard-set',  label: 'Flashcard Set',  desc: 'Key terms & concepts to flip through and memorise' },
  { id: 'study-summary',  label: 'Study Summary',  desc: 'Concise chapter notes with formulas and board tips' },
];

const DIFFICULTY_OPTIONS = [
  { id: 'easy',   label: 'Easy',   color: 'text-emerald-600' },
  { id: 'medium', label: 'Medium', color: 'text-amber-600' },
  { id: 'hard',   label: 'Hard',   color: 'text-rose-600' },
  { id: 'mixed',  label: 'Mixed',  color: 'text-violet-600' },
];

function MCQViewer({ questions }: { questions: MCQItem[] }) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [counted, setCounted] = useState<boolean[]>(() => new Array(questions.length).fill(false));

  const q = questions[current];

  function reveal() {
    if (selected === null || revealed) return;
    setRevealed(true);
    if (selected === q.answer && !counted[current]) {
      setScore((s) => s + 1);
      setCounted((prev) => { const next = [...prev]; next[current] = true; return next; });
    }
  }

  function goTo(idx: number) {
    setCurrent(idx);
    setSelected(null);
    setRevealed(false);
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Question {current + 1} / {questions.length}</span>
        <span className="font-semibold text-indigo-600">Score: {score} / {questions.length}</span>
      </div>

      <p className="text-sm font-semibold text-gray-900 leading-relaxed">{q.question}</p>

      <div className="space-y-2">
        {q.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { if (!revealed) setSelected(i); }}
            className={clsx(
              'w-full text-left rounded-xl border px-4 py-2.5 text-sm transition-colors',
              revealed
                ? i === q.answer
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-800 font-semibold'
                  : i === selected
                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                    : 'border-gray-200 bg-gray-50 text-gray-400'
                : selected === i
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                  : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
            )}
          >
            <span className="font-semibold mr-2 text-gray-400">{String.fromCharCode(65 + i)}.</span>
            {opt}
          </button>
        ))}
      </div>

      {revealed && q.explanation && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 text-sm text-indigo-800">
          <span className="font-semibold">Explanation: </span>{q.explanation}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          onClick={() => goTo(Math.max(0, current - 1))}
          disabled={current === 0}
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>

        {!revealed ? (
          <button
            onClick={reveal}
            disabled={selected === null}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40"
          >
            Check Answer
          </button>
        ) : current < questions.length - 1 ? (
          <button
            onClick={() => goTo(current + 1)}
            className="flex items-center gap-1 px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-xs font-semibold text-emerald-700">Quiz complete! 🎉</span>
        )}
      </div>
    </div>
  );
}

function FlashcardViewer({ cards }: { cards: FlashcardItem[] }) {
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);

  function goTo(idx: number) {
    setCurrent(idx);
    setFlipped(false);
  }

  const card = cards[current];

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Card {current + 1} / {cards.length}</span>
        <span>{flipped ? 'Showing answer' : 'Showing question'}</span>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className={clsx(
          'w-full min-h-[180px] rounded-2xl border-2 px-6 py-8 text-center transition-all duration-200',
          flipped
            ? 'border-indigo-300 bg-indigo-50'
            : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50'
        )}
      >
        <p className={clsx(
          'text-sm leading-relaxed',
          flipped ? 'text-indigo-900 font-medium' : 'text-gray-700'
        )}>
          {flipped ? card.back : card.front}
        </p>
        {!flipped && <p className="mt-4 text-xs text-gray-400">Tap to see answer</p>}
      </button>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => goTo(Math.max(0, current - 1))}
          disabled={current === 0}
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        <button
          onClick={() => setFlipped((f) => !f)}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50"
        >
          <RotateCcw className="w-3 h-3" /> Flip
        </button>
        <button
          onClick={() => goTo(Math.min(cards.length - 1, current + 1))}
          disabled={current === cards.length - 1}
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40"
        >
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function SummaryRenderer({ text }: { text: string }) {
  const elements: React.ReactNode[] = [];
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t) { elements.push(<div key={i} className="h-2" />); return; }
    if (/^[A-Z][A-Z\s\-—|()0-9]+$/.test(t) && t.length > 3) {
      elements.push(<h3 key={i} className="text-sm font-bold text-indigo-700 uppercase tracking-wide mt-4 mb-1 pb-1 border-b border-indigo-100">{t}</h3>);
      return;
    }
    if (/^#{1,3}\s+/.test(t)) {
      elements.push(<h4 key={i} className="text-sm font-bold text-gray-800 mt-3 mb-1">{t.replace(/^#+\s+/, '')}</h4>);
      return;
    }
    if (/^[-•*]\s/.test(t)) {
      elements.push(<p key={i} className="text-sm text-gray-600 ml-4">{'• '}{t.slice(2)}</p>);
      return;
    }
    elements.push(<p key={i} className="text-sm text-gray-700 leading-relaxed">{t.replace(/\*\*/g, '')}</p>);
  });
  return <div className="space-y-0.5">{elements}</div>;
}

export default function StudentAIToolsPage() {
  const [studentClassLevel, setStudentClassLevel] = useState<10 | 12 | null>(null);
  const [toolType, setToolType] = useState<ToolId>('practice-quiz');
  const [chapterId, setChapterId] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState('mixed');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ResultData | null>(null);
  const [copied, setCopied] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const chapters = useMemo(
    () => studentClassLevel ? ALL_CHAPTERS.filter((ch) => ch.classLevel === studentClassLevel) : ALL_CHAPTERS,
    [studentClassLevel]
  );

  useEffect(() => {
    fetch('/api/student/session/me', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) { setError('Session expired. Please sign in again.'); return; }
        const body = await res.json().catch(() => null);
        const data = body?.data ?? body;
        if (data?.classLevel === 10 || data?.classLevel === 12) setStudentClassLevel(data.classLevel);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!chapterId && chapters.length > 0) setChapterId(chapters[0].id);
  }, [chapters, chapterId]);

  async function generate() {
    const chapter = ALL_CHAPTERS.find((c) => c.id === chapterId);
    setLoading(true);
    setError('');
    setResult(null);
    try {
      if (toolType === 'practice-quiz') {
        const res = await fetch('/api/generate-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chapterId: chapterId || undefined,
            chapterTitle: chapter?.title,
            subject: chapter?.subject,
            classLevel: chapter?.classLevel,
            questionCount,
            difficulty,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) { setError(body?.message ?? 'Quiz generation failed. Please try again.'); return; }
        const outer = unwrap<{ success?: boolean; data?: MCQItem[] } | null>(body);
        const questions = Array.isArray(outer?.data) ? outer.data as MCQItem[] : [];
        setResult({ type: 'practice-quiz', questions });

      } else if (toolType === 'flashcard-set') {
        const res = await fetch('/api/generate-flashcards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chapterId: chapterId || undefined,
            chapterTitle: chapter?.title,
            subject: chapter?.subject,
            classLevel: chapter?.classLevel,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) { setError(body?.message ?? 'Flashcard generation failed. Please try again.'); return; }
        const outer = unwrap<{ success?: boolean; data?: FlashcardItem[] } | null>(body);
        const cards = Array.isArray(outer?.data) ? outer.data as FlashcardItem[] : [];
        setResult({ type: 'flashcard-set', cards });

      } else {
        const res = await fetch('/api/ai-tutor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: `Give me a concise study summary for ${chapter?.title ?? 'this chapter'}. Include: key definitions, important formulas, exam-relevant concepts, and board tips. Keep it structured and exam-focused.`,
            }],
            chapterContext: chapter
              ? { chapterId: chapter.id, title: chapter.title, subject: chapter.subject, classLevel: chapter.classLevel, topics: chapter.topics }
              : undefined,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) { setError(body?.message ?? 'Summary generation failed. Please try again.'); return; }
        const data = unwrap<{ message?: string } | null>(body);
        setResult({ type: 'study-summary', text: data?.message ?? '' });
      }
    } catch {
      setError('Generation failed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function copySummary() {
    if (result?.type !== 'study-summary') return;
    await navigator.clipboard.writeText(result.text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const resultLabel =
    result?.type === 'practice-quiz' ? `${result.questions.length} MCQs`
    : result?.type === 'flashcard-set' ? `${result.cards.length} flashcards`
    : result?.type === 'study-summary' ? 'Study summary'
    : '';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <BackButton href="/student" label="Dashboard" />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-indigo-600" /> AI Study Tools
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Generate personalised study materials for your CBSE chapters.</p>
        </div>
        {studentClassLevel && (
          <span className="rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
            Class {studentClassLevel}
          </span>
        )}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Config panel */}
        <div className="lg:col-span-2 space-y-5">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">What to generate</label>
            <div className="space-y-2">
              {TOOL_TYPES.map(({ id, label, desc }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setToolType(id); setResult(null); setError(''); }}
                  className={clsx(
                    'w-full text-left rounded-xl border px-4 py-3 transition-colors',
                    toolType === id
                      ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
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
            <select
              value={chapterId}
              onChange={(e) => setChapterId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.subject} — {ch.title}
                </option>
              ))}
            </select>
          </div>

          {toolType === 'practice-quiz' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Questions</label>
                <input
                  type="number"
                  min={5}
                  max={30}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
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
                        difficulty === id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : `border-gray-200 bg-white ${color} hover:bg-gray-50`
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => void generate()}
            disabled={loading || !chapterId}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Generating…' : 'Generate'}
          </button>

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}
        </div>

        {/* Result panel */}
        <div className="lg:col-span-3 flex flex-col min-h-[520px]">
          <div className="flex items-center justify-between mb-2 min-h-[36px]">
            <span className="text-xs font-semibold text-gray-500">{resultLabel}</span>
            {result?.type === 'study-summary' && (
              <button
                onClick={() => void copySummary()}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>

          <div className={clsx(
            'flex-1 rounded-2xl border overflow-auto',
            result ? 'bg-white border-gray-200' : 'bg-gray-50 border-dashed border-gray-300'
          )}>
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-400 min-h-80">
                <div className="text-center">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-400" />
                  <p className="text-sm">Generating {TOOL_TYPES.find((t) => t.id === toolType)?.label}…</p>
                  <p className="text-xs text-gray-400 mt-1">This takes 10–20 seconds</p>
                </div>
              </div>
            ) : result ? (
              result.type === 'practice-quiz' ? (
                result.questions.length > 0
                  ? <MCQViewer questions={result.questions} />
                  : <div className="p-8 text-center text-gray-400 text-sm">No questions generated. Try again.</div>
              ) : result.type === 'flashcard-set' ? (
                result.cards.length > 0
                  ? <FlashcardViewer cards={result.cards} />
                  : <div className="p-8 text-center text-gray-400 text-sm">No flashcards generated. Try again.</div>
              ) : (
                <div ref={summaryRef} className="p-5">
                  <SummaryRenderer text={result.text} />
                </div>
              )
            ) : (
              <div className="flex items-center justify-center h-full text-center text-gray-400 min-h-80 p-8">
                <div>
                  <BrainCircuit className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Your study material will appear here.</p>
                  <p className="text-xs mt-1">Choose a tool, pick your chapter, and hit Generate.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
