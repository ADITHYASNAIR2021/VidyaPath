'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, ArrowRight, Award, Trophy, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface Quiz {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
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

  if (!question || options.length !== 4 || Number.isNaN(answer) || answer < 0 || answer > 3) {
    return null;
  }

  return {
    question,
    options,
    correctAnswerIndex: answer,
    explanation,
  };
}

export default function QuizEngine({ chapterId, quizzes: initialQuizzes, subject, chapterTitle }: { chapterId: string; quizzes: Quiz[]; subject?: string; chapterTitle?: string; }) {
  const [quizzes, setQuizzes] = useState<Quiz[]>(initialQuizzes);
  const [studentAiEnabled, setStudentAiEnabled] = useState<boolean | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load previous best score
  useEffect(() => {
    const saved = localStorage.getItem(`quiz-score-[${chapterId}]`);
    if (saved) setBestScore(parseInt(saved, 10));
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
        if (active) setStudentAiEnabled(['student', 'teacher', 'admin', 'developer'].includes(role));
      })
      .catch(() => {
        if (active) setStudentAiEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!quizzes || quizzes.length === 0) return null;

  const handleGenerateValues = async () => {
    setIsGenerating(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, subject, chapterTitle })
      });

      const data = await res.json();
      const payload = (data && typeof data === 'object' && 'data' in data && data.data && typeof data.data === 'object')
        ? (data.data as Record<string, unknown>)
        : (data as Record<string, unknown>);

      if (!res.ok) {
        setStatusMessage(String((data as Record<string, unknown>)?.message || (data as Record<string, unknown>)?.error || 'AI quiz generation failed.'));
        return;
      }

      if (payload.success === true && Array.isArray(payload.data) && payload.data.length > 0) {
        const newQuizzes = payload.data.map((q: unknown) => toQuiz(q)).filter((q: Quiz | null): q is Quiz => q !== null);
        if (newQuizzes.length === 0) {
          setStatusMessage('AI returned invalid quiz data. Please try again.');
          return;
        }
        setQuizzes(newQuizzes);
        resetQuiz();
        setStatusMessage('A fresh quiz was generated.');
      } else {
        setStatusMessage(`Failed to generate: ${String(payload.message || payload.error || 'Unknown error')}`);
      }
    } catch {
      setStatusMessage('Error contacting AI endpoint.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelect = (idx: number) => {
    if (showAnswer) return;
    setSelectedOption(idx);
    setShowAnswer(true);

    const isCorrect = idx === quizzes[currentQ].correctAnswerIndex;
    if (isCorrect) setScore(s => s + 1);
  };

  const handleNext = () => {
    if (currentQ < quizzes.length - 1) {
      setCurrentQ(c => c + 1);
      setSelectedOption(null);
      setShowAnswer(false);
    } else {
      setFinished(true);
      const newScore = Math.round((score / quizzes.length) * 100);
      if (!bestScore || newScore > bestScore) {
        localStorage.setItem(`quiz-score-[${chapterId}]`, newScore.toString());
        setBestScore(newScore);
      }
    }
  };

  const resetQuiz = () => {
    setCurrentQ(0);
    setSelectedOption(null);
    setShowAnswer(false);
    setScore(0);
    setFinished(false);
  };

  if (finished) {
    const finalPercentage = Math.round((score / quizzes.length) * 100);
    return (
      <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-8 text-center mb-5 relative overflow-hidden">
        {statusMessage && <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>}
        <div className="absolute top-0 left-0 w-full h-2 bg-gray-100">
          <div className="h-full bg-saffron-500" style={{ width: '100%' }} />
        </div>
        <div className="w-16 h-16 bg-saffron-100 rounded-full flex items-center justify-center mx-auto mb-4">
          {finalPercentage >= 80 ? (
            <Trophy className="w-8 h-8 text-saffron-500" />
          ) : (
            <Award className="w-8 h-8 text-saffron-500" />
          )}
        </div>
        <h2 className="font-fraunces text-2xl font-bold text-navy-700 mb-2">Quiz Completed!</h2>
        <div className="text-4xl font-bold text-saffron-500 mb-2">{finalPercentage}%</div>
        <p className="text-sm text-[#8A8AAA] mb-6">You got {score} out of {quizzes.length} correct.</p>
        
        {bestScore !== null && (
          <div className="text-xs font-semibold text-emerald-600 bg-emerald-50 max-w-max mx-auto px-3 py-1.5 rounded-full mb-6 border border-emerald-200">
            Highest Score: {Math.max(finalPercentage, bestScore)}%
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <button 
            onClick={resetQuiz}
            type="button"
            className="inline-flex items-center gap-2 bg-navy-700 hover:bg-navy-800 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Retake Quiz
          </button>
          <button 
            onClick={handleGenerateValues}
            type="button"
            disabled={isGenerating || studentAiEnabled === false}
            className="inline-flex items-center gap-2 bg-saffron-50 border border-saffron-200 text-saffron-700 hover:bg-saffron-100 px-4 py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-50"
          >
            {studentAiEnabled === false ? 'Login Needed' : isGenerating ? 'Generating...' : 'Generate New Test'}
          </button>
        </div>
      </div>
    );
  }

  const q = quizzes[currentQ];

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-6 mb-5 relative overflow-hidden">
      {statusMessage && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">{statusMessage}</p>}
      {/* Progress Bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gray-100">
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

      <div className="flex items-center justify-between mb-6 pt-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-saffron-600 bg-saffron-50 px-3 py-1.5 rounded-lg border border-saffron-100">
            <Award className="w-4 h-4" />
            Quick Quiz
          </div>
          <button 
            onClick={handleGenerateValues}
            type="button"
            disabled={isGenerating || studentAiEnabled === false}
            className="flex items-center gap-2 text-xs font-semibold text-navy-600 bg-navy-50 hover:bg-navy-100 px-3 py-1.5 rounded-lg border border-navy-100 transition-colors disabled:opacity-50"
          >
            {studentAiEnabled === false ? 'Login for AI' : isGenerating ? 'AI Thinking...' : 'AI Generate'}
          </button>
        </div>
        <div className="text-xs font-bold text-[#8A8AAA] tracking-widest uppercase">
          Question {currentQ + 1} of {quizzes.length}
        </div>
      </div>

      <h3 className="text-lg font-semibold text-navy-700 mb-6">{q.question}</h3>

      <div className="space-y-3">
        {q.options.map((opt, idx) => {
          const isSelected = selectedOption === idx;
          const isCorrectIndex = q.correctAnswerIndex === idx;
          
          let stateClass = 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 bg-white text-navy-700';
          if (showAnswer) {
            if (isCorrectIndex) {
              stateClass = 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500 z-10';
            } else if (isSelected) {
              stateClass = 'border-red-300 bg-red-50 text-red-800';
            } else {
              stateClass = 'border-gray-100 bg-gray-50 text-gray-400 opacity-60';
            }
          }

          return (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              type="button"
              disabled={showAnswer}
              className={clsx(
                'w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-start gap-3 relative',
                stateClass
              )}
            >
              <div className={clsx(
                'w-5 h-5 rounded-full border shrink-0 mt-0.5 flex items-center justify-center',
                showAnswer && isCorrectIndex ? 'border-emerald-500 bg-emerald-500 text-white' : 
                showAnswer && isSelected && !isCorrectIndex ? 'border-red-500 bg-red-500 text-white' :
                'border-gray-300'
              )}>
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
            <div className={clsx(
              "p-4 rounded-xl border text-sm",
              selectedOption === q.correctAnswerIndex ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
            )}>
              <div className="font-bold mb-1">
                {selectedOption === q.correctAnswerIndex ? 'Correct!' : 'Incorrect.'}
              </div>
              {q.explanation && <div className="opacity-90">{q.explanation}</div>}
              {selectedOption !== q.correctAnswerIndex && studentAiEnabled === false && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Login to get AI explanations and adaptive hints for wrong answers.
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button 
                onClick={handleNext}
                type="button"
                className="flex items-center gap-2 bg-saffron-500 hover:bg-saffron-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors"
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
