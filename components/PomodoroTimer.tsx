'use client';

import { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Coffee, BookOpen, Volume2, VolumeX } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';

export default function PomodoroTimer() {
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 mins by default
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Play a soft beep when timer hits 0
  const playSound = () => {
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
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    } else if (isRunning && timeLeft === 0) {
      setIsRunning(false);
      playSound();
      // Auto switch modes
      if (mode === 'focus') {
        setMode('break');
        setTimeLeft(5 * 60);
      } else {
        setMode('focus');
        setTimeLeft(25 * 60);
      }
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, mode, soundEnabled]);

  const toggleTimer = () => setIsRunning(!isRunning);
  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(mode === 'focus' ? 25 * 60 : 5 * 60);
  };

  const switchMode = (m: 'focus' | 'break') => {
    setMode(m);
    setIsRunning(false);
    setTimeLeft(m === 'focus' ? 25 * 60 : 5 * 60);
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const progress = mode === 'focus' 
    ? ((25 * 60 - timeLeft) / (25 * 60)) * 100 
    : ((5 * 60 - timeLeft) / (5 * 60)) * 100;

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm mb-5 overflow-hidden">
      {/* Header Tabs */}
      <div className="flex border-b border-[#E8E4DC]">
        <button
          onClick={() => switchMode('focus')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors',
            mode === 'focus' ? 'text-saffron-600 bg-saffron-50 border-b-2 border-saffron-500' : 'text-[#8A8AAA] hover:bg-gray-50'
          )}
        >
          <BookOpen className="w-4 h-4" /> Focus
        </button>
        <button
          onClick={() => switchMode('break')}
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
          className="absolute top-4 right-4 p-1.5 text-[#8A8AAA] hover:bg-gray-100 rounded-lg transition-colors"
          title={soundEnabled ? 'Mute alarm' : 'Enable alarm'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Circular Progress & Time */}
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
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 w-full">
          <button
            onClick={toggleTimer}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition-all active:scale-95 shadow-sm',
              mode === 'focus' ? 'bg-saffron-500 hover:bg-saffron-600' : 'bg-emerald-500 hover:bg-emerald-600'
            )}
          >
            {isRunning ? <><Pause className="w-5 h-5" /> Pause</> : <><Play className="w-5 h-5" /> Start</>}
          </button>
          <button
            onClick={resetTimer}
            className="w-12 h-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-[#4A4A6A] rounded-xl transition-all active:scale-95 shrink-0"
            title="Reset Timer"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
