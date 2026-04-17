'use client';

import { useState, useEffect, useCallback } from 'react';
import { Play, Pause, RotateCcw, Coffee, BookOpen, Volume2, VolumeX } from 'lucide-react';
import clsx from 'clsx';

interface PomodoroTimerProps {
  chapterTitle?: string;
  pyqStats?: {
    avgMarks: number;
    importantTopics: string[];
    yearsAsked: number[];
  } | null;
}

export default function PomodoroTimer({ chapterTitle, pyqStats }: PomodoroTimerProps) {
  const recommendedFocusMinutes = pyqStats
    ? pyqStats.avgMarks >= 9 ? 35 : pyqStats.avgMarks >= 7 ? 30 : 25
    : 25;

  const [focusMinutes, setFocusMinutes] = useState(recommendedFocusMinutes);
  const [timeLeft, setTimeLeft] = useState(recommendedFocusMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [soundEnabled, setSoundEnabled] = useState(true);

  const playSound = useCallback(() => {
    if (!soundEnabled) return;
    const ctx = new window.AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }, [soundEnabled]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((value) => value - 1), 1000);
    } else if (isRunning && timeLeft === 0) {
      setIsRunning(false);
      playSound();
      if (mode === 'focus') {
        setMode('break');
        setTimeLeft(5 * 60);
      } else {
        setMode('focus');
        setTimeLeft(focusMinutes * 60);
      }
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, mode, focusMinutes, playSound]);

  const toggleTimer = () => setIsRunning(!isRunning);
  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(mode === 'focus' ? focusMinutes * 60 : 5 * 60);
  };

  const switchMode = (nextMode: 'focus' | 'break') => {
    setMode(nextMode);
    setIsRunning(false);
    setTimeLeft(nextMode === 'focus' ? focusMinutes * 60 : 5 * 60);
  };

  const applyRecommendedSession = () => {
    setFocusMinutes(recommendedFocusMinutes);
    if (mode === 'focus') {
      setIsRunning(false);
      setTimeLeft(recommendedFocusMinutes * 60);
    }
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const progress = mode === 'focus'
    ? ((focusMinutes * 60 - timeLeft) / (focusMinutes * 60)) * 100
    : ((5 * 60 - timeLeft) / (5 * 60)) * 100;

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm mb-5 overflow-hidden">
      {pyqStats && chapterTitle && (
        <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50">
          <p className="text-xs font-semibold text-indigo-800">
            High-Yield Session
          </p>
          <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">
            {pyqStats.importantTopics[0] ?? chapterTitle} - avg {pyqStats.avgMarks} marks - asked in {pyqStats.yearsAsked.length} years
          </p>
          <button
            onClick={applyRecommendedSession}
            type="button"
            className="mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            Use {recommendedFocusMinutes}m focus plan
          </button>
        </div>
      )}

      <div className="flex border-b border-[#E8E4DC]">
        <button
          onClick={() => switchMode('focus')}
          type="button"
          aria-pressed={mode === 'focus' ? 'true' : 'false'}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors',
            mode === 'focus' ? 'text-saffron-600 bg-saffron-50 border-b-2 border-saffron-500' : 'text-[#8A8AAA] hover:bg-gray-50'
          )}
        >
          <BookOpen className="w-4 h-4" /> Focus
        </button>
        <button
          onClick={() => switchMode('break')}
          type="button"
          aria-pressed={mode === 'break' ? 'true' : 'false'}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors',
            mode === 'break' ? 'text-emerald-600 bg-emerald-50 border-b-2 border-emerald-500' : 'text-[#8A8AAA] hover:bg-gray-50'
          )}
        >
          <Coffee className="w-4 h-4" /> Break
        </button>
      </div>

      <div className="p-6 flex flex-col items-center relative">
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          type="button"
          className="absolute top-4 right-4 p-1.5 text-[#8A8AAA] hover:bg-gray-100 rounded-lg transition-colors"
          title={soundEnabled ? 'Mute alarm' : 'Enable alarm'}
          aria-label={soundEnabled ? 'Mute timer alarm' : 'Enable timer alarm'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        <div className="relative w-32 h-32 flex items-center justify-center rounded-full mb-6">
          <svg className="absolute w-full h-full -rotate-90">
            <circle cx="64" cy="64" r="60" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-gray-100" />
            <circle
              cx="64"
              cy="64"
              r="60"
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              strokeDasharray={377}
              strokeDashoffset={377 - (377 * progress) / 100}
              strokeLinecap="round"
              className={clsx('transition-all duration-1000', mode === 'focus' ? 'text-saffron-500' : 'text-emerald-500')}
            />
          </svg>
          <div className="font-jetbrains-mono text-3xl font-bold text-navy-700 tabular-nums">
            {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {mode} timer {mins} minutes {secs} seconds remaining
          </span>
        </div>

        {mode === 'focus' && (
          <div className="w-full grid grid-cols-3 gap-2 mb-3">
            {[25, 30, 35].map((minutes) => (
              <button
                key={minutes}
                onClick={() => {
                  setFocusMinutes(minutes);
                  setIsRunning(false);
                  setTimeLeft(minutes * 60);
                }}
                type="button"
                aria-pressed={focusMinutes === minutes ? 'true' : 'false'}
                className={clsx(
                  'text-xs font-semibold py-1.5 rounded-lg border transition-colors',
                  focusMinutes === minutes
                    ? 'bg-saffron-100 border-saffron-300 text-saffron-700'
                    : 'bg-white border-gray-200 text-[#4A4A6A] hover:bg-gray-50'
                )}
              >
                {minutes}m
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 w-full">
          <button
            onClick={toggleTimer}
            type="button"
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-all active:scale-95 shadow-sm',
              mode === 'focus' ? 'bg-saffron-500 hover:bg-saffron-600' : 'bg-emerald-500 hover:bg-emerald-600'
            )}
            aria-label={isRunning ? 'Pause timer' : 'Start timer'}
          >
            {isRunning ? <><Pause className="w-5 h-5" /> Pause</> : <><Play className="w-5 h-5" /> Start</>}
          </button>
          <button
            onClick={resetTimer}
            type="button"
            className="w-12 h-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-[#4A4A6A] rounded-xl transition-all active:scale-95 shrink-0"
            title="Reset Timer"
            aria-label="Reset timer"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
