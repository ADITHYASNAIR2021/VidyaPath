'use client';

import { useState, useRef, useEffect } from 'react';
import { Zap, X, Send, Loader2, RefreshCw, ShieldAlert, MessageCircle } from 'lucide-react';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isOffTopic?: boolean;
}

const QUICK = [
  'What is Ohm\'s Law?',
  'Explain Newton\'s laws',
  'Important Class 12 reactions?',
  'How to answer English extracts for boards?',
  'How to score 90+ in boards?',
];

export default function FloatingAIButton() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pathname = usePathname();
  const isExamRoute = pathname.startsWith('/exam/assignment/');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

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
        setError(res.status === 429
          ? 'VidyaAI is busy. Wait 30 seconds and try again!'
          : data.message || data.error || 'Something went wrong.');
        return;
      }

      const data = await res.json();
      const payload = (data && typeof data === 'object' && data.data && typeof data.data === 'object')
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

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  if (isExamRoute) {
    return null;
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        type="button"
        className={clsx(
          'fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[150]',
          'w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center transition-all duration-200',
          open
            ? 'bg-navy-700 rotate-0 scale-95'
            : 'bg-saffron-500 hover:bg-saffron-600 hover:scale-105 active:scale-95'
        )}
        aria-label={open ? 'Close VidyaAI chat' : 'Open VidyaAI chat'}
        aria-expanded={open}
      >
        {open ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Zap className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Chat drawer */}
      {open && (
        <div className="fixed bottom-36 right-4 md:bottom-24 md:right-6 z-[149] w-[calc(100vw-2rem)] max-w-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-[#E8E4DC] overflow-hidden flex flex-col" style={{ maxHeight: '480px' }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-saffron-500 to-saffron-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">VidyaAI Tutor</div>
                  <div className="text-white/70 text-xs">Class 10 &amp; 12 Board Prep</div>
                </div>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); setError(null); }}
                  type="button"
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                  title="Clear chat"
                  aria-label="Clear chat"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-white/80" />
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0" role="log" aria-live="polite" aria-relevant="additions text">
              {messages.length === 0 ? (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 bg-saffron-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <MessageCircle className="w-3 h-3 text-saffron-600" />
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-3 py-2.5 text-xs text-[#4A4A6A] leading-relaxed">
                      Hi! Ask me anything about <strong>CBSE Class 10 &amp; 12</strong> core subjects and board prep.
                    </div>
                  </div>
                  <div className="space-y-1">
                    {QUICK.map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        type="button"
                        className="block w-full text-left text-xs bg-saffron-50 hover:bg-saffron-100 text-saffron-700 border border-saffron-200 px-3 py-1.5 rounded-xl transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={clsx('flex items-start gap-1.5', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
                  >
                    <div className={clsx(
                      'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5',
                      msg.role === 'user' ? 'bg-navy-700 text-white'
                        : msg.isOffTopic ? 'bg-amber-100 text-amber-600'
                        : 'bg-saffron-100 text-saffron-600'
                    )}>
                      {msg.role === 'user' ? 'You' : msg.isOffTopic ? '!' : 'AI'}
                    </div>

                    {msg.isOffTopic ? (
                      <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-sm bg-amber-50 border border-amber-200 text-xs leading-relaxed text-amber-800">
                        <div className="flex items-center gap-1 mb-1">
                          <ShieldAlert className="w-3 h-3 text-amber-500 flex-shrink-0" />
                          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Outside my scope</span>
                        </div>
                        {msg.content}
                      </div>
                    ) : (
                      <div className={clsx(
                        'max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed',
                        msg.role === 'user'
                          ? 'bg-navy-700 text-white rounded-tr-sm'
                          : 'bg-white border border-gray-100 shadow-sm text-[#1C1C2E] rounded-tl-sm'
                      )}>
                        {msg.content}
                      </div>
                    )}
                  </div>
                ))
              )}

              {loading && (
                <div className="flex items-start gap-1.5">
                  <div className="w-6 h-6 bg-saffron-100 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-saffron-600">AI</div>
                  <div className="bg-white border border-gray-100 shadow-sm px-3 py-2 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 text-saffron-500 animate-spin" />
                    <span className="text-xs text-[#8A8AAA]">Thinking...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700" role="alert">{error}</div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[#E8E4DC] p-2.5 flex-shrink-0">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask anything... (Enter to send)"
                  rows={1}
                  className="flex-1 text-xs border border-[#E8E4DC] rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-saffron-400 focus:border-transparent placeholder:text-[#8A8AAA] max-h-20 overflow-y-auto"
                  style={{ minHeight: '36px' }}
                  disabled={loading}
                  aria-label="Ask VidyaAI a question"
                />
                <button
                  onClick={() => sendMessage(input)}
                  type="button"
                  disabled={!input.trim() || loading}
                  className="flex-shrink-0 w-9 h-9 bg-saffron-500 hover:bg-saffron-600 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-all"
                  aria-label="Send message"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
