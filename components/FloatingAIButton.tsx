'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  Loader2,
  Lock,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldAlert,
  X,
  Zap,
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isOffTopic?: boolean;
}

type AuthRole = 'student' | 'teacher' | 'admin' | 'developer' | 'anonymous' | 'loading';

const QUICK = [
  "What is Ohm's Law?",
  "Explain Newton's laws",
  'Important Class 12 reactions?',
  'How to answer English extracts for boards?',
  'How to score 90+ in boards?',
];

function LoginCta() {
  return (
    <div className="space-y-2">
      <p className="text-xs text-[#4A4A6A]">
        Login with any account to unlock VidyaAI tools.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/student/login"
          className="rounded-lg bg-emerald-600 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-emerald-700"
        >
          Student
        </Link>
        <Link
          href="/teacher/login"
          className="rounded-lg bg-indigo-600 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Teacher
        </Link>
        <Link
          href="/admin/login"
          className="rounded-lg bg-amber-600 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-amber-700"
        >
          Admin
        </Link>
        <Link
          href="/developer/login"
          className="rounded-lg bg-violet-600 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-violet-700"
        >
          Developer
        </Link>
      </div>
    </div>
  );
}

export default function FloatingAIButton() {
  const pathname = usePathname();
  const isExamRoute = pathname.startsWith('/exam/assignment/');

  const [open, setOpen] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [authRole, setAuthRole] = useState<AuthRole>('loading');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    let active = true;
    setAuthRole('loading');
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
          ? payload.data as Record<string, unknown>
          : payload as Record<string, unknown> | null;
        const role = typeof data?.role === 'string' ? data.role : 'anonymous';
        if (!active) return;
        if (role === 'student' || role === 'teacher' || role === 'admin' || role === 'developer') {
          setAuthRole(role);
          return;
        }
        setAuthRole('anonymous');
      })
      .catch(() => {
        if (active) setAuthRole('anonymous');
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          res.status === 429
            ? 'VidyaAI is busy. Wait 30 seconds and try again.'
            : data.message || data.error || 'Something went wrong.'
        );
        return;
      }

      const data = await res.json().catch(() => null);
      const payload = data && typeof data === 'object' && data.data && typeof data.data === 'object'
        ? data.data as Record<string, unknown>
        : data as Record<string, unknown>;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: String(payload.message || ''),
          isOffTopic: payload.isOffTopic === true,
        },
      ]);
    } catch {
      setError('Check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function onEnterSend(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  if (isExamRoute) return null;

  const isAnonymous = authRole === 'anonymous';
  const isAuthenticated = authRole === 'student' || authRole === 'teacher' || authRole === 'admin' || authRole === 'developer';

  return (
    <>
      <button
        onClick={() => {
          if (isAnonymous) {
            setShowLockModal(true);
            return;
          }
          if (isAuthenticated) {
            setOpen((current) => !current);
          }
        }}
        type="button"
        className={clsx(
          'fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[150]',
          'h-14 w-14 rounded-2xl shadow-lg transition-all duration-200',
          'flex items-center justify-center',
          isAnonymous
            ? 'bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200'
            : open
              ? 'bg-navy-700 text-white scale-95'
              : 'bg-saffron-500 text-white hover:bg-saffron-600 hover:scale-105 active:scale-95'
        )}
        aria-label={isAnonymous ? 'Login required for VidyaAI' : open ? 'Close VidyaAI chat' : 'Open VidyaAI chat'}
        aria-expanded={open}
      >
        {authRole === 'loading' ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isAnonymous ? (
          <Lock className="h-5 w-5" />
        ) : open ? (
          <X className="h-6 w-6" />
        ) : (
          <Zap className="h-6 w-6" />
        )}
      </button>

      {showLockModal && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Lock className="h-4 w-4" />
              </div>
              <h3 className="font-fraunces text-lg font-bold text-navy-700">VidyaAI Locked</h3>
            </div>
            <p className="mb-3 text-sm text-[#4A4A6A]">
              AI features are available only after login.
            </p>
            <LoginCta />
            <button
              type="button"
              onClick={() => setShowLockModal(false)}
              className="mt-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-[#4A4A6A] hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {open && isAuthenticated && (
        <div className="fixed bottom-36 right-4 z-[149] w-[calc(100vw-2rem)] max-w-sm animate-fade-in md:bottom-24 md:right-6">
          <div className="flex max-h-[480px] flex-col overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-saffron-500 to-saffron-600 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
                  <Zap className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">VidyaAI Tutor</div>
                  <div className="text-xs text-white/70">NCERT Class 10 and 12 support</div>
                </div>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={() => {
                    setMessages([]);
                    setError(null);
                  }}
                  type="button"
                  className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                  title="Clear chat"
                  aria-label="Clear chat"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-white/80" />
                </button>
              )}
            </div>

            <div className="chat-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3" role="log" aria-live="polite" aria-relevant="additions text">
              {messages.length === 0 ? (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-saffron-100">
                      <MessageCircle className="h-3 w-3 text-saffron-600" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-[#4A4A6A]">
                      Ask chapter questions, board strategy, or quick revision prompts.
                    </div>
                  </div>
                  <div className="space-y-1">
                    {QUICK.map((question) => (
                      <button
                        key={question}
                        onClick={() => {
                          void sendMessage(question);
                        }}
                        type="button"
                        className="block w-full rounded-xl border border-saffron-200 bg-saffron-50 px-3 py-1.5 text-left text-xs text-saffron-700 transition-colors hover:bg-saffron-100"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, index) => (
                  <div
                    key={`${msg.role}-${index}`}
                    className={clsx('flex items-start gap-1.5', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
                  >
                    <div
                      className={clsx(
                        'mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                        msg.role === 'user'
                          ? 'bg-navy-700 text-white'
                          : msg.isOffTopic
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-saffron-100 text-saffron-600'
                      )}
                    >
                      {msg.role === 'user' ? 'You' : msg.isOffTopic ? '!' : 'AI'}
                    </div>

                    {msg.isOffTopic ? (
                      <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                        <div className="mb-1 flex items-center gap-1">
                          <ShieldAlert className="h-3 w-3 flex-shrink-0 text-amber-500" />
                          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600">
                            Outside scope
                          </span>
                        </div>
                        {msg.content}
                      </div>
                    ) : (
                      <div
                        className={clsx(
                          'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                          msg.role === 'user'
                            ? 'rounded-tr-sm bg-navy-700 text-white'
                            : 'rounded-tl-sm border border-gray-100 bg-white text-[#1C1C2E] shadow-sm'
                        )}
                      >
                        {msg.content}
                      </div>
                    )}
                  </div>
                ))
              )}

              {loading && (
                <div className="flex items-start gap-1.5">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-saffron-100 text-[10px] font-bold text-saffron-600">
                    AI
                  </div>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-3 py-2 shadow-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-saffron-500" />
                    <span className="text-xs text-[#8A8AAA]">Thinking...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700" role="alert">
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="flex-shrink-0 border-t border-[#E8E4DC] p-2.5">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onEnterSend}
                  placeholder="Ask anything... (Enter to send)"
                  rows={1}
                  className="max-h-20 min-h-[36px] flex-1 resize-none overflow-y-auto rounded-xl border border-[#E8E4DC] px-3 py-2 text-xs placeholder:text-[#8A8AAA] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-saffron-400"
                  disabled={loading}
                  aria-label="Ask VidyaAI a question"
                />
                <button
                  onClick={() => {
                    void sendMessage(input);
                  }}
                  type="button"
                  disabled={!input.trim() || loading}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-saffron-500 text-white transition-all hover:bg-saffron-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send message"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
