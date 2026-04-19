'use client';

import { useState } from 'react';
import { MessageSquare, Send, X, ChevronDown, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

interface AskTeacherButtonProps {
  chapterId: string;
  chapterTitle: string;
  subject: string;
  classLevel: 10 | 12;
  topics?: string[];
}

export default function AskTeacherButton({
  chapterId,
  chapterTitle,
  subject,
  classLevel,
  topics = [],
}: AskTeacherButtonProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [topic, setTopic] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || question.trim().length < 5) {
      setError('Please type a question (at least 5 characters).');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/student/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId,
          subject,
          classLevel,
          topic: topic.trim() || undefined,
          question: question.trim(),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message || 'Failed to send. Are you logged in as a student?');
        return;
      }
      setSent(true);
      setQuestion('');
      setTopic('');
      // Auto-close after 3 seconds
      setTimeout(() => { setOpen(false); setSent(false); }, 3000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    setSent(false);
    setError('');
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition-colors"
      >
        <MessageSquare className="h-4 w-4" />
        Ask Your Teacher
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E4DC]">
              <div>
                <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-indigo-600" />
                  Ask Your Teacher
                </h2>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{chapterTitle} · {subject}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            {sent ? (
              <div className="px-5 py-10 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                <p className="font-semibold text-gray-800">Question sent!</p>
                <p className="text-sm text-gray-500 mt-1">Your teacher will answer soon. Check the chapter page for updates.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
                {/* Topic selector */}
                {topics.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Topic (optional)</label>
                    <div className="relative">
                      <select
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white pr-8"
                      >
                        <option value="">Select a topic…</option>
                        {topics.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Question textarea */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Your Question</label>
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={`What would you like to ask about ${chapterTitle}?`}
                    rows={4}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 placeholder-gray-400"
                    maxLength={2000}
                  />
                  <div className="flex justify-between mt-1">
                    {error ? <p className="text-xs text-rose-600">{error}</p> : <span />}
                    <p className="text-[11px] text-gray-400">{question.length}/2000</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sending || !question.trim()}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-colors active:scale-95',
                      'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50'
                    )}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sending ? 'Sending…' : 'Send Question'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
