'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, ClipboardList, Loader2, Sparkles, Target } from 'lucide-react';

interface ChapterIntelligenceHubProps {
  chapterId: string;
  chapterTitle: string;
  subject: string;
  classLevel: number;
  chapterTopics: string[];
  flashcardCount: number;
  onDrillReady?: (payload: {
    totalQuestions: number;
    questionType: 'mcq' | 'short' | 'long' | 'mixed';
    difficulty: string;
  }) => void;
  onDiagnoseReady?: (payload: { riskLevel: 'low' | 'medium' | 'high'; weakTags: string[] }) => void;
  onRegisterActions?: (actions: {
    generateDrill: () => Promise<void>;
    runDiagnosis: () => Promise<void>;
    buildRemediation: () => Promise<void>;
  }) => void;
}

interface ChapterPackData {
  chapterId: string;
  highYieldTopics: string[];
  commonMistakes: string[];
  examStrategy: string[];
}

interface ChapterDrillData {
  chapterId: string;
  difficulty: string;
  questionType?: 'mcq' | 'short' | 'long' | 'mixed';
  questions: Array<{
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
  }>;
  shortQuestions?: string[];
  longQuestions?: string[];
}

interface ChapterDiagnoseData {
  chapterId: string;
  riskLevel: 'low' | 'medium' | 'high';
  weakTags: string[];
  diagnosis: string[];
  nextActions: string[];
  recommendedTaskTypes: string[];
}

interface ChapterRemediateData {
  chapterId: string;
  dayPlan: Array<{
    day: number;
    focus: string;
    tasks: string[];
    targetOutcome: string;
  }>;
  checkpoints: string[];
  expectedScoreLift: string;
}

function unwrapApiPayload<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function getFlashcardsDue(chapterId: string, flashcardCount: number): number {
  if (typeof window === 'undefined') return 0;
  const now = new Date();
  let due = 0;
  for (let idx = 0; idx < flashcardCount; idx++) {
    const stored = localStorage.getItem(`fsrs-[${chapterId}]-${idx}`);
    if (!stored) {
      due++;
      continue;
    }
    try {
      const parsed = JSON.parse(stored) as { due?: string };
      if (!parsed?.due || new Date(parsed.due) <= now) due++;
    } catch {
      due++;
    }
  }
  return due;
}

