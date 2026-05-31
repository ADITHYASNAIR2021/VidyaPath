'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Send, Loader2, Zap, RefreshCw, MessageCircle, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import 'katex/dist/katex.min.css';
import katex from 'katex';

interface SourceCitation {
  sourcePath: string;
  chapterId?: string;
  page?: number;
  locatorHint?: string;
  sourceType?: string;
  relevanceScore?: number;
  snippet?: string;
  sourceLabel?: string;
}

interface MessageEvidence {
  chapterUsed?: {
    id?: string;
    title: string;
    subject: string;
    classLevel: number;
  };
  textbookSnippets?: Array<{
    sourceLabel: string;
    sourcePath: string;
    chapterId?: string;
    chapterTitle?: string;
    page?: number;
    locatorHint?: string;
    sourceType?: string;
    relevanceScore?: number;
    snippet: string;
  }>;
  confidence?: {
    score: number;
    level: 'low' | 'medium' | 'high';
    reasons: string[];
    correctiveActions: string[];
    averageRelevance: number;
    strategies: string[];
  };
  whyThisAnswer?: string[];
}

interface MessageTeaching {
  diagnoseMistake?: string;
  explanation?: string;
  easierQuestion?: string;
  similarQuestion?: string;
  examQuestion?: string;
  revisitPlan?: string;
  practiceSignal?: {
    attempted: number;
    accuracyPercent: number | null;
    weakQuestionCount: number;
    reviewUrgency: 'low' | 'medium' | 'high';
    performanceBand: 'foundation' | 'standard' | 'challenge';
    summary: string;
  };
}

interface MessageQuality {
  provider?: string;
  model?: string;
  latencyMs?: number;
  groundednessScore?: number;
  citationCoverageScore?: number;
  retrievalMiss?: boolean;
  repaired?: boolean;
  retrievalConfidence?: number;
  retrievalConfidenceLevel?: 'low' | 'medium' | 'high';
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isOffTopic?: boolean;
  responseId?: string;
  sources?: SourceCitation[];
  evidence?: MessageEvidence;
  teaching?: MessageTeaching;
  quality?: MessageQuality;
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
    .replace(/\u00e2\u02c6\u00b4/g, '\u2234');
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

function renderWithKatex(text: string): string {
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

function formatAIResponse(text: string): string {
  const mathBlocks: string[] = [];
  let processed = normalizeEncodingArtifacts(text).replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
    mathBlocks.push(match);
    return `%%MATHBLOCK_${mathBlocks.length - 1}%%`;
  });
  processed = processed.replace(/\$([^\n$]+?)\$/g, (match) => {
    mathBlocks.push(match);
    return `%%MATHBLOCK_${mathBlocks.length - 1}%%`;
  });

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
  processed = processed.replace(/%%MATHBLOCK_(\d+)%%/g, (_, idx) => renderWithKatex(mathBlocks[parseInt(idx, 10)]));
  return processed;
}

function sanitizeRenderedHtml(value: string): string {
  return value
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)\b[^>]*\/?\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|src|xlink:href)\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, '');
}

