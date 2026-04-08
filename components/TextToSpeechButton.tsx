'use client';

import { useState, useEffect } from 'react';
import { Volume2, Square } from 'lucide-react';
import clsx from 'clsx';

export default function TextToSpeechButton({ textToRead, title = 'Read topics aloud' }: { textToRead: string, title?: string }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if ('speechSynthesis' in window) {
      setSupported(true);
    }
  }, []);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleSpeech = () => {
    if (!supported) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'en-IN'; // Indian English sounds more natural for CBSE terms
    utterance.rate = 0.9; // Slightly slower for better comprehension
    
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  if (!supported) return null;

  return (
    <button
      onClick={toggleSpeech}
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border',
        isSpeaking 
          ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
          : 'bg-[#FDFAF6] text-[#4A4A6A] border-[#E8E4DC] hover:bg-gray-100'
      )}
    >
      {isSpeaking ? (
        <>
          <Square className="w-3.5 h-3.5 fill-current" /> Stop Reading
        </>
      ) : (
        <>
          <Volume2 className="w-3.5 h-3.5" /> {title}
        </>
      )}
    </button>
  );
}