export default function ChapterIntelligenceHub({
  chapterId,
  chapterTitle,
  subject,
  classLevel,
  chapterTopics,
  flashcardCount,
  onDrillReady,
  onDiagnoseReady,
  onRegisterActions,
}: ChapterIntelligenceHubProps) {
  const [packData, setPackData] = useState<ChapterPackData | null>(null);
  const [drillData, setDrillData] = useState<ChapterDrillData | null>(null);
  const [diagnoseData, setDiagnoseData] = useState<ChapterDiagnoseData | null>(null);
  const [remediateData, setRemediateData] = useState<ChapterRemediateData | null>(null);

  const [loadingPack, setLoadingPack] = useState(false);
  const [loadingDrill, setLoadingDrill] = useState(false);
  const [loadingDiagnose, setLoadingDiagnose] = useState(false);
  const [loadingRemediate, setLoadingRemediate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);

  const [difficulty, setDifficulty] = useState('mixed');
  const [questionCount, setQuestionCount] = useState(8);
  const [questionType, setQuestionType] = useState<'mcq' | 'short' | 'long' | 'mixed'>('mixed');

  useEffect(() => {
    setPackData(null);
    setDrillData(null);
    setDiagnoseData(null);
    setRemediateData(null);
    setError(null);
    setDifficulty('mixed');
    setQuestionCount(8);
    setQuestionType('mixed');
  }, [chapterId]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
          ? payload.data as Record<string, unknown>
          : payload as Record<string, unknown> | null;
        const role = typeof data?.role === 'string' ? data.role : '';
        if (active) setAiEnabled(['student', 'teacher', 'admin', 'developer'].includes(role));
      })
      .catch(() => {
        if (active) setAiEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const localPerformance = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        quizScore: null as number | null,
        flashcardsDue: 0,
        studied: false,
        bookmarked: false,
      };
    }

    const quizRaw = Number(localStorage.getItem(`quiz-score-[${chapterId}]`));
    const quizScore = Number.isFinite(quizRaw) && quizRaw >= 0 ? Math.max(0, Math.min(100, quizRaw)) : null;
    const flashcardsDue = getFlashcardsDue(chapterId, flashcardCount);

    let studied = false;
    let bookmarked = false;
    try {
      const progress = localStorage.getItem('vidyapath-progress');
      if (progress) {
        const parsed = JSON.parse(progress) as { state?: { studiedChapterIds?: string[] } };
        studied = Array.isArray(parsed?.state?.studiedChapterIds) && parsed.state.studiedChapterIds.includes(chapterId);
      }
      const bookmarks = localStorage.getItem('vidyapath-bookmarks');
      if (bookmarks) {
        const parsed = JSON.parse(bookmarks) as { state?: { bookmarkedChapterIds?: string[] } };
        bookmarked = Array.isArray(parsed?.state?.bookmarkedChapterIds) && parsed.state.bookmarkedChapterIds.includes(chapterId);
      }
    } catch {
      studied = false;
      bookmarked = false;
    }

    return { quizScore, flashcardsDue, studied, bookmarked };
  }, [chapterId, flashcardCount]);

  useEffect(() => {
    onRegisterActions?.({
      generateDrill,
      runDiagnosis,
      buildRemediation,
    });
  }, [onRegisterActions, generateDrill, runDiagnosis, buildRemediation]);

  if (aiEnabled === false) {
    return (
      <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="flex items-center gap-2 font-fraunces text-lg font-bold text-navy-700 dark:text-slate-100">
          <BrainCircuit className="w-5 h-5 text-indigo-500" />
          Chapter Intelligence
        </h3>
        <p className="mt-2 text-sm text-[#4A4A6A] dark:text-slate-300">
          Login with any account to unlock AI chapter tools.
        </p>
        <div className="mt-3">
          <Link
            href={`/login?next=${encodeURIComponent(`/chapters/${chapterId}`)}`}
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Login
          </Link>
        </div>
      </div>
    );
  }

  async function generatePack() {
    setLoadingPack(true);
    setError(null);
    try {
      const response = await fetch('/api/chapter-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId }),
      });
      const body = await response.json().catch(() => ({}));
      const data = unwrapApiPayload<ChapterPackData>(body);
      if (!response.ok) {
        const message = (body && typeof body === 'object' ? (body as Record<string, unknown>).message : null) as string | null;
        setError(message || 'Failed to build chapter pack.');
        return;
      }
      setPackData(data);
    } catch {
      setError('Network error while generating chapter pack.');
    } finally {
      setLoadingPack(false);
    }
  }

  async function generateDrill() {
    setLoadingDrill(true);
    setError(null);
    try {
      const response = await fetch('/api/chapter-drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId,
          questionCount,
          difficulty,
          questionType,
        }),
      });
      const body = await response.json().catch(() => ({}));
      const data = unwrapApiPayload<ChapterDrillData>(body);
      if (!response.ok) {
        const message = (body && typeof body === 'object' ? (body as Record<string, unknown>).message : null) as string | null;
        setError(message || 'Failed to create chapter drill.');
        return;
      }
      setDrillData(data);
      onDrillReady?.({
        totalQuestions:
          (data.questions?.length ?? 0) +
          (data.shortQuestions?.length ?? 0) +
          (data.longQuestions?.length ?? 0),
        questionType: data.questionType ?? 'mixed',
        difficulty: data.difficulty ?? difficulty,
      });
    } catch {
      setError('Network error while generating drill set.');
    } finally {
      setLoadingDrill(false);
    }
  }

  async function runDiagnosis() {
    setLoadingDiagnose(true);
    setError(null);
    try {
      const response = await fetch('/api/chapter-diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId,
          quizScore: localPerformance.quizScore,
          flashcardsDue: localPerformance.flashcardsDue,
          studied: localPerformance.studied,
          bookmarked: localPerformance.bookmarked,
        }),
      });
      const body = await response.json().catch(() => ({}));
      const data = unwrapApiPayload<ChapterDiagnoseData>(body);
      if (!response.ok) {
        const message = (body && typeof body === 'object' ? (body as Record<string, unknown>).message : null) as string | null;
        setError(message || 'Failed to diagnose this chapter.');
        return;
      }
      setDiagnoseData(data);
      onDiagnoseReady?.({ riskLevel: data.riskLevel, weakTags: data.weakTags ?? [] });
    } catch {
      setError('Network error while running diagnosis.');
    } finally {
      setLoadingDiagnose(false);
    }
  }

  async function buildRemediation() {
    setLoadingRemediate(true);
    setError(null);
    try {
      const response = await fetch('/api/chapter-remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId,
          weakTags: diagnoseData?.weakTags ?? [],
          availableDays: 7,
          dailyMinutes: 45,
        }),
      });
      const body = await response.json().catch(() => ({}));
      const data = unwrapApiPayload<ChapterRemediateData>(body);
      if (!response.ok) {
        const message = (body && typeof body === 'object' ? (body as Record<string, unknown>).message : null) as string | null;
        setError(message || 'Failed to build remediation plan.');
        return;
      }
      setRemediateData(data);
    } catch {
      setError('Network error while building remediation plan.');
    } finally {
      setLoadingRemediate(false);
    }
  }

  const totalDrillQuestions =
    (drillData?.questions?.length ?? 0) +
    (drillData?.shortQuestions?.length ?? 0) +
    (drillData?.longQuestions?.length ?? 0);

  const nextFlowStep: 'drill' | 'diagnose' | 'revision' = !drillData
    ? 'drill'
    : !diagnoseData
      ? 'diagnose'
      : 'revision';

  return (
    <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="flex items-center gap-2 font-fraunces text-lg font-bold text-navy-700 dark:text-slate-100">
          <BrainCircuit className="w-5 h-5 text-indigo-500" />
          Chapter Intelligence
        </h3>
        <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
          Class {classLevel} {subject}
        </span>
      </div>

      <p className="mb-4 text-xs text-[#6A6A84] dark:text-slate-300">
        Custom chapter workflow for {chapterTitle}: build context pack, generate drill, diagnose weakness, and get remediation plan.
      </p>

      <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-100">
        <p className="font-semibold text-sky-800 dark:text-sky-100">Practice Quiz vs Chapter Intelligence</p>
        <p className="mt-1">Practice Quiz is quick MCQ practice. Chapter Intelligence Drill is deeper and can generate MCQ, short-answer, long-answer, or mixed sets for structured revision.</p>
      </div>

      <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs dark:border-emerald-500/40 dark:bg-emerald-500/20">
        <p className="font-semibold text-emerald-900 dark:text-emerald-100">Study Flow: Quiz {'->'} Drill {'->'} Diagnose {'->'} Revision</p>
        <p className="mt-1 text-emerald-700 dark:text-emerald-200">
          {nextFlowStep === 'drill'
            ? 'Step 2 pending: generate chapter drill set.'
            : nextFlowStep === 'diagnose'
              ? 'Step 3 pending: run diagnosis on this chapter.'
              : 'Step 4 ready: continue to Revision Hub for weekly planning.'}
        </p>
        <div className="mt-2">
          {nextFlowStep === 'drill' ? (
            <button
              onClick={generateDrill}
              disabled={loadingDrill}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loadingDrill ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
              One-click next: Generate Drill
            </button>
          ) : nextFlowStep === 'diagnose' ? (
            <button
              onClick={runDiagnosis}
              disabled={loadingDiagnose}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {loadingDiagnose ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              One-click next: Diagnose
            </button>
          ) : (
            <Link
              href={`/student/revision?chapter=${encodeURIComponent(chapterId)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-slate-900 dark:text-emerald-100 dark:hover:bg-emerald-500/20"
            >
              <Target className="h-3.5 w-3.5" />
              One-click next: Open Revision Hub
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-2.5 py-2 text-xs text-red-700 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-100">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={generatePack}
          disabled={loadingPack}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold px-3 py-2 disabled:opacity-60"
        >
          {loadingPack ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Chapter Pack
        </button>

        <button
          onClick={runDiagnosis}
          disabled={loadingDiagnose}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-2 disabled:opacity-60"
        >
          {loadingDiagnose ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          Diagnose
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="text-[11px] text-[#6A6A84] font-semibold">Drill:</label>
        <select
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value)}
          className="rounded-lg border border-[#E8E4DC] bg-white px-2 py-1.5 text-xs text-[#4A4A6A] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          <option value="easy-heavy">Easy-heavy</option>
          <option value="mixed">Mixed</option>
          <option value="hard-heavy">Hard-heavy</option>
        </select>
        <select
          value={questionType}
          onChange={(event) => setQuestionType(event.target.value as 'mcq' | 'short' | 'long' | 'mixed')}
          className="rounded-lg border border-[#E8E4DC] bg-white px-2 py-1.5 text-xs text-[#4A4A6A] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          <option value="mcq">MCQ only</option>
          <option value="short">Short answers</option>
          <option value="long">Long answers</option>
          <option value="mixed">Mixed (MCQ + Short + Long)</option>
        </select>
        <select
          value={questionCount}
          onChange={(event) => setQuestionCount(Number(event.target.value))}
          className="rounded-lg border border-[#E8E4DC] bg-white px-2 py-1.5 text-xs text-[#4A4A6A] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          <option value={6}>6Q</option>
          <option value={8}>8Q</option>
          <option value={10}>10Q</option>
          <option value={12}>12Q</option>
          <option value={16}>16Q</option>
          <option value={20}>20Q</option>
        </select>
        <button
          onClick={generateDrill}
          disabled={loadingDrill}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2.5 py-1.5 disabled:opacity-60"
        >
          {loadingDrill ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardList className="w-3.5 h-3.5" />}
          Generate
        </button>
      </div>

      <button
        onClick={buildRemediation}
        disabled={loadingRemediate}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-2 mb-4 disabled:opacity-60"
      >
        {loadingRemediate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Target className="w-3.5 h-3.5" />}
        Build 7-Day Remediation Plan
      </button>

      {packData && (
        <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3 dark:border-indigo-400/40 dark:bg-indigo-500/20">
          <div className="mb-1 text-xs font-semibold text-indigo-800 dark:text-indigo-100">High-yield topics</div>
          <div className="text-xs text-indigo-700 dark:text-indigo-200">{packData.highYieldTopics.slice(0, 5).join(' | ')}</div>
          <div className="mb-1 mt-2 text-xs font-semibold text-indigo-800 dark:text-indigo-100">Common mistakes</div>
          <div className="text-xs text-indigo-700 dark:text-indigo-200">{packData.commonMistakes.slice(0, 2).join(' | ')}</div>
        </div>
      )}

      {drillData && (
        <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-400/40 dark:bg-emerald-500/20">
          <div className="mb-1 text-xs font-semibold text-emerald-800 dark:text-emerald-100">
            Drill ready: {totalDrillQuestions} questions
            {' '}({drillData.questionType ?? 'mixed'}, {drillData.difficulty})
          </div>
          <div className="max-h-56 overflow-y-auto pr-1 space-y-2">
            {drillData.questions.map((question, index) => (
              <div key={`${index}-${question.question.slice(0, 40)}`} className="text-xs text-emerald-700 dark:text-emerald-200">
                <p className="font-semibold">MCQ {index + 1}. {question.question}</p>
                {question.ragMeta && (
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                    <span className="rounded-full border border-emerald-200 bg-emerald-100/60 px-1.5 py-0.5 text-emerald-800">
                      {question.ragMeta.pyqTag === 'asked-before'
                        ? 'Asked before'
                        : question.ragMeta.pyqTag === 'pyq-inspired'
                          ? 'PYQ-inspired'
                          : 'Fresh'}
                    </span>
                    {Array.isArray(question.ragMeta.years) && question.ragMeta.years.length > 0 && (
                      <span className="rounded-full border border-sky-200 bg-sky-100/70 px-1.5 py-0.5 text-sky-800">
                        Years: {question.ragMeta.years.slice(0, 2).join(', ')}
                      </span>
                    )}
                    {question.ragMeta.qualityBand && (
                      <span className="rounded-full border border-violet-200 bg-violet-100/70 px-1.5 py-0.5 text-violet-800">
                        Quality: {question.ragMeta.qualityBand}
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-1 text-[11px] text-emerald-600">
                  {question.options.map((option, optionIndex) => (
                    <p key={`${index}-${optionIndex}-${option.slice(0, 24)}`}>
                      {String.fromCharCode(65 + optionIndex)}. {option}
                    </p>
                  ))}
                </div>
              </div>
            ))}
            {(drillData.shortQuestions ?? []).map((question, index) => (
              <div key={`short-${index}-${question.slice(0, 30)}`} className="text-xs text-emerald-700 dark:text-emerald-200">
                <p className="font-semibold">Short {index + 1}. {question}</p>
              </div>
            ))}
            {(drillData.longQuestions ?? []).map((question, index) => (
              <div key={`long-${index}-${question.slice(0, 30)}`} className="text-xs text-emerald-700 dark:text-emerald-200">
                <p className="font-semibold">Long {index + 1}. {question}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {diagnoseData && (
        <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50 p-3 dark:border-amber-400/40 dark:bg-amber-500/20">
          <div className="mb-1 text-xs font-semibold text-amber-800 dark:text-amber-100">
            Risk: {diagnoseData.riskLevel.toUpperCase()}
          </div>
          <div className="mb-1 text-xs text-amber-700 dark:text-amber-200">
            Weak tags: {diagnoseData.weakTags.slice(0, 3).join(' | ')}
          </div>
          <div className="text-xs text-amber-700 dark:text-amber-200">
            Next: {diagnoseData.nextActions.slice(0, 2).join(' | ')}
          </div>
        </div>
      )}

      {remediateData && (
        <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 dark:border-sky-400/40 dark:bg-sky-500/20">
          <div className="mb-1 text-xs font-semibold text-sky-800 dark:text-sky-100">
            Expected lift: {remediateData.expectedScoreLift}
          </div>
          <div className="space-y-1">
            {remediateData.dayPlan.slice(0, 3).map((day) => (
              <p key={`${day.day}-${day.focus}`} className="text-xs text-sky-700 dark:text-sky-200">
                Day {day.day}: {day.focus}
              </p>
            ))}
          </div>
          <div className="mt-1 text-xs text-sky-700 dark:text-sky-200">
            Topics baseline: {chapterTopics.slice(0, 3).join(' | ')}
          </div>
        </div>
      )}
    </div>
  );
}
