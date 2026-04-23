'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Timer, X, Play, Pause, RotateCcw, Coffee, BookOpen, Volume2, VolumeX } from 'lucide-react';
import clsx from 'clsx';

interface FloatingPomodoroProps {
  chapterTitle?: string;
  pyqStats?: {
    avgMarks: number;
    importantTopics: string[];
    yearsAsked: number[];
  } | null;
}

export default function FloatingPomodoro({ chapterTitle, pyqStats }: FloatingPomodoroProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Timer state
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
      interval = setInterval(() => setTimeLeft((v) => v - 1), 1000);
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

  // Close popup on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggleTimer = () => setIsRunning((r) => !r);
  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(mode === 'focus' ? focusMinutes * 60 : 5 * 60);
  };
  const switchMode = (nextMode: 'focus' | 'break') => {
    setMode(nextMode);
    setIsRunning(false);
    setTimeLeft(nextMode === 'focus' ? focusMinutes * 60 : 5 * 60);
  };
  const applyRecommended = () => {
    setFocusMinutes(recommendedFocusMinutes);
    if (mode === 'focus') { setIsRunning(false); setTimeLeft(recommendedFocusMinutes * 60); }
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const progress = mode === 'focus'
    ? ((focusMinutes * 60 - timeLeft) / (focusMinutes * 60)) * 100
    : ((5 * 60 - timeLeft) / (5 * 60)) * 100;

  const timeDisplay = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const isExamRoute = pathname.startsWith('/exam/');
  const isChapterRoute = pathname.startsWith('/chapters/');

  if (isExamRoute) return null;
  if (!chapterTitle && isChapterRoute) return null;

  return (
    <div ref={popupRef} className="fixed bottom-36 right-4 md:bottom-24 md:right-6 z-[148] flex flex-col items-end gap-3">
      {/* Popup panel */}
      {open && (
        <div className="w-72 sm:w-80 bg-white rounded-2xl border border-[#E8E4DC] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E4DC]">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-saffron-500" />
              <span className="text-sm font-semibold text-navy-700">Study Timer</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-[#8A8AAA] transition-colors"
              aria-label="Close timer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* PYQ banner */}
          {pyqStats && chapterTitle && (
            <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50">
              <p className="text-xs font-semibold text-indigo-800">High-Yield Session</p>
              <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">
                {pyqStats.importantTopics[0] ?? chapterTitle} · avg {pyqStats.avgMarks} marks · {pyqStats.yearsAsked.length} yrs
              </p>
              <button
                onClick={applyRecommended}
                type="button"
                className="mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                Use {recommendedFocusMinutes}m focus plan
              </button>
            </div>
          )}

          {/* Mode tabs */}
          <div className="flex border-b border-[#E8E4DC]">
            <button
              onClick={() => switchMode('focus')}
              type="button"
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors',
                mode === 'focus' ? 'text-saffron-600 bg-saffron-50 border-b-2 border-saffron-500' : 'text-[#8A8AAA] hover:bg-gray-50'
              )}
            >
              <BookOpen className="w-3.5 h-3.5" /> Focus
            </button>
            <button
              onClick={() => switchMode('break')}
              type="button"
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors',
                mode === 'break' ? 'text-emerald-600 bg-emerald-50 border-b-2 border-emerald-500' : 'text-[#8A8AAA] hover:bg-gray-50'
              )}
            >
              <Coffee className="w-3.5 h-3.5" /> Break
            </button>
          </div>

          {/* Timer body */}
          <div className="p-5 flex flex-col items-center">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              type="button"
              className="self-end p-1.5 text-[#8A8AAA] hover:bg-gray-100 rounded-lg transition-colors mb-2"
              aria-label={soundEnabled ? 'Mute alarm' : 'Enable alarm'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* SVG circle */}
            <div className="relative w-28 h-28 flex items-center justify-center rounded-full mb-5">
              <svg className="absolute w-full h-full -rotate-90">
                <circle cx="56" cy="56" r="52" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-gray-100" />
                <circle
                  cx="56" cy="56" r="52"
                  stroke="currentColor" strokeWidth="6" fill="transparent"
                  strokeDasharray={327}
                  strokeDashoffset={327 - (327 * progress) / 100}
                  strokeLinecap="round"
                  className={clsx('transition-all duration-1000', mode === 'focus' ? 'text-saffron-500' : 'text-emerald-500')}
                />
              </svg>
              <div className="font-jetbrains-mono text-2xl font-bold text-navy-700 tabular-nums">
                {timeDisplay}
              </div>
              <span className="sr-only" role="status" aria-live="polite">
                {mode} timer {mins} minutes {secs} seconds remaining
              </span>
            </div>

            {/* Duration presets */}
            {mode === 'focus' && (
              <div className="w-full grid grid-cols-3 gap-2 mb-3">
                {[25, 30, 35].map((m) => (
                  <button
                    key={m}
                    onClick={() => { setFocusMinutes(m); setIsRunning(false); setTimeLeft(m * 60); }}
                    type="button"
                    className={clsx(
                      'text-xs font-semibold py-1.5 rounded-lg border transition-colors',
                      focusMinutes === m
                        ? 'bg-saffron-100 border-saffron-300 text-saffron-700'
                        : 'bg-white border-gray-200 text-[#4A4A6A] hover:bg-gray-50'
                    )}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={toggleTimer}
                type="button"
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-white transition-all active:scale-95 shadow-sm',
                  mode === 'focus' ? 'bg-saffron-500 hover:bg-saffron-600' : 'bg-emerald-500 hover:bg-emerald-600'
                )}
                aria-label={isRunning ? 'Pause timer' : 'Start timer'}
              >
                {isRunning ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Start</>}
              </button>
              <button
                onClick={resetTimer}
                type="button"
                className="w-11 h-11 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-[#4A4A6A] rounded-xl transition-all active:scale-95 shrink-0"
                aria-label="Reset timer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'w-14 h-14 rounded-full text-white shadow-lg flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95',
          isRunning
            ? 'bg-saffron-500 hover:bg-saffron-600 ring-2 ring-saffron-300 ring-offset-1'
            : 'bg-saffron-500 hover:bg-saffron-600',
          open && 'bg-saffron-600'
        )}
        aria-label={open ? 'Close study timer' : 'Open study timer'}
      >
        <Timer className="w-5 h-5" />
        {isRunning && (
          <span className="font-jetbrains-mono text-[9px] leading-none tabular-nums font-bold">
            {timeDisplay}
          </span>
        )}
      </button>
    </div>
  );
}
