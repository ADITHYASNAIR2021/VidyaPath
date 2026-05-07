'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  BookOpenCheck,
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react';
import clsx from 'clsx';
import { ALL_CHAPTERS } from '@/lib/data';
import { fetchClientStudentSession } from '@/lib/client-student-session';
import { useBookmarkStore, useProgressStore } from '@/lib/store';
import { buildLearningProfile, rankWeakChapters, type LearningProfile } from '@/lib/learning-profile';
import { getPYQData } from '@/lib/pyq';
import BackButton from '@/components/BackButton';
import ChapterIntelligenceHub from '@/components/ChapterIntelligenceHub';
import QuizEngine from '@/components/QuizEngine';
import ImageQuestionSolver from '@/components/ImageQuestionSolver';

interface MCQItem {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  ragMeta?: {
    askedInPastExam: boolean;
    pyqTag: 'asked-before' | 'pyq-inspired' | 'new';
    years?: number[];
    qualityBand?: 'high' | 'medium' | 'baseline';
    qualityScore?: number;
  };
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

type GenerationStage = 'idle' | 'preparing' | 'grounding' | 'generating' | 'validating' | 'completed';

interface ChapterFlowActions {
  generateDrill: () => Promise<void>;
  runDiagnosis: () => Promise<void>;
  buildRemediation: () => Promise<void>;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function getFlashcardsDue(chapterId: string, flashcardCount: number): number {
  if (typeof window === 'undefined') return 0;
  const now = new Date();
  let due = 0;
  for (let index = 0; index < flashcardCount; index += 1) {
    const stored = localStorage.getItem(`fsrs-[${chapterId}]-${index}`);
    if (!stored) {
      due += 1;
      continue;
    }
    try {
      const parsed = JSON.parse(stored) as { due?: string };
      if (!parsed?.due || new Date(parsed.due) <= now) due += 1;
    } catch {
      due += 1;
    }
  }
  return due;
}

const TOOL_TYPES: { id: ToolId; label: string; desc: string }[] = [
  { id: 'practice-quiz', label: 'Practice Quiz', desc: 'MCQs with explanations to test your understanding.' },
  { id: 'flashcard-set', label: 'Flashcard Set', desc: 'Quick recall cards for definitions and key concepts.' },
  { id: 'study-summary', label: 'Study Summary', desc: 'Concise revision notes with exam-focused structure.' },
];

const DIFFICULTY_OPTIONS = [
  { id: 'easy', label: 'Easy', color: 'text-emerald-600' },
  { id: 'medium', label: 'Medium', color: 'text-amber-600' },
  { id: 'hard', label: 'Hard', color: 'text-rose-600' },
  { id: 'mixed', label: 'Mixed', color: 'text-violet-600' },
];

function MCQViewer({ questions }: { questions: MCQItem[] }) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [counted, setCounted] = useState<boolean[]>(() => new Array(questions.length).fill(false));

  const currentQuestion = questions[current];
  const ragMeta = currentQuestion.ragMeta;

  function reveal() {
    if (selected === null || revealed) return;
    setRevealed(true);
    if (selected === currentQuestion.answer && !counted[current]) {
      setScore((value) => value + 1);
      setCounted((previous) => {
        const next = [...previous];
        next[current] = true;
        return next;
      });
    }
  }

