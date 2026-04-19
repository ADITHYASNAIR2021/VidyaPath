'use client';

import { useEffect, useMemo, useState } from 'react';
import { ALL_CHAPTERS } from '@/lib/data';
import type { TeacherScope } from '@/lib/teacher-types';
import { BookOpen, Link2, Star, Check, RefreshCw, AlertCircle, Trash2 } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

type Tab = 'quiz-links' | 'important-topics';

export default function ChapterToolkitPage() {
  const [scopes, setScopes] = useState<TeacherScope[]>([]);
  const [importantTopics, setImportantTopics] = useState<Record<string, string[]>>({});
  const [quizLinks, setQuizLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('quiz-links');

  // Chapter toolkit state
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [quizUrl, setQuizUrl] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState('');

  const chapters = useMemo(() => {
    if (scopes.length === 0) return ALL_CHAPTERS;
    return ALL_CHAPTERS.filter((ch) =>
      scopes.some((s) => s.isActive && s.classLevel === ch.classLevel && s.subject === ch.subject)
    );
  }, [scopes]);

  const selectedChapter = ALL_CHAPTERS.find((c) => c.id === selectedChapterId);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [sessionRes, configRes] = await Promise.all([
          fetch('/api/teacher/session/me', { cache: 'no-store' }),
          fetch('/api/teacher', { cache: 'no-store' }),
        ]);
        if (!sessionRes.ok) { setError('Session expired. Please sign in again.'); return; }
        const sessionData = unwrap<{ effectiveScopes?: TeacherScope[] } | null>(await sessionRes.json().catch(() => null));
        setScopes(Array.isArray(sessionData?.effectiveScopes) ? sessionData.effectiveScopes : []);

        const cfg = unwrap<{ importantTopics?: Record<string, string[]>; quizLinks?: Record<string, string> } | null>(
          await configRes.json().catch(() => null)
        );
        setImportantTopics(cfg?.importantTopics ?? {});
        setQuizLinks(cfg?.quizLinks ?? {});
      } catch {
        setError('Failed to load configuration.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Sync form when chapter changes
  useEffect(() => {
    if (!selectedChapterId) return;
    setQuizUrl(quizLinks[selectedChapterId] ?? '');
    setSelectedTopics(importantTopics[selectedChapterId] ?? []);
    setSaveOk(false);
    setSaveError('');
  }, [selectedChapterId, quizLinks, importantTopics]);

  // Auto-select first chapter
  useEffect(() => {
    if (!selectedChapterId && chapters.length > 0) setSelectedChapterId(chapters[0].id);
  }, [chapters]);

  async function save() {
    if (!selectedChapterId) return;
    setSaving(true);
    setSaveOk(false);
    setSaveError('');
    try {
      const action = tab === 'quiz-links' ? 'set-quiz-link' : 'set-important-topics';
      const body =
        tab === 'quiz-links'
          ? { action, chapterId: selectedChapterId, url: quizUrl.trim() }
          : { action, chapterId: selectedChapterId, topics: selectedTopics };

      const res = await fetch('/api/teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setSaveError(data?.message ?? 'Failed to save.'); return; }

      const cfg = unwrap<{ config?: { importantTopics?: Record<string, string[]>; quizLinks?: Record<string, string> } } | null>(data);
      if (cfg?.config?.importantTopics) setImportantTopics(cfg.config.importantTopics);
      if (cfg?.config?.quizLinks) setQuizLinks(cfg.config.quizLinks);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch {
      setSaveError('Save failed. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  function toggleTopic(topic: string) {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
    setSaveOk(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-amber-600" /> Chapter Toolkit
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Set quiz links and mark important topics for each chapter.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {([
          { id: 'quiz-links' as Tab, label: 'Quiz Links', icon: Link2 },
          { id: 'important-topics' as Tab, label: 'Important Topics', icon: Star },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setSaveOk(false); setSaveError(''); }}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
              tab === id ? 'bg-amber-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {/* Chapter list */}
        <div className="md:col-span-1">
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Chapter</p>
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden max-h-[520px] overflow-y-auto">
            {chapters.map((ch) => {
              const hasData = tab === 'quiz-links' ? !!quizLinks[ch.id] : (importantTopics[ch.id]?.length ?? 0) > 0;
              return (
                <button
                  key={ch.id}
                  onClick={() => setSelectedChapterId(ch.id)}
                  className={clsx(
                    'w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-b-0 transition-colors',
                    selectedChapterId === ch.id ? 'bg-amber-50 border-l-2 border-l-amber-500' : 'hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs text-gray-800 font-medium leading-snug">{ch.title}</span>
                    {hasData && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                  </div>
                  <span className="text-[11px] text-gray-400">Class {ch.classLevel} · {ch.subject}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor panel */}
        <div className="md:col-span-2">
          {!selectedChapter ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center h-48 text-gray-400 text-sm">
              Select a chapter to configure
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-800 text-sm mb-1">{selectedChapter.title}</h2>
              <p className="text-xs text-gray-400 mb-4">Class {selectedChapter.classLevel} · {selectedChapter.subject}</p>

              {tab === 'quiz-links' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                      Quiz / Assignment URL
                    </label>
                    <input
                      type="url"
                      value={quizUrl}
                      onChange={(e) => { setQuizUrl(e.target.value); setSaveOk(false); }}
                      placeholder="https://forms.google.com/..."
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <p className="text-xs text-gray-400 mt-1">Students will see this link on the chapter page. Leave blank to remove.</p>
                  </div>
                  {quizLinks[selectedChapterId] && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                      <Check className="w-3.5 h-3.5" />
                      Current link saved. Students can see it.
                    </div>
                  )}
                </div>
              )}

              {tab === 'important-topics' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-600">
                    Mark important topics <span className="text-gray-400 font-normal">({selectedTopics.length} selected)</span>
                  </p>
                  {(selectedChapter.topics ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400">No topics defined for this chapter.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {(selectedChapter.topics ?? []).map((topic) => (
                        <button
                          key={topic}
                          onClick={() => toggleTopic(topic)}
                          className={clsx(
                            'w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors',
                            selectedTopics.includes(topic)
                              ? 'bg-amber-50 border-amber-300 text-amber-800'
                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                          )}
                        >
                          <span className={clsx(
                            'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                            selectedTopics.includes(topic) ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                          )}>
                            {selectedTopics.includes(topic) && <Check className="w-3 h-3 text-white" />}
                          </span>
                          {topic}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedTopics.length > 0 && (
                    <button
                      onClick={() => { setSelectedTopics([]); setSaveOk(false); }}
                      className="text-xs text-rose-500 flex items-center gap-1 hover:text-rose-700"
                    >
                      <Trash2 className="w-3 h-3" /> Clear all
                    </button>
                  )}
                </div>
              )}

              {/* Save / feedback */}
              <div className="mt-5 flex items-center gap-3">
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {saveOk && (
                  <span className="text-sm text-emerald-600 flex items-center gap-1">
                    <Check className="w-4 h-4" /> Saved successfully
                  </span>
                )}
                {saveError && (
                  <span className="text-sm text-rose-600">{saveError}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
