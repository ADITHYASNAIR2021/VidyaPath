'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, ArrowRight, Award, Trophy, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface Quiz {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
  ragMeta?: {
    pyqTag: 'asked-before' | 'pyq-inspired' | 'new';
    years?: number[];
    qualityBand?: 'high' | 'medium' | 'baseline';
    qualityScore?: number;
  };
}

interface QuizOutcome {
  question: string;
  correct: boolean;
}

function toQuiz(item: unknown): Quiz | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const question = typeof record.question === 'string' ? record.question.trim() : '';
  const options = Array.isArray(record.options)
    ? record.options.filter((option): option is string => typeof option === 'string').map((option) => option.trim())
    : [];
  const answer = typeof record.answer === 'number' ? record.answer : Number(record.answer);
  const explanation = typeof record.explanation === 'string' ? record.explanation : undefined;
  const ragMeta = record.ragMeta && typeof record.ragMeta === 'object' ? (record.ragMeta as Quiz['ragMeta']) : undefined;

  if (!question || options.length < 4 || options.length > 5 || Number.isNaN(answer) || answer < 0 || answer >= options.length) {
    return null;
  }

  return {
    question,
    options,
    correctAnswerIndex: answer,
    explanation,
    ragMeta,
  };
}

export default function QuizEngine({
  chapterId,
  quizzes: initialQuizzes,
  subject,
  chapterTitle,
  onQuizReady,
  onRegisterGenerateAction,
}: {
  chapterId: string;
  quizzes: Quiz[];
  subject?: string;
  chapterTitle?: string;
  onQuizReady?: (payload: { count: number; source: 'existing' | 'generated' }) => void;
  onRegisterGenerateAction?: (action: () => Promise<void>) => void;
}) {
  const [quizzes, setQuizzes] = useState<Quiz[]>(initialQuizzes);
  const [studentAiEnabled, setStudentAiEnabled] = useState<boolean | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [generationStage, setGenerationStage] = useState<'idle' | 'requesting' | 'validating' | 'completed'>('idle');
  const [sessionResults, setSessionResults] = useState<QuizOutcome[]>([]);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(`quiz-score-[${chapterId}]`);
    setBestScore(saved ? parseInt(saved, 10) : null);
  }, [chapterId]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        const data =
          payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
            ? (payload.data as Record<string, unknown>)
            : (payload as Record<string, unknown> | null);
        const role = typeof data?.role === 'string' ? data.role : '';
        if (active) setStudentAiEnabled(['student', 'teacher', 'admin', 'developer'].includes(role));
      })
      .catch(() => {
        if (active) setStudentAiEnabled(false);
      });
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

  const beginGenerationProgress = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    setGenerationProgress(8);
    progressIntervalRef.current = setInterval(() => {
      setGenerationProgress((value) => {
        if (value >= 92) return value;
        const increment = Math.max(1, Math.round((100 - value) / 10));
        return Math.min(92, value + increment);
      });
    }, 300);
  };

  const finishGenerationProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setGenerationProgress(100);
    setGenerationStage('completed');
    progressTimeoutRef.current = setTimeout(() => {
      setGenerationProgress(0);
      setGenerationStage('idle');
    }, 700);
  };

  const resetQuiz = () => {
    setCurrentQ(0);
    setSelectedOption(null);
    setShowAnswer(false);
    setScore(0);
    setFinished(false);
    setSessionResults([]);
  };

  useEffect(() => {
    setQuizzes(initialQuizzes);
    resetQuiz();
    setStatusMessage(null);
    if (initialQuizzes.length > 0) {
      onQuizReady?.({ count: initialQuizzes.length, source: 'existing' });
    }
  }, [chapterId, initialQuizzes, onQuizReady]);

  const submitQuestionFeedback = async (results: QuizOutcome[]) => {
    if (!chapterId || results.length === 0) return;
    try {
      await fetch('/api/ai/question-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, results }),
      });
    } catch {
      // Ignore silent feedback write failures during quiz completion.
    }
  };

  const handleGenerateValues = async () => {
    const requestedCount = 10;
    setIsGenerating(true);
    setStatusMessage(null);
    setGenerationStage('requesting');
    beginGenerationProgress();
    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, subject, chapterTitle, questionCount: requestedCount }),
      });

      const data = await res.json();
      const payload =
        data && typeof data === 'object' && 'data' in data && data.data && typeof data.data === 'object'
          ? (data.data as Record<string, unknown>)
          : (data as Record<string, unknown>);

      if (!res.ok) {
        setStatusMessage(
          String((data as Record<string, unknown>)?.message || (data as Record<string, unknown>)?.error || 'AI quiz generation failed.')
        );
        return;
      }

      setGenerationStage('validating');
      if (payload.success === true && Array.isArray(payload.data) && payload.data.length > 0) {
        const newQuizzes = payload.data.map((item: unknown) => toQuiz(item)).filter((quiz: Quiz | null): quiz is Quiz => quiz !== null);
        if (newQuizzes.length === 0) {
          setStatusMessage('AI returned invalid quiz data. Please try again.');
          return;
        }
        if (newQuizzes.length !== requestedCount) {
          setStatusMessage(`Generation returned ${newQuizzes.length}/${requestedCount} questions. Please retry.`);
          return;
        }
        setQuizzes(newQuizzes);
        resetQuiz();
        onQuizReady?.({ count: newQuizzes.length, source: 'generated' });
        setStatusMessage(`A fresh quiz was generated (${newQuizzes.length}/${requestedCount}).`);
      } else {
        setStatusMessage(`Failed to generate: ${String(payload.message || payload.error || 'Unknown error')}`);
      }
    } catch {
      setStatusMessage('Error contacting AI endpoint.');
    } finally {
      setIsGenerating(false);
      finishGenerationProgress();
    }
  };

  useEffect(() => {
    onRegisterGenerateAction?.(handleGenerateValues);
  }, [onRegisterGenerateAction, handleGenerateValues]);

  if (!quizzes || quizzes.length === 0) {
    return (
      <div className="mb-5 flex flex-col items-center rounded-2xl border border-[#E8E4DC] bg-[#FDFAF6] p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {statusMessage && (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100" role="alert">
            {statusMessage}
          </p>
        )}
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-saffron-100 dark:bg-saffron-500/25">
          <Award className="w-7 h-7 text-saffron-500" />
        </div>
        <h2 className="mb-2 font-fraunces text-lg font-bold text-navy-700 dark:text-slate-100">No quiz yet</h2>
        <p className="mb-5 max-w-sm text-sm text-[#8A8AAA] dark:text-slate-300">
          Generate an AI-powered quiz for this chapter to test your understanding.
        </p>
        <button
          onClick={handleGenerateValues}
          type="button"
          disabled={isGenerating || studentAiEnabled === false}
          className="inline-flex items-center gap-2 rounded-xl bg-saffron-500 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-saffron-600 disabled:opacity-50"
        >
          <Award className="w-4 h-4" />
          {studentAiEnabled === false ? 'Login to Generate Quiz' : isGenerating ? 'Generating...' : 'Generate Quiz via AI'}
        </button>
        {isGenerating && (
          <div className="mt-4 w-full max-w-sm rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 dark:border-indigo-500/40 dark:bg-indigo-500/20">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-indigo-700 dark:text-indigo-200">
              <span>
                {generationStage === 'requesting'
                  ? 'Generating quiz'
                  : generationStage === 'validating'
                    ? 'Validating count'
                    : 'Progress'}
              </span>
              <span>{Math.round(generationProgress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${generationProgress}%` }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleSelect = (index: number) => {
    if (showAnswer) return;
    setSelectedOption(index);
    setShowAnswer(true);

    const isCorrect = index === quizzes[currentQ].correctAnswerIndex;
    setSessionResults((prev) => [
      ...prev,
      {
        question: quizzes[currentQ].question,
        correct: isCorrect,
      },
    ]);
    if (isCorrect) setScore((prev) => prev + 1);
  };

  const handleNext = () => {
    if (currentQ < quizzes.length - 1) {
      setCurrentQ((prev) => prev + 1);
      setSelectedOption(null);
      setShowAnswer(false);
      return;
    }

    setFinished(true);
    void submitQuestionFeedback(sessionResults);
    const newScore = Math.round((score / quizzes.length) * 100);
    if (!bestScore || newScore > bestScore) {
      localStorage.setItem(`quiz-score-[${chapterId}]`, newScore.toString());
      setBestScore(newScore);
    }
  };

  if (finished) {
    const finalPercentage = Math.round((score / quizzes.length) * 100);
    return (
      <div className="relative mb-5 overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {statusMessage && <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>}
        <div className="absolute left-0 top-0 h-2 w-full bg-gray-100 dark:bg-slate-700">
          <div className="h-full bg-saffron-500" style={{ width: '100%' }} />
        </div>

        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-saffron-100 dark:bg-saffron-500/25">
          {finalPercentage >= 80 ? <Trophy className="w-8 h-8 text-saffron-500" /> : <Award className="w-8 h-8 text-saffron-500" />}
        </div>
        <h2 className="mb-2 font-fraunces text-2xl font-bold text-navy-700 dark:text-slate-100">Quiz Completed!</h2>
        <div className="mb-2 text-4xl font-bold text-saffron-500">{finalPercentage}%</div>
        <p className="mb-6 text-sm text-[#8A8AAA] dark:text-slate-300">
          You got {score} out of {quizzes.length} correct.
        </p>

        {bestScore !== null && (
          <div className="mx-auto mb-6 max-w-max rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-100">
            Highest Score: {Math.max(finalPercentage, bestScore)}%
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={resetQuiz}
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-navy-700 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-navy-800 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            <RotateCcw className="w-4 h-4" /> Retake Quiz
          </button>
          <button
            onClick={handleGenerateValues}
            type="button"
            disabled={isGenerating || studentAiEnabled === false}
            className="inline-flex items-center gap-2 rounded-xl border border-saffron-200 bg-saffron-50 px-4 py-2.5 font-semibold text-saffron-700 transition-colors hover:bg-saffron-100 disabled:opacity-50 dark:border-saffron-400/40 dark:bg-saffron-500/20 dark:text-saffron-100 dark:hover:bg-saffron-500/30"
          >
            {studentAiEnabled === false ? 'Login Needed' : isGenerating ? 'Generating...' : 'Generate New Test'}
          </button>
        </div>
      </div>
    );
  }

  const q = quizzes[currentQ];

  return (
    <div className="relative mb-5 overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {statusMessage && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100" role="alert">
          {statusMessage}
        </p>
      )}

      <div className="absolute left-0 top-0 h-1 w-full bg-gray-100 dark:bg-slate-700">
        <div
          className="h-full bg-saffron-500 transition-all duration-300"
          style={{ width: `${(currentQ / quizzes.length) * 100}%` }}
          role="progressbar"
          aria-label="Quiz progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((currentQ / quizzes.length) * 100)}
        />
      </div>

      <div className="mb-6 flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-saffron-100 bg-saffron-50 px-3 py-1.5 text-sm font-semibold text-saffron-600 dark:border-saffron-400/40 dark:bg-saffron-500/20 dark:text-saffron-100">
            <Award className="w-4 h-4" />
            Quick Quiz
          </div>
          <button
            onClick={handleGenerateValues}
            type="button"
            disabled={isGenerating || studentAiEnabled === false}
            className="flex items-center gap-2 rounded-lg border border-navy-100 bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy-600 transition-colors hover:bg-navy-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {studentAiEnabled === false ? 'Login for AI' : isGenerating ? 'AI Thinking...' : 'AI Generate'}
          </button>
        </div>
        <div className="text-xs font-bold uppercase tracking-widest text-[#8A8AAA] dark:text-slate-400">
          Question {currentQ + 1} of {quizzes.length}
        </div>
      </div>

      {isGenerating && (
        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 dark:border-indigo-500/40 dark:bg-indigo-500/20">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-indigo-700 dark:text-indigo-200">
            <span>
              {generationStage === 'requesting'
                ? 'Generating fresh quiz'
                : generationStage === 'validating'
                  ? 'Validating exact count'
                  : 'Progress'}
            </span>
            <span>{Math.round(generationProgress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${generationProgress}%` }} />
          </div>
        </div>
      )}

      <h3 className="mb-2 text-lg font-semibold text-navy-700 dark:text-slate-100">{q.question}</h3>
      {q.ragMeta && (
        <div className="mb-4 flex flex-wrap gap-1 text-[10px]">
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/20 dark:text-indigo-100">
            {q.ragMeta.pyqTag === 'asked-before'
              ? 'Asked in previous exams'
              : q.ragMeta.pyqTag === 'pyq-inspired'
                ? 'PYQ-inspired'
                : 'Fresh pattern'}
          </span>
          {Array.isArray(q.ragMeta.years) && q.ragMeta.years.length > 0 && (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-semibold text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-100">
              Years: {q.ragMeta.years.slice(0, 2).join(', ')}
            </span>
          )}
          {q.ragMeta.qualityBand && (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-semibold text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/20 dark:text-violet-100">
              Quality: {q.ragMeta.qualityBand}
            </span>
          )}
        </div>
      )}

      <div className="space-y-3">
        {q.options.map((opt, idx) => {
          const isSelected = selectedOption === idx;
          const isCorrectIndex = q.correctAnswerIndex === idx;

          let stateClass =
            'border-gray-200 bg-white text-navy-700 hover:border-gray-300 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
          if (showAnswer) {
            if (isCorrectIndex) {
              stateClass = 'z-10 border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500 dark:border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-100';
            } else if (isSelected) {
              stateClass = 'border-red-300 bg-red-50 text-red-800 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-100';
            } else {
              stateClass = 'border-gray-100 bg-gray-50 text-gray-400 opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400';
            }
          }

          return (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              type="button"
              disabled={showAnswer}
              className={clsx('relative flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200', stateClass)}
            >
              <div
                className={clsx(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  showAnswer && isCorrectIndex
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : showAnswer && isSelected && !isCorrectIndex
                      ? 'border-red-500 bg-red-500 text-white'
                      : 'border-gray-300 dark:border-slate-500'
                )}
              >
                {showAnswer && isCorrectIndex && <CheckCircle2 className="w-3.5 h-3.5" />}
                {showAnswer && isSelected && !isCorrectIndex && <XCircle className="w-3.5 h-3.5" />}
              </div>
              <span className="font-medium">{opt}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {showAnswer && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
            className="overflow-hidden"
          >
            <div
              className={clsx(
                'rounded-xl border p-4 text-sm',
                selectedOption === q.correctAnswerIndex
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-100'
                  : 'border-red-200 bg-red-50 text-red-800 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-100'
              )}
            >
              <div className="mb-1 font-bold">{selectedOption === q.correctAnswerIndex ? 'Correct!' : 'Incorrect.'}</div>
              {q.explanation && <div className="opacity-90">{q.explanation}</div>}
              {selectedOption !== q.correctAnswerIndex && studentAiEnabled === false && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100">
                  Login to get AI explanations and adaptive hints for wrong answers.
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleNext}
                type="button"
                className="flex items-center gap-2 rounded-xl bg-saffron-500 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-saffron-600"
              >
                {currentQ < quizzes.length - 1 ? 'Next Question' : 'View Results'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