  function goTo(index: number) {
    setCurrent(index);
    setSelected(null);
    setRevealed(false);
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-slate-400">
        <span>
          Question {current + 1} / {questions.length}
        </span>
        <span className="font-semibold text-indigo-600">
          Score: {score} / {questions.length}
        </span>
      </div>

      <p className="text-sm font-semibold leading-relaxed text-gray-900 dark:text-slate-100">{currentQuestion.question}</p>

      {ragMeta && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={clsx(
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
              ragMeta.pyqTag === 'asked-before'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : ragMeta.pyqTag === 'pyq-inspired'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-gray-200 bg-gray-50 text-gray-600'
            )}
          >
            {ragMeta.pyqTag === 'asked-before'
              ? 'Asked in previous exams'
              : ragMeta.pyqTag === 'pyq-inspired'
                ? 'PYQ-inspired'
                : 'Fresh pattern'}
          </span>
          {Array.isArray(ragMeta.years) && ragMeta.years.length > 0 && (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
              Years: {ragMeta.years.slice(0, 3).join(', ')}
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        {currentQuestion.options.map((option, optionIndex) => (
          <button
            key={`${optionIndex}-${option.slice(0, 30)}`}
            type="button"
            onClick={() => {
              if (!revealed) setSelected(optionIndex);
            }}
            className={clsx(
              'w-full rounded-xl border px-4 py-2.5 text-left text-sm transition-colors',
              revealed
                ? optionIndex === currentQuestion.answer
                  ? 'border-emerald-400 bg-emerald-50 font-semibold text-emerald-800'
                  : optionIndex === selected
                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                  : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                : selected === optionIndex
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-100'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
            )}
          >
            <span className="mr-2 font-semibold text-gray-400 dark:text-slate-400">{String.fromCharCode(65 + optionIndex)}.</span>
            {option}
          </button>
        ))}
      </div>

      {revealed && currentQuestion.explanation && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-100">
          <span className="font-semibold">Explanation: </span>
          {currentQuestion.explanation}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          onClick={() => goTo(Math.max(0, current - 1))}
          disabled={current === 0}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>

        {!revealed ? (
          <button
            onClick={reveal}
            disabled={selected === null}
            className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            Check Answer
          </button>
        ) : current < questions.length - 1 ? (
          <button
            onClick={() => goTo(current + 1)}
            className="flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-200">Quiz complete.</span>
        )}
      </div>
    </div>
  );
}

function FlashcardViewer({ cards }: { cards: FlashcardItem[] }) {
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);

  function goTo(index: number) {
    setCurrent(index);
    setFlipped(false);
  }

  const currentCard = cards[current];

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-slate-400">
        <span>
          Card {current + 1} / {cards.length}
        </span>
        <span>{flipped ? 'Showing answer' : 'Showing question'}</span>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        className={clsx(
          'min-h-[180px] w-full rounded-2xl border-2 px-6 py-8 text-center transition-all duration-200',
          flipped
            ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-400/40 dark:bg-indigo-500/20'
            : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
        )}
      >
        <p className={clsx('text-sm leading-relaxed', flipped ? 'font-medium text-indigo-900 dark:text-indigo-100' : 'text-gray-700 dark:text-slate-200')}>
          {flipped ? currentCard.back : currentCard.front}
        </p>
        {!flipped && <p className="mt-4 text-xs text-gray-400 dark:text-slate-400">Tap to see answer</p>}
      </button>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => goTo(Math.max(0, current - 1))}
          disabled={current === 0}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <button
          onClick={() => setFlipped((value) => !value)}
          className="flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
        >
          <RotateCcw className="h-3 w-3" />
          Flip
        </button>
        <button
          onClick={() => goTo(Math.min(cards.length - 1, current + 1))}
          disabled={current === cards.length - 1}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function SummaryRenderer({ text }: { text: string }) {
  const elements: ReactNode[] = [];
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={`spacer-${index}`} className="h-2" />);
      return;
    }

    if (/^[A-Z][A-Z\s\-|()0-9]+$/.test(trimmed) && trimmed.length > 3) {
      elements.push(
        <h3 key={`cap-${index}`} className="mb-1 mt-4 border-b border-indigo-100 pb-1 text-sm font-bold uppercase tracking-wide text-indigo-700 dark:border-indigo-500/40 dark:text-indigo-200">
          {trimmed}
        </h3>
      );
      return;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      elements.push(
        <h4 key={`head-${index}`} className="mb-1 mt-3 text-sm font-bold text-gray-800 dark:text-slate-100">
          {trimmed.replace(/^#+\s+/, '')}
        </h4>
      );
      return;
    }

    if (/^[-*]\s/.test(trimmed)) {
      elements.push(
        <p key={`bullet-${index}`} className="ml-4 text-sm text-gray-600 dark:text-slate-300">
          - {trimmed.slice(2)}
        </p>
      );
      return;
    }

    elements.push(
      <p key={`para-${index}`} className="text-sm leading-relaxed text-gray-700 dark:text-slate-200">
        {trimmed.replace(/\*\*/g, '')}
      </p>
    );
  });

  return <div className="space-y-0.5">{elements}</div>;
}

export default function StudentAIToolsPage() {
  const searchParams = useSearchParams();
  const requestedChapterId = (searchParams.get('chapter') ?? '').trim();
  const { studiedChapterIds } = useProgressStore();
  const { bookmarkedChapterIds } = useBookmarkStore();

  const [studentClassLevel, setStudentClassLevel] = useState<10 | 12 | null>(null);

  const [toolType, setToolType] = useState<ToolId>('practice-quiz');
  const [chapterId, setChapterId] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [cardCount, setCardCount] = useState(10);
  const [difficulty, setDifficulty] = useState('mixed');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ResultData | null>(null);
  const [copied, setCopied] = useState(false);
  const [weakProfiles, setWeakProfiles] = useState<LearningProfile[]>([]);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState<GenerationStage>('idle');
  const [generationStatus, setGenerationStatus] = useState('');
  const [generationCompletionMessage, setGenerationCompletionMessage] = useState('');
  const [flowQuizReady, setFlowQuizReady] = useState(false);
  const [flowDrillReady, setFlowDrillReady] = useState(false);
  const [flowDiagnoseReady, setFlowDiagnoseReady] = useState(false);
  const [flowBusy, setFlowBusy] = useState(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const chapterFlowActionsRef = useRef<ChapterFlowActions | null>(null);
  const quizGenerateActionRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let active = true;
    fetchClientStudentSession()
      .then((session) => {
        if (!active || !session) return;
        if (session.classLevel === 10 || session.classLevel === 12) {
          setStudentClassLevel(session.classLevel);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    };
  }, []);

  const chapters = useMemo(
    () =>
      studentClassLevel
        ? ALL_CHAPTERS.filter((chapter) => chapter.classLevel === studentClassLevel)
        : ALL_CHAPTERS,
    [studentClassLevel]
  );

  useEffect(() => {
    if (chapters.length === 0) {
      setChapterId('');
      return;
    }

    const hasRequested = requestedChapterId && chapters.some((chapter) => chapter.id === requestedChapterId);
    if (hasRequested && chapterId !== requestedChapterId) {
      setChapterId(requestedChapterId);
      return;
    }

    const hasCurrent = chapterId && chapters.some((chapter) => chapter.id === chapterId);
    if (!hasCurrent) {
      setChapterId(chapters[0].id);
    }
  }, [chapterId, chapters, requestedChapterId]);

  useEffect(() => {
    if (!chapterId) return;
    setResult(null);
    setError('');
    setCopied(false);
    setGenerationCompletionMessage('');
    setGenerationStatus('');
    setGenerationStage('idle');
    setFlowQuizReady(false);
    setFlowDrillReady(false);
    setFlowDiagnoseReady(false);
    chapterFlowActionsRef.current = null;
    quizGenerateActionRef.current = null;
  }, [chapterId]);

  useEffect(() => {
    if (result?.type === 'practice-quiz' && result.questions.length > 0) {
      setFlowQuizReady(true);
    }
  }, [result]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (chapters.length === 0) {
      setWeakProfiles([]);
      return;
    }

    const profiles = chapters.map((chapter) => {
      const scoreRaw = Number(localStorage.getItem(`quiz-score-[${chapter.id}]`));
      const quizScore = Number.isFinite(scoreRaw) && scoreRaw > 0 ? scoreRaw : null;
      const flashcardsDue = getFlashcardsDue(chapter.id, chapter.flashcards?.length ?? 0);
      return buildLearningProfile({
        chapterId: chapter.id,
        quizScore,
        flashcardsDue,
        studied: studiedChapterIds.includes(chapter.id),
        bookmarked: bookmarkedChapterIds.includes(chapter.id),
        pyqAvgMarks: getPYQData(chapter.id)?.avgMarks ?? 0,
      });
    });

    setWeakProfiles(rankWeakChapters(profiles).filter((profile) => profile.weakTags.length > 0).slice(0, 6));
  }, [bookmarkedChapterIds, chapters, studiedChapterIds]);

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === chapterId) ?? null,
    [chapterId, chapters]
  );

