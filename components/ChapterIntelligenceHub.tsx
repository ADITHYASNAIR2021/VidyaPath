'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, ClipboardList, Loader2, Sparkles, Target } from 'lucide-react';

interface ChapterIntelligenceHubProps {
  chapterId: string;
  chapterTitle: string;
  subject: string;
  classLevel: number;
  chapterTopics: string[];
  flashcardCount: number;
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
  questions: Array<{
    question: string;
    options: string[];
    answer: number;
    explanation: string;
  }>;
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

  const [difficulty, setDifficulty] = useState('mixed');
  const [questionCount, setQuestionCount] = useState(8);

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

  async function generatePack() {
    setLoadingPack(true);
    setError(null);
    try {
      const response = await fetch('/api/chapter-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Failed to build chapter pack.');
        return;
      }
      setPackData(data as ChapterPackData);
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
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Failed to create chapter drill.');
        return;
      }
      setDrillData(data as ChapterDrillData);
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
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Failed to diagnose this chapter.');
        return;
      }
      setDiagnoseData(data as ChapterDiagnoseData);
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
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Failed to build remediation plan.');
        return;
      }
      setRemediateData(data as ChapterRemediateData);
    } catch {
      setError('Network error while building remediation plan.');
    } finally {
      setLoadingRemediate(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-indigo-500" />
          Chapter Intelligence
        </h3>
        <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
          Class {classLevel} {subject}
        </span>
      </div>

      <p className="text-xs text-[#6A6A84] mb-4">
        Custom chapter workflow for {chapterTitle}: build context pack, generate drill, diagnose weakness, and get remediation plan.
      </p>

      {error && (
        <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">
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
          className="text-xs border border-[#E8E4DC] rounded-lg px-2 py-1.5 bg-white text-[#4A4A6A]"
        >
          <option value="easy-heavy">Easy-heavy</option>
          <option value="mixed">Mixed</option>
          <option value="hard-heavy">Hard-heavy</option>
        </select>
        <select
          value={questionCount}
          onChange={(event) => setQuestionCount(Number(event.target.value))}
          className="text-xs border border-[#E8E4DC] rounded-lg px-2 py-1.5 bg-white text-[#4A4A6A]"
        >
          <option value={6}>6Q</option>
          <option value={8}>8Q</option>
          <option value={10}>10Q</option>
          <option value={12}>12Q</option>
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
        <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
          <div className="text-xs font-semibold text-indigo-800 mb-1">High-yield topics</div>
          <div className="text-xs text-indigo-700">{packData.highYieldTopics.slice(0, 5).join(' | ')}</div>
          <div className="text-xs font-semibold text-indigo-800 mt-2 mb-1">Common mistakes</div>
          <div className="text-xs text-indigo-700">{packData.commonMistakes.slice(0, 2).join(' | ')}</div>
        </div>
      )}

      {drillData && (
        <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
          <div className="text-xs font-semibold text-emerald-800 mb-1">
            Drill ready: {drillData.questions.length} questions ({drillData.difficulty})
          </div>
          <div className="space-y-1">
            {drillData.questions.slice(0, 2).map((question) => (
              <p key={question.question} className="text-xs text-emerald-700">
                - {question.question}
              </p>
            ))}
          </div>
        </div>
      )}

      {diagnoseData && (
        <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-800 mb-1">
            Risk: {diagnoseData.riskLevel.toUpperCase()}
          </div>
          <div className="text-xs text-amber-700 mb-1">
            Weak tags: {diagnoseData.weakTags.slice(0, 3).join(' | ')}
          </div>
          <div className="text-xs text-amber-700">
            Next: {diagnoseData.nextActions.slice(0, 2).join(' | ')}
          </div>
        </div>
      )}

      {remediateData && (
        <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
          <div className="text-xs font-semibold text-sky-800 mb-1">
            Expected lift: {remediateData.expectedScoreLift}
          </div>
          <div className="space-y-1">
            {remediateData.dayPlan.slice(0, 3).map((day) => (
              <p key={`${day.day}-${day.focus}`} className="text-xs text-sky-700">
                Day {day.day}: {day.focus}
              </p>
            ))}
          </div>
          <div className="text-xs text-sky-700 mt-1">
            Topics baseline: {chapterTopics.slice(0, 3).join(' | ')}
          </div>
        </div>
      )}
    </div>
  );
}
