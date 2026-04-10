'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Zap, RefreshCw, MessageCircle, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import 'katex/dist/katex.min.css';
import katex from 'katex';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isOffTopic?: boolean;
}

interface AIChatBoxProps {
  chapterId: string;
  chapterTitle: string;
  chapterTopics: string[];
  classLevel: number;
  subject: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeEncodingArtifacts(value: string): string {
  return value
    .replace(/\u00c2\u00b7/g, '\u00b7')
    .replace(/\u00e2\u20ac\u201d/g, '\u2014')
    .replace(/\u00e2\u20ac\u201c/g, '\u2013')
    .replace(/\u00e2\u20ac\u00a2/g, '\u2022')
    .replace(/\u00e2\u2020\u2019/g, '\u2192')
    .replace(/\u00e2\u02c6\u00b4/g, '\u2234')
    .replace(/\u00e2\u0153\u2026/g, '\u2705')
    .replace(/\u00e2\u0161\u00a0\u00ef\u00b8\u008f/g, '\u26a0\ufe0f')
    .replace(/\u00f0\u0178\u201c\u2039/g, '\ud83d\udccb')
    .replace(/\u00f0\u0178\u203a\u00a1/g, '\ud83d\udee1');
}

function formatInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/\*(?!\s)([^*]+)\*/g, '<em>$1</em>');
}

function isEquationLikeLine(line: string): boolean {
  if (line.length > 180) return false;
  const hasOperator = /(?:\u2192|\u21cc|=|\u0394H|E\u2070)/.test(line);
  const hasChemPattern = /[A-Za-z0-9\)\]]\s*(?:\u2192|\u21cc|=)\s*[A-Za-z0-9\(\[]/.test(line);
  return hasOperator && (hasChemPattern || /[A-Z][a-z]?\d?/.test(line));
}

// Render a string that may contain LaTeX inline ($...$) and block ($$...$$)
// Returns sanitised HTML with KaTeX-rendered math
function renderWithKatex(text: string): string {
  // First render block math $$...$$
  let result = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    try {
      return `<div class="katex-block my-2 overflow-x-auto">${katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false,
        trust: false,
      })}</div>`;
    } catch {
      return `<code class="text-sm">${escapeHtml(math)}</code>`;
    }
  });

  // Then inline math $...$
  result = result.replace(/\$([^\n$]+?)\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
        trust: false,
      });
    } catch {
      return `<code class="text-sm">${escapeHtml(math)}</code>`;
    }
  });

  return result;
}