  const completedInScope = useMemo(
    () => studiedChapterIds.filter((id) => chapters.some((chapter) => chapter.id === id)).length,
    [chapters, studiedChapterIds]
  );

  const selectedProfile = useMemo(
    () => weakProfiles.find((profile) => profile.chapterId === chapterId) ?? null,
    [chapterId, weakProfiles]
  );

  const totalDueInScope = useMemo(
    () => weakProfiles.reduce((sum, profile) => sum + profile.flashcardsDue, 0),
    [weakProfiles]
  );

  function beginGenerationProgress() {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    setGenerationStage('preparing');
    setGenerationStatus('Preparing chapter context...');
    setGenerationProgress(8);
    progressIntervalRef.current = setInterval(() => {
      setGenerationProgress((value) => {
        if (value >= 92) return value;
        const increment = Math.max(1, Math.round((100 - value) / 10));
        return Math.min(92, value + increment);
      });
    }, 320);
  }

  function finishGenerationProgress() {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setGenerationStage('completed');
    setGenerationProgress(100);
    progressTimeoutRef.current = setTimeout(() => {
      setGenerationProgress(0);
      setGenerationStage('idle');
    }, 700);
  }

  async function generate(requestedTool: ToolId = toolType) {
    if (requestedTool !== toolType) {
      setToolType(requestedTool);
    }
    const chapter = ALL_CHAPTERS.find((item) => item.id === chapterId);
    setLoading(true);
    setError('');
    setResult(null);
    setGenerationCompletionMessage('');
    beginGenerationProgress();

    try {
      if (requestedTool === 'practice-quiz') {
        setGenerationStage('grounding');
        setGenerationStatus('Retrieving textbook + PYQ context...');
        const response = await fetch('/api/generate-quiz', {
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
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          setError(body?.message ?? 'Quiz generation failed. Please try again.');
          return;
        }
        setGenerationStage('validating');
        setGenerationStatus('Validating exact question count...');
        const outer = unwrap<{ success?: boolean; data?: MCQItem[] } | null>(body);
        const questions = Array.isArray(outer?.data) ? (outer.data as MCQItem[]) : [];
        if (questions.length !== questionCount) {
          setError(`Expected ${questionCount} questions, but got ${questions.length}. Please retry.`);
          return;
        }
        setResult({ type: 'practice-quiz', questions });
        setGenerationCompletionMessage(`Completed: ${questions.length}/${questionCount} quiz questions generated.`);
        setGenerationStatus('Quiz generation completed.');
        setFlowQuizReady(true);
        return;
      }

      if (requestedTool === 'flashcard-set') {
        setGenerationStage('grounding');
        setGenerationStatus('Retrieving textbook + PYQ context...');
        const response = await fetch('/api/generate-flashcards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chapterId: chapterId || undefined,
            chapterTitle: chapter?.title,
            subject: chapter?.subject,
            classLevel: chapter?.classLevel,
            cardCount,
          }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          setError(body?.message ?? 'Flashcard generation failed. Please try again.');
          return;
        }
        setGenerationStage('validating');
        setGenerationStatus('Validating exact flashcard count...');
        const outer = unwrap<{ success?: boolean; data?: FlashcardItem[] } | null>(body);
        const cards = Array.isArray(outer?.data) ? (outer.data as FlashcardItem[]) : [];
        if (cards.length !== cardCount) {
          setError(`Expected ${cardCount} flashcards, but got ${cards.length}. Please retry.`);
          return;
        }
        setResult({ type: 'flashcard-set', cards });
        setGenerationCompletionMessage(`Completed: ${cards.length}/${cardCount} flashcards generated.`);
        setGenerationStatus('Flashcard generation completed.');
        return;
      }

      setGenerationStage('generating');
      setGenerationStatus('Generating chapter summary...');
      const response = await fetch('/api/ai-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `Give me a concise study summary for ${chapter?.title ?? 'this chapter'}. Include key definitions, formulas, exam concepts, and revision tips.`,
            },
          ],
          chapterContext: chapter
            ? {
                chapterId: chapter.id,
                title: chapter.title,
                subject: chapter.subject,
                classLevel: chapter.classLevel,
                topics: chapter.topics,
              }
            : undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message ?? 'Summary generation failed. Please try again.');
        return;
      }
      const data = unwrap<{ message?: string } | null>(body);
      const summaryText = data?.message?.trim() ?? '';
      if (!summaryText) {
        setError('Summary generation returned empty content. Please retry.');
        return;
      }
      setResult({ type: 'study-summary', text: summaryText });
      setGenerationCompletionMessage('Completed: grounded study summary generated.');
      setGenerationStatus('Summary generation completed.');
    } catch {
      setError('Generation failed. Check your connection and try again.');
    } finally {
      setLoading(false);
      finishGenerationProgress();
    }
  }

  async function copySummary() {
    if (result?.type !== 'study-summary') return;
    await navigator.clipboard.writeText(result.text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const resultLabel =
    result?.type === 'practice-quiz'
      ? `${result.questions.length} MCQs`
      : result?.type === 'flashcard-set'
        ? `${result.cards.length} flashcards`
        : result?.type === 'study-summary'
          ? 'Study summary'
          : '';

  const nextFlowStep: 'quiz' | 'drill' | 'diagnose' | 'revision' = !flowQuizReady
    ? 'quiz'
    : !flowDrillReady
      ? 'drill'
      : !flowDiagnoseReady
        ? 'diagnose'
        : 'revision';

  const nextFlowLabel =
    nextFlowStep === 'quiz'
      ? 'Generate Quiz'
      : nextFlowStep === 'drill'
        ? 'Generate Drill'
        : nextFlowStep === 'diagnose'
          ? 'Run Diagnose'
          : 'Open Revision Hub';

  async function runNextFlowStep() {
    if (!selectedChapter || flowBusy) return;
    setFlowBusy(true);
    try {
      if (nextFlowStep === 'quiz') {
        if (quizGenerateActionRef.current) {
          await quizGenerateActionRef.current();
        } else {
          await generate('practice-quiz');
        }
        return;
      }
      if (nextFlowStep === 'drill') {
        if (!chapterFlowActionsRef.current) {
          setError('Chapter drill actions are not ready yet. Please scroll to Chapter Intelligence and retry.');
          return;
        }
        await chapterFlowActionsRef.current.generateDrill();
        return;
      }
      if (nextFlowStep === 'diagnose') {
        if (!chapterFlowActionsRef.current) {
          setError('Diagnosis action is not ready yet. Please scroll to Chapter Intelligence and retry.');
          return;
        }
        await chapterFlowActionsRef.current.runDiagnosis();
        return;
      }
      window.location.href = `/student/revision?chapter=${encodeURIComponent(selectedChapter.id)}`;
    } finally {
      setFlowBusy(false);
    }
  }

  if (chapters.length === 0) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <BackButton href="/dashboard" label="Dashboard" />
        <div className="mt-5 rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 dark:text-slate-100">AI Study Hub</h1>
          <p className="mt-2 text-sm text-[#5A5570] dark:text-slate-300">
            No chapters are currently available for your account scope. If this looks wrong, ask your teacher/admin to update subject access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 text-slate-900 dark:text-slate-100">
      <BackButton href="/dashboard" label="Dashboard" />

      <section className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/95">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-fraunces text-2xl font-bold text-navy-700 dark:text-slate-100">
              <BrainCircuit className="h-6 w-6 text-indigo-600" />
              AI Study Hub
            </h1>
            <p className="mt-1 text-sm text-[#5A5570] dark:text-slate-300">
              Select one chapter at the top. Every AI tool on this page uses that chapter context.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {studentClassLevel && (
              <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                Class {studentClassLevel}
              </span>
            )}
            {selectedChapter && (
              <Link
                href={`/chapters/${selectedChapter.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E4DC] bg-[#FDFAF6] px-3 py-1 text-xs font-semibold text-[#4A4A6A] hover:bg-[#F7F1E9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Open chapter page
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
            <Link
              href={selectedChapter ? `/student/revision?chapter=${encodeURIComponent(selectedChapter.id)}` : '/student/revision'}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200 dark:hover:bg-emerald-500/30"
            >
              Open Revision Hub
              <Target className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Completed</p>
            <p className="mt-1 text-xl font-bold text-emerald-800">{completedInScope}</p>
            <p className="text-xs text-emerald-700">
              of {chapters.length} chapter{chapters.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Need Focus</p>
            <p className="mt-1 text-xl font-bold text-amber-800">{weakProfiles.length}</p>
            <p className="text-xs text-amber-700">chapters with risk tags</p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Flashcards Due</p>
            <p className="mt-1 text-xl font-bold text-violet-800">{totalDueInScope}</p>
            <p className="text-xs text-violet-700">across your focus chapters</p>
          </div>
          <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Selected Chapter</p>
            <p className="mt-1 line-clamp-1 text-sm font-bold text-sky-900">{selectedChapter?.title ?? 'Select a chapter'}</p>
            <p className="text-xs text-sky-700">
              {selectedChapter ? `${selectedChapter.subject} | Class ${selectedChapter.classLevel}` : 'No chapter selected'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="ai-study-hub-chapter" className="mb-1 block text-xs font-semibold text-gray-600 dark:text-slate-300">
            Chapter context (shared by all tools)
          </label>
          <select
            id="ai-study-hub-chapter"
            value={chapterId}
            onChange={(event) => {
              setChapterId(event.target.value);
              setResult(null);
              setError('');
            }}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                Class {chapter.classLevel} | {chapter.subject} | {chapter.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-200">Study Flow</p>
            <p className="mt-1 text-sm font-semibold text-indigo-900 dark:text-indigo-100">
              Quiz {'->'} Drill {'->'} Diagnose {'->'} Revision
            </p>
            <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-200">
              One-click next step keeps the selected chapter context locked end-to-end.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runNextFlowStep()}
            disabled={flowBusy || !selectedChapter}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {flowBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
            One-click next: {nextFlowLabel}
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <div className={clsx('rounded-xl border p-3 text-xs', flowQuizReady ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-indigo-100 bg-indigo-50 text-indigo-800')}>
            <p className="font-semibold">Step 1: Quiz</p>
            <p className="mt-0.5">{flowQuizReady ? 'Done' : 'Pending'}</p>
          </div>
          <div className={clsx('rounded-xl border p-3 text-xs', flowDrillReady ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-100 bg-amber-50 text-amber-800')}>
            <p className="font-semibold">Step 2: Drill</p>
            <p className="mt-0.5">{flowDrillReady ? 'Done' : 'Pending'}</p>
          </div>
          <div className={clsx('rounded-xl border p-3 text-xs', flowDiagnoseReady ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-violet-100 bg-violet-50 text-violet-800')}>
            <p className="font-semibold">Step 3: Diagnose</p>
            <p className="mt-0.5">{flowDiagnoseReady ? 'Done' : 'Pending'}</p>
          </div>
          <div className={clsx('rounded-xl border p-3 text-xs', nextFlowStep === 'revision' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-sky-100 bg-sky-50 text-sky-800')}>
            <p className="font-semibold">Step 4: Revision</p>
            <p className="mt-0.5">{nextFlowStep === 'revision' ? 'Ready now' : 'Locked until Diagnose'}</p>
          </div>
        </div>
      </section>

      <div id="generator" className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-600 dark:text-slate-300">What to generate</label>
            <div className="space-y-2">
              {TOOL_TYPES.map(({ id, label, desc }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setToolType(id);
                    setResult(null);
                    setError('');
                  }}
                  className={clsx(
                    'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                    toolType === id
                      ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300 dark:border-indigo-400 dark:bg-indigo-500/20'
                      : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
                  )}
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{label}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-300">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {toolType === 'practice-quiz' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-slate-300">Questions</label>
                <input
                  type="number"
                  min={5}
                  max={30}
                  value={questionCount}
                  onChange={(event) => setQuestionCount(Math.max(5, Math.min(30, Number(event.target.value) || 10)))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-slate-300">Difficulty</label>
                <div className="grid grid-cols-2 gap-1">
                  {DIFFICULTY_OPTIONS.map(({ id, label, color }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setDifficulty(id)}
                      className={clsx(
                        'rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors',
                        difficulty === id
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : `border-gray-200 bg-white ${color} hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {toolType === 'flashcard-set' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-slate-300">Cards</label>
              <input
                type="number"
                min={3}
                max={15}
                value={cardCount}
                onChange={(event) => setCardCount(Math.max(3, Math.min(15, Number(event.target.value) || 10)))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          )}

          <button
            onClick={() => void generate()}
            disabled={loading || !chapterId}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Generating...' : 'Generate'}
          </button>

          {loading && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 dark:border-indigo-500/40 dark:bg-indigo-500/20">
              <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-indigo-700 dark:text-indigo-200">
                <span>
                  {generationStage === 'preparing'
                    ? 'Preparing'
                    : generationStage === 'grounding'
                      ? 'Grounding context'
                      : generationStage === 'generating'
                        ? 'Generating'
                        : generationStage === 'validating'
                          ? 'Validating'
                          : 'Generation progress'}
                </span>
                <span>{Math.round(generationProgress)}%</span>
              </div>
              {generationStatus && (
                <p className="mb-1 text-[11px] text-indigo-700 dark:text-indigo-200">{generationStatus}</p>
              )}
              <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${generationProgress}%` }} />
              </div>
            </div>
          )}

          {generationCompletionMessage && !loading && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-100">
              {generationCompletionMessage}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-100">
              {error}
            </div>
          )}
        </div>

        <div className="flex min-h-[520px] flex-col lg:col-span-3">
          <div className="mb-2 flex min-h-[36px] items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">{resultLabel}</span>
            {result?.type === 'study-summary' && (
              <button
                onClick={() => void copySummary()}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>

          <div
            className={clsx(
                'flex-1 overflow-auto rounded-2xl border',
                result
                  ? 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                  : 'border-dashed border-gray-300 bg-gray-50 dark:border-slate-600 dark:bg-slate-800/60'
              )}
            >
            {loading ? (
              <div className="flex min-h-80 h-full items-center justify-center text-gray-400 dark:text-slate-400">
                <div className="w-full max-w-md px-6 text-center">
                  <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-indigo-400" />
                  <p className="text-sm">Generating {TOOL_TYPES.find((tool) => tool.id === toolType)?.label}...</p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                    {generationStatus || 'Grounding with textbook + previous-year context.'}
                  </p>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-indigo-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${generationProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : result ? (
              result.type === 'practice-quiz' ? (
                result.questions.length > 0 ? (
                  <MCQViewer questions={result.questions} />
                ) : (
                  <div className="p-8 text-center text-sm text-gray-400 dark:text-slate-400">No questions generated. Please try again.</div>
                )
              ) : result.type === 'flashcard-set' ? (
                result.cards.length > 0 ? (
                  <FlashcardViewer cards={result.cards} />
                ) : (
                  <div className="p-8 text-center text-sm text-gray-400 dark:text-slate-400">No flashcards generated. Please try again.</div>
                )
              ) : (
                <div ref={summaryRef} className="p-5">
                  <SummaryRenderer text={result.text} />
                </div>
              )
            ) : (
              <div className="flex min-h-80 h-full items-center justify-center p-8 text-center text-gray-400 dark:text-slate-400">
                <div>
                  <BrainCircuit className="mx-auto mb-3 h-10 w-10 opacity-30" />
                  <p className="font-medium">Your generated study material will appear here.</p>
                  <p className="mt-1 text-xs">Pick a tool, select chapter, and press Generate.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedChapter && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">Chapter-Linked AI Workspace</p>
                <h2 className="mt-1 font-fraunces text-xl font-bold text-navy-700 dark:text-slate-100">{selectedChapter.title}</h2>
                <p className="mt-1 text-sm text-[#5A5570] dark:text-slate-300">
                  All tools below are locked to this chapter context from textbook and question-paper data.
                </p>
              </div>
              <Link
                href={`/chapters/${selectedChapter.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E4DC] bg-[#FDFAF6] px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-[#F7F1E9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Go to chapter
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div id="chapter-intelligence">
            <ChapterIntelligenceHub
              key={`chapter-intel-${selectedChapter.id}`}
              chapterId={selectedChapter.id}
              chapterTitle={selectedChapter.title}
              subject={selectedChapter.subject}
              classLevel={selectedChapter.classLevel}
              chapterTopics={selectedChapter.topics}
              flashcardCount={selectedChapter.flashcards?.length ?? 0}
              onDrillReady={() => setFlowDrillReady(true)}
              onDiagnoseReady={() => setFlowDiagnoseReady(true)}
              onRegisterActions={(actions) => {
                chapterFlowActionsRef.current = actions;
              }}
            />
          </div>

          <div id="flow-quiz">
            <QuizEngine
              key={`quiz-engine-${selectedChapter.id}`}
              chapterId={selectedChapter.id}
              quizzes={selectedChapter.quizzes ?? []}
              subject={selectedChapter.subject}
              chapterTitle={selectedChapter.title}
              onQuizReady={({ count }) => setFlowQuizReady(count > 0)}
              onRegisterGenerateAction={(action) => {
                quizGenerateActionRef.current = action;
              }}
            />
          </div>

          <ImageQuestionSolver
            key={`image-solver-${selectedChapter.id}`}
            chapterTitle={selectedChapter.title}
            classLevel={selectedChapter.classLevel}
            subject={selectedChapter.subject}
          />

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/20">
            <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-100">
              <BookOpenCheck className="h-4 w-4 text-emerald-700" />
              Suggested workflow
            </h3>
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-200">
              1) Generate quiz/flashcards, 2) run diagnosis + drill, 3) solve doubts from image questions, 4) open Revision Hub for planning.
            </p>
            {selectedProfile && (
              <p className="mt-2 text-xs font-semibold text-emerald-800 dark:text-emerald-100">
                Current risk tags for this chapter: {selectedProfile.weakTags.length}
              </p>
            )}
          </div>
        </section>
      )}

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/20">
        <h3 className="flex items-center gap-2 text-sm font-bold text-indigo-900 dark:text-indigo-100">
          <Target className="h-4 w-4 text-indigo-700" />
          Chapter pages stay focused
        </h3>
        <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-200">
          Chapter pages keep chatbot + flashcards for quick learning. AI Study Hub handles deeper AI generation and diagnosis with one selected chapter context.
        </p>
      </div>
    </div>
  );
}