function confidenceTone(level?: 'low' | 'medium' | 'high') {
  if (level === 'high') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-100';
  if (level === 'medium') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100';
  return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100';
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
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, boolean>>({});
  const [feedbackPending, setFeedbackPending] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const quickQuestions = QUICK_QUESTIONS(chapterTitle, chapterTopics);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
        if (active) setAiEnabled(['student', 'teacher', 'admin', 'developer'].includes(role));
      })
      .catch(() => {
        if (active) setAiEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
      const payload =
        data && typeof data === 'object' && data.data && typeof data.data === 'object'
          ? (data.data as Record<string, unknown>)
          : (data as Record<string, unknown>);
      const sources = Array.isArray(payload.sources)
        ? (payload.sources as SourceCitation[]).filter((source) => source && source.sourcePath)
        : [];
      const evidence = payload.evidence && typeof payload.evidence === 'object' ? (payload.evidence as MessageEvidence) : undefined;
      const teaching = payload.teaching && typeof payload.teaching === 'object' ? (payload.teaching as MessageTeaching) : undefined;
      const quality = payload.quality && typeof payload.quality === 'object' ? (payload.quality as MessageQuality) : undefined;

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: String(payload.message || ''),
          isOffTopic: payload.isOffTopic === true,
          responseId: typeof payload.responseId === 'string' ? payload.responseId : undefined,
          sources: sources.length > 0 ? sources : undefined,
          evidence,
          teaching,
          quality,
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
      void sendMessage(input);
    }
  }

  async function submitQualityFeedback(
    messageIndex: number,
    issueType: 'unsafe-answer' | 'weak-grounding' | 'missing-citation' | 'hallucination-flag'
  ) {
    const responseId = messages[messageIndex]?.responseId;
    const key = `${responseId || messageIndex}:${issueType}`;
    if (feedbackSent[key] || feedbackPending === key) return;
    setFeedbackPending(key);
    try {
      await fetch('/api/ai/quality-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueType,
          task: 'chat',
          chapterId,
          responseId: responseId || `chat-${messageIndex}`,
        }),
      });
      setFeedbackSent((prev) => ({ ...prev, [key]: true }));
    } finally {
      setFeedbackPending('');
    }
  }

  if (aiEnabled === false) {
    return (
      <div className="flex flex-col overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-saffron-500 to-saffron-600 px-4 py-3.5">
          <div className="text-sm font-semibold text-white">VidyaAI Tutor</div>
          <div className="text-xs text-white/80">Login required</div>
        </div>
        <div className="p-4">
          <p className="text-sm text-[#4A4A6A] dark:text-slate-300">Login with any account to unlock chapter AI tools.</p>
          <div className="mt-3">
            <Link
              href={`/login?next=${encodeURIComponent(`/chapters/${chapterId}`)}`}
              className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between bg-gradient-to-r from-saffron-500 to-saffron-600 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">VidyaAI Tutor</div>
            <div className="text-xs text-white/70">Evidence-first chapter help with next-practice built in</div>
          </div>
        </div>
        {messages.length > 0 ? (
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
            <RefreshCw className="h-4 w-4 text-white/80" />
          </button>
        ) : null}
      </div>

      <div
        className="chat-scroll space-y-3 overflow-y-auto bg-[#FCFBF8] p-4 dark:bg-slate-950/60"
        style={{ maxHeight: '560px', minHeight: '220px' }}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.length === 0 ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-saffron-100">
                <MessageCircle className="h-3.5 w-3.5 text-saffron-600" />
              </div>
              <div className="max-w-xs rounded-2xl rounded-tl-sm border border-gray-100 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-[#4A4A6A] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                Hi! I&apos;m VidyaAI for <strong className="text-navy-700 dark:text-slate-100">{subject}, Class {classLevel}</strong>.
                I&apos;ll answer, show the chapter evidence, and give you the next practice step.
              </div>
            </div>
            <div>
              <p className="mb-2 px-1 text-xs text-[#8A8AAA] dark:text-slate-400">Try asking:</p>
              <div className="space-y-1.5">
                {quickQuestions.map((question) => (
                  <button
                    key={question}
                    onClick={() => void sendMessage(question)}
                    type="button"
                    className="block w-full rounded-xl border border-saffron-200 bg-saffron-50 px-3 py-2 text-left text-xs text-saffron-700 transition-colors hover:bg-saffron-100 dark:border-saffron-400/40 dark:bg-saffron-500/20 dark:text-saffron-100 dark:hover:bg-saffron-500/30"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={clsx('flex items-start gap-2 animate-fade-in', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
            >
              <div
                className={clsx(
                  'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
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
                <div className="max-w-[82%] rounded-2xl rounded-tl-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                    <span className="text-xs font-bold uppercase tracking-wide text-amber-600">Outside my scope</span>
                  </div>
                  {msg.content}
                </div>
              ) : (
                <div className="flex max-w-[86%] flex-col gap-2">
                  <div
                    className={clsx(
                      'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'rounded-tr-sm bg-navy-700 text-white'
                        : 'rounded-tl-sm border border-gray-100 bg-white text-[#1C1C2E] shadow-sm ai-response dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                    )}
                  >
                    {msg.role === 'assistant' ? (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: sanitizeRenderedHtml(formatAIResponse(msg.content)),
                        }}
                      />
                    ) : (
                      msg.content
                    )}
                  </div>

                  {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 ? (
                    <div className="flex flex-wrap gap-1 px-1">
                      {msg.sources.map((source, sourceIndex) => (
                        <span
                          key={`${source.sourcePath}-${sourceIndex}`}
                          title={source.sourcePath}
                          className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:border-indigo-400/40 dark:bg-indigo-500/20 dark:text-indigo-100"
                        >
                          {source.sourceLabel ?? source.sourceType ?? 'source'}
                          {source.page ? ` - p.${source.page}` : source.locatorHint ? ` - ${source.locatorHint}` : ''}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {msg.role === 'assistant' && msg.evidence ? (
                    <div className="space-y-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3 dark:border-indigo-400/30 dark:bg-indigo-500/10">
                      <div className="flex flex-wrap items-center gap-2">
                        {msg.evidence.chapterUsed ? (
                          <span className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-indigo-700 dark:border-indigo-400/40 dark:bg-slate-900 dark:text-indigo-100">
                            Chapter used: {msg.evidence.chapterUsed.title}
                          </span>
                        ) : null}
                        <span className={clsx('rounded-full border px-2.5 py-1 text-[10px] font-semibold', confidenceTone(msg.evidence.confidence?.level))}>
                          Confidence {msg.evidence.confidence?.level ?? 'low'} - {msg.evidence.confidence?.score ?? 0}
                        </span>
                        {msg.quality?.provider ? (
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">
                            {msg.quality.provider}/{msg.quality.model}
                          </span>
                        ) : null}
                      </div>

                      {msg.evidence.whyThisAnswer && msg.evidence.whyThisAnswer.length > 0 ? (
                        <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 dark:border-indigo-400/30 dark:bg-slate-900">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-200">Why this answer</p>
                          <div className="mt-1 space-y-1">
                            {msg.evidence.whyThisAnswer.map((item, itemIndex) => (
                              <p key={`${itemIndex}-${item}`} className="text-xs text-[#334155] dark:text-slate-200">
                                {itemIndex + 1}. {item}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {msg.evidence.textbookSnippets && msg.evidence.textbookSnippets.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-200">Textbook trace</p>
                          {msg.evidence.textbookSnippets.map((snippet, snippetIndex) => (
                            <div
                              key={`${snippet.sourcePath}-${snippetIndex}`}
                              className="rounded-xl border border-indigo-100 bg-white px-3 py-2 dark:border-indigo-400/30 dark:bg-slate-900"
                            >
                              <div className="flex flex-wrap items-center gap-1 text-[10px] font-semibold text-indigo-700 dark:text-indigo-100">
                                <span>{snippet.sourceLabel}</span>
                                {snippet.chapterTitle ? <span>{snippet.chapterTitle}</span> : null}
                                {snippet.page ? <span>Page {snippet.page}</span> : null}
                                {!snippet.page && snippet.locatorHint ? <span>{snippet.locatorHint}</span> : null}
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-[#334155] dark:text-slate-200">{snippet.snippet}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {msg.role === 'assistant' && msg.teaching ? (
                    <div className="space-y-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-400/30 dark:bg-emerald-500/10">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">Teach me through it</p>
                      {msg.teaching.diagnoseMistake ? (
                        <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2 dark:border-emerald-400/30 dark:bg-slate-900">
                          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">Likely mistake</p>
                          <p className="mt-1 text-xs text-[#334155] dark:text-slate-200">{msg.teaching.diagnoseMistake}</p>
                        </div>
                      ) : null}
                      {msg.teaching.explanation ? (
                        <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2 dark:border-emerald-400/30 dark:bg-slate-900">
                          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">Level-appropriate explanation</p>
                          <p className="mt-1 whitespace-pre-line text-xs text-[#334155] dark:text-slate-200">{msg.teaching.explanation}</p>
                        </div>
                      ) : null}
                      <div className="grid gap-2 sm:grid-cols-3">
                        {[
                          { label: 'Easier question', value: msg.teaching.easierQuestion },
                          { label: 'Similar question', value: msg.teaching.similarQuestion },
                          { label: 'Exam-style question', value: msg.teaching.examQuestion },
                        ].map((card) => (
                          <div key={card.label} className="rounded-xl border border-emerald-100 bg-white px-3 py-2 dark:border-emerald-400/30 dark:bg-slate-900">
                            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">{card.label}</p>
                            <p className="mt-1 text-xs text-[#334155] dark:text-slate-200">{card.value || 'Not available.'}</p>
                          </div>
                        ))}
                      </div>
                      {msg.teaching.revisitPlan ? (
                        <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2 dark:border-emerald-400/30 dark:bg-slate-900">
                          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">Revisit later if still weak</p>
                          <p className="mt-1 text-xs text-[#334155] dark:text-slate-200">{msg.teaching.revisitPlan}</p>
                          {msg.teaching.practiceSignal ? (
                            <p className="mt-1 text-[11px] text-[#64748B] dark:text-slate-400">
                              Current band: {msg.teaching.practiceSignal.performanceBand} | urgency: {msg.teaching.practiceSignal.reviewUrgency}
                              {typeof msg.teaching.practiceSignal.accuracyPercent === 'number'
                                ? ` | chapter accuracy: ${msg.teaching.practiceSignal.accuracyPercent}%`
                                : ''}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {msg.role === 'assistant' && !msg.isOffTopic ? (
                    <div className="flex flex-wrap gap-1 px-1">
                      {[
                        { issue: 'unsafe-answer', label: 'Unsafe' },
                        { issue: 'weak-grounding', label: 'Weak grounding' },
                        { issue: 'missing-citation', label: 'Missing citation' },
                        { issue: 'hallucination-flag', label: 'Hallucination' },
                      ].map((item) => {
                        const key = `${msg.responseId || index}:${item.issue}`;
                        const isPending = feedbackPending === key;
                        const isDone = feedbackSent[key];
                        return (
                          <button
                            key={item.issue}
                            type="button"
                            disabled={isPending || isDone}
                            onClick={() =>
                              void submitQualityFeedback(
                                index,
                                item.issue as 'unsafe-answer' | 'weak-grounding' | 'missing-citation' | 'hallucination-flag'
                              )
                            }
                            className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                          >
                            {isDone ? `${item.label}: sent` : isPending ? `${item.label}: sending` : `Flag ${item.label}`}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))
        )}

        {loading ? (
          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-saffron-100 text-xs font-bold text-saffron-600">AI</div>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <Loader2 className="h-4 w-4 animate-spin text-saffron-500" />
              <span className="text-sm text-[#8A8AAA] dark:text-slate-300">Thinking...</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[#E8E4DC] p-3 dark:border-slate-700">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about this chapter... (Enter to send)"
            rows={1}
            className="max-h-32 flex-1 resize-none overflow-y-auto rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm placeholder:text-[#8A8AAA] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-saffron-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-400"
            style={{ minHeight: '42px' }}
            disabled={loading}
            aria-label="Ask VidyaAI a question"
          />
          <button
            onClick={() => void sendMessage(input)}
            type="button"
            disabled={!input.trim() || loading}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-saffron-500 text-white transition-all hover:bg-saffron-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-xs text-[#8A8AAA] dark:text-slate-400">
          Evidence-first AI tutor with grounded answers and next-practice follow-up
        </p>
      </div>
    </div>
  );
}