// Full AI response formatter: KaTeX + markdown-like styling
function formatAIResponse(text: string): string {
  // Step 1: protect LaTeX from markdown processing by placeholder
  const mathBlocks: string[] = [];
  let processed = normalizeEncodingArtifacts(text).replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
    mathBlocks.push(match);
    return `%%MATHBLOCK_${mathBlocks.length - 1}%%`;
  });
  processed = processed.replace(/\$([^\n$]+?)\$/g, (match) => {
    mathBlocks.push(match);
    return `%%MATHBLOCK_${mathBlocks.length - 1}%%`;
  });

  // Step 2: escape + structured formatting
  processed = escapeHtml(processed);
  const lines = processed.split('\n');
  const blocks: string[] = [];
  let listType: 'ol' | 'ul' | null = null;

  const closeList = () => {
    if (!listType) return;
    blocks.push(listType === 'ol' ? '</ol>' : '</ul>');
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    const sectionMatch = line.match(/^\*\*(.+?)\*\*:\s*(.*)$/);
    if (sectionMatch) {
      closeList();
      const [, title, rest] = sectionMatch;
      const titleHtml = formatInlineMarkdown(title.trim());
      const restHtml = rest ? `<div class="ai-section-body">${formatInlineMarkdown(rest.trim())}</div>` : '';
      blocks.push(`<section class="ai-section"><h4 class="ai-section-title">${titleHtml}</h4>${restHtml}</section>`);
      continue;
    }

    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      closeList();
      blocks.push(`<h4 class="ai-section-title">${formatInlineMarkdown(headingMatch[1].trim())}</h4>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      if (listType !== 'ol') {
        closeList();
        blocks.push('<ol class="ai-list ai-list-ol">');
        listType = 'ol';
      }
      blocks.push(`<li>${formatInlineMarkdown(orderedMatch[1].trim())}</li>`);
      continue;
    }

    const bulletMatch = line.match(/^(?:[-*\u2022])\s+(.+)$/);
    if (bulletMatch) {
      if (listType !== 'ul') {
        closeList();
        blocks.push('<ul class="ai-list ai-list-ul">');
        listType = 'ul';
      }
      blocks.push(`<li>${formatInlineMarkdown(bulletMatch[1].trim())}</li>`);
      continue;
    }

    closeList();
    if (isEquationLikeLine(line)) {
      blocks.push(`<div class="ai-equation">${formatInlineMarkdown(line)}</div>`);
    } else {
      blocks.push(`<p class="ai-paragraph">${formatInlineMarkdown(line)}</p>`);
    }
  }

  closeList();
  processed = blocks.join('');

  // Step 3: restore math blocks with KaTeX rendering
  processed = processed.replace(/%%MATHBLOCK_(\d+)%%/g, (_, idx) => {
    return renderWithKatex(mathBlocks[parseInt(idx, 10)]);
  });

  return processed;
}

const QUICK_QUESTIONS = (chapterTitle: string, topics: string[]) => [
  `Explain ${topics[0] ?? 'this topic'} simply`,
  `Important formulas in ${chapterTitle}?`,
  `Give me 3 MCQs on ${chapterTitle}`,
  `What board questions come from this chapter?`,
];

export default function AIChatBox({
  chapterId,
  chapterTitle,
  chapterTopics,
  classLevel,
  subject,
}: AIChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const quickQuestions = QUICK_QUESTIONS(chapterTitle, chapterTopics);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(messageText: string) {
    if (!messageText.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: messageText.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          chapterContext: { chapterId, title: chapterTitle, subject, classLevel, topics: chapterTopics },
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 429) {
          setError('VidyaAI is busy right now. Wait 30 seconds and try again!');
        } else {
          setError(data.message || data.error || 'Something went wrong. Please try again.');
        }
        return;
      }

      const data = await response.json();
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex flex-col bg-white rounded-2xl border border-[#E8E4DC] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-saffron-500 to-saffron-600 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-white text-sm">VidyaAI Tutor</div>
            <div className="text-white/70 text-xs">CBSE Class 10 &amp; 12 - Free - Always available</div>
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
            <RefreshCw className="w-4 h-4 text-white/80" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        className="overflow-y-auto p-4 space-y-3 chat-scroll"
        style={{ maxHeight: '460px', minHeight: '200px' }}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.length === 0 ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 bg-saffron-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <MessageCircle className="w-3.5 h-3.5 text-saffron-600" />
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-[#4A4A6A] leading-relaxed max-w-xs">
                Hi! I&apos;m VidyaAI - your CBSE tutor for{' '}
                <strong className="text-navy-700">{subject}, Class {classLevel}</strong>.
                Ask anything - formulas, derivations, MCQs, board tips!
              </div>
            </div>
            <div>
              <p className="text-xs text-[#8A8AAA] mb-2 px-1">Try asking:</p>
              <div className="space-y-1.5">
                {quickQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    type="button"
                    className="block w-full text-left text-xs bg-saffron-50 hover:bg-saffron-100 text-saffron-700 border border-saffron-200 px-3 py-2 rounded-xl transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={clsx(
                'flex items-start gap-2 animate-fade-in',
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              <div
                className={clsx(
                  'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5',
                  msg.role === 'user' ? 'bg-navy-700 text-white'
                    : msg.isOffTopic ? 'bg-amber-100 text-amber-600'
                    : 'bg-saffron-100 text-saffron-600'
                )}
              >
                {msg.role === 'user' ? 'You' : msg.isOffTopic ? '!' : 'AI'}
              </div>

              {msg.isOffTopic ? (
                <div className="max-w-[82%] px-4 py-3 rounded-2xl rounded-tl-sm bg-amber-50 border border-amber-200 text-sm leading-relaxed text-amber-800">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">Outside my scope</span>
                  </div>
                  {msg.content}
                </div>
              ) : (
                <div
                  className={clsx(
                    'max-w-[82%] px-4 py-3 rounded-2xl text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-navy-700 text-white rounded-tr-sm'
                      : 'bg-white border border-gray-100 shadow-sm text-[#1C1C2E] rounded-tl-sm ai-response'
                  )}
                >
                  {msg.role === 'assistant' ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: formatAIResponse(msg.content),
                      }}
                    />
                  ) : (
                    msg.content
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 bg-saffron-100 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-saffron-600 mt-0.5">AI</div>
            <div className="bg-white border border-gray-100 shadow-sm px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-saffron-500 animate-spin" />
              <span className="text-sm text-[#8A8AAA]">Thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700" role="alert">{error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#E8E4DC] p-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about this chapter... (Enter to send)"
            rows={1}
            className="flex-1 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-saffron-400 focus:border-transparent placeholder:text-[#8A8AAA] max-h-32 overflow-y-auto"
            style={{ minHeight: '42px' }}
            disabled={loading}
            aria-label="Ask VidyaAI a question"
          />
          <button
            onClick={() => sendMessage(input)}
            type="button"
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-10 h-10 bg-saffron-500 hover:bg-saffron-600 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-all"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-[#8A8AAA] mt-1.5 text-center">
          CBSE Science &amp; Math only - Powered by Gemini (with backup) - Free
        </p>
      </div>
    </div>
  );
}
