'use client';

import { useEffect, useMemo, useState } from 'react';
import { ALL_CHAPTERS } from '@/lib/data';
import type {
  TeacherAssignmentPack,
  TeacherScope,
  TeacherStorageStatus,
} from '@/lib/teacher-types';
import type { MCQItem } from '@/lib/ai/validators';
import {
  Package, Plus, RefreshCw, CheckCircle, Send, Archive,
  ChevronDown, ChevronUp, Calendar, Layers, Clock,
  Edit2, Save, X as XIcon,
} from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function apiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const r = payload as Record<string, unknown>;
  return String(r.message || r.error || fallback);
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'bg-amber-50 text-amber-700 border-amber-200'       },
  review:    { label: 'In Review', className: 'bg-blue-50 text-blue-700 border-blue-200'          },
  published: { label: 'Published', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  archived:  { label: 'Archived',  className: 'bg-gray-50 text-gray-500 border-gray-200'          },
};

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

/* ── Difficulty slider helper ─────────────────────────────────────────── */
function DifficultySliders({
  easy, medium, hard,
  onChange,
}: {
  easy: number; medium: number; hard: number;
  onChange: (easy: number, medium: number, hard: number) => void;
}) {
  function handleEasy(v: number) {
    const rem = 100 - v;
    const total = medium + hard || 1;
    const m = Math.round(rem * (medium / total));
    onChange(v, m, rem - m);
  }
  function handleMedium(v: number) {
    const rem = 100 - v;
    const total = easy + hard || 1;
    const e = Math.round(rem * (easy / total));
    onChange(e, v, rem - e);
  }
  function handleHard(v: number) {
    const rem = 100 - v;
    const total = easy + medium || 1;
    const e = Math.round(rem * (easy / total));
    onChange(e, rem - e, v);
  }

  const bars = [
    { label: 'Easy', value: easy, color: 'bg-emerald-400', handler: handleEasy },
    { label: 'Medium', value: medium, color: 'bg-amber-400', handler: handleMedium },
    { label: 'Hard', value: hard, color: 'bg-rose-400', handler: handleHard },
  ];

  return (
    <div className="space-y-3">
      <label className="text-xs font-medium text-gray-600 block">Difficulty Mix</label>
      {bars.map(({ label, value, color, handler }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="w-14 text-xs font-medium text-gray-600">{label}</span>
          <input
            type="range" min={0} max={100} step={5} value={value}
            onChange={(e) => handler(Number(e.target.value))}
            className="flex-1 h-1.5 accent-amber-600"
          />
          <span className="w-8 text-right text-xs font-semibold text-gray-700">{value}%</span>
          <div className={`w-3 h-3 rounded-full ${color}`} />
        </div>
      ))}
      {/* Visual bar */}
      <div className="h-2 rounded-full overflow-hidden flex w-full mt-1">
        <div className="bg-emerald-400 transition-all" style={{ width: `${easy}%` }} />
        <div className="bg-amber-400 transition-all" style={{ width: `${medium}%` }} />
        <div className="bg-rose-400 transition-all" style={{ width: `${hard}%` }} />
      </div>
      <p className="text-[11px] text-gray-400">{easy}% Easy · {medium}% Medium · {hard}% Hard</p>
    </div>
  );
}

/* ── MCQ inline editor ────────────────────────────────────────────────── */
function MCQEditor({
  mcqs,
  onChange,
}: {
  mcqs: MCQItem[];
  onChange: (updated: MCQItem[]) => void;
}) {
  function updateQuestion(i: number, field: keyof MCQItem, value: string | number | string[]) {
    const next = mcqs.map((q, idx) => idx === i ? { ...q, [field]: value } : q);
    onChange(next);
  }
  function updateOption(qi: number, oi: number, val: string) {
    const opts = [...mcqs[qi].options];
    opts[oi] = val;
    updateQuestion(qi, 'options', opts);
  }

  return (
    <div className="space-y-4">
      {mcqs.map((q, i) => (
        <div key={i} className="rounded-xl border border-amber-200 bg-white p-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-xs font-bold text-amber-700 mt-2">Q{i + 1}</span>
            <textarea
              rows={2}
              value={q.question}
              onChange={(e) => updateQuestion(i, 'question', e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none"
              placeholder="Question text…"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(q.options ?? []).map((opt, j) => (
              <div key={j} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateQuestion(i, 'answer', j)}
                  className={clsx(
                    'w-6 h-6 rounded-full border-2 flex-shrink-0 text-[10px] font-bold transition-colors',
                    q.answer === j ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 text-gray-500 hover:border-emerald-400'
                  )}
                >
                  {OPTION_LABELS[j]}
                </button>
                <input
                  value={opt}
                  onChange={(e) => updateOption(i, j, e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                  placeholder={`Option ${OPTION_LABELS[j]}`}
                />
              </div>
            ))}
          </div>
          <div>
            <input
              value={q.explanation ?? ''}
              onChange={(e) => updateQuestion(i, 'explanation', e.target.value)}
              className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-600"
              placeholder="Explanation (optional)…"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────── */
export default function TeacherAssignmentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [packs, setPacks] = useState<TeacherAssignmentPack[]>([]);
  const [scopes, setScopes] = useState<TeacherScope[]>([]);
  const [storageStatus, setStorageStatus] = useState<TeacherStorageStatus | null>(null);
  const [expandedPackId, setExpandedPackId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [extendDays, setExtendDays] = useState<Record<string, string>>({});

  // Create form
  const [chapterId, setChapterId] = useState('');
  const [section, setSection] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [easyPct, setEasyPct] = useState(40);
  const [mediumPct, setMediumPct] = useState(40);
  const [hardPct, setHardPct] = useState(20);
  const [includeShortAnswers, setIncludeShortAnswers] = useState(true);
  const [includeLongAnswers, setIncludeLongAnswers] = useState(false);
  const [includeFormulaDrill, setIncludeFormulaDrill] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Preview / editing
  const [showAllQuestionsFor, setShowAllQuestionsFor] = useState<string | null>(null);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, MCQItem[]>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Chapter filter
  const [filterChapterId, setFilterChapterId] = useState('');

  const difficultyMix = `${easyPct}% easy, ${mediumPct}% medium, ${hardPct}% hard`;

  const chapters = useMemo(() => {
    if (scopes.length === 0) return ALL_CHAPTERS;
    return ALL_CHAPTERS.filter((ch) =>
      scopes.some((s) => s.isActive && s.classLevel === ch.classLevel && s.subject === ch.subject)
    );
  }, [scopes]);

  const sectionOptions = useMemo(() => {
    const chapter = ALL_CHAPTERS.find((c) => c.id === chapterId);
    if (!chapter) return [];
    return Array.from(new Set(
      scopes
        .filter((s) => s.isActive && s.classLevel === chapter.classLevel && s.subject === chapter.subject && s.section)
        .map((s) => s.section || '')
        .filter(Boolean)
    ));
  }, [chapterId, scopes]);

  const filteredPacks = useMemo(() => {
    if (!filterChapterId) return packs;
    return packs.filter((p) => p.chapterId === filterChapterId);
  }, [packs, filterChapterId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, configRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { setError('Session expired. Please sign in again.'); return; }
      const sessionData = unwrap<Record<string, unknown>>(await sessionRes.json().catch(() => null));
      setScopes(Array.isArray(sessionData?.effectiveScopes) ? (sessionData.effectiveScopes as TeacherScope[]) : []);

      const cfgBody = await configRes.json().catch(() => null);
      const cfg = unwrap<{ assignmentPacks?: TeacherAssignmentPack[]; storageStatus?: TeacherStorageStatus } | null>(cfgBody);
      if (!configRes.ok || !cfg) { setError(apiError(cfgBody, 'Failed to load assignments.')); return; }
      const sorted = [...(cfg.assignmentPacks ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setPacks(sorted);
      setStorageStatus(cfg.storageStatus ?? null);
    } catch {
      setError('Failed to load assignments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (sectionOptions.length === 0) {
      setSection('');
    } else if (!sectionOptions.includes(section)) {
      setSection(sectionOptions[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionOptions]);

  async function createPack() {
    const chapter = ALL_CHAPTERS.find((c) => c.id === chapterId);
    if (!chapter) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/teacher/assignment-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId,
          classLevel: chapter.classLevel,
          subject: chapter.subject,
          questionCount,
          difficultyMix,
          includeShortAnswers,
          includeLongAnswers,
          includeFormulaDrill,
          dueDate: dueDate || undefined,
          section: section || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      const data = unwrap<Record<string, unknown> | null>(body);
      if (!res.ok || !data?.packId) { setError(apiError(body, 'Failed to create assignment.')); return; }
      setShowCreate(false);
      await load();
    } catch {
      setError('Failed to create assignment.');
    } finally {
      setCreating(false);
    }
  }

  async function mutatePack(action: 'regenerate' | 'approve' | 'publish' | 'archive', packId: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/teacher/assignment-pack/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId, feedback: feedback || undefined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(apiError(body, `Failed to ${action}.`)); return; }
      if (action === 'regenerate') setFeedback('');
      await load();
    } catch {
      setError(`Failed to ${action}.`);
    } finally {
      setLoading(false);
    }
  }

  async function lifecyclePack(packId: string, action: 'extend' | 'close' | 'reopen') {
    setLoading(true);
    setError('');
    try {
      const days = Number(extendDays[packId]);
      const res = await fetch(`/api/teacher/assignment-pack/${encodeURIComponent(packId)}/lifecycle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, extendDays: action === 'extend' && Number.isFinite(days) ? Math.max(1, days) : undefined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(apiError(body, `Failed to ${action}.`)); return; }
      await load();
    } catch {
      setError(`Failed to ${action}.`);
    } finally {
      setLoading(false);
    }
  }

  function startEditing(pack: TeacherAssignmentPack) {
    setEditingPackId(pack.packId);
    setEditDraft((prev) => ({ ...prev, [pack.packId]: (pack.mcqs ?? []).map((q) => ({ ...q })) }));
  }

  async function saveEdits(packId: string) {
    const mcqs = editDraft[packId];
    if (!mcqs) return;
    setSavingEdit(true);
    setError('');
    try {
      const res = await fetch(`/api/teacher/assignment-pack/${encodeURIComponent(packId)}/edit-questions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcqs }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(apiError(body, 'Failed to save edits.')); return; }
      setEditingPackId(null);
      await load();
    } catch {
      setError('Failed to save edits.');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-600" /> Assignments
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Create, review, and publish assignment packs for your classes.</p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Assignment
        </button>
      </div>

      {storageStatus && (
        <div className={`rounded-xl border px-4 py-2.5 text-xs mb-4 ${storageStatus.mode === 'connected' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          <span className="font-semibold">Storage:</span> {storageStatus.message}
        </div>
      )}

      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {/* ── Create form ─────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-5">
          <h2 className="font-semibold text-amber-800">New Assignment Pack</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Chapter</label>
              <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                <option value="">Select chapter…</option>
                {chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>Class {ch.classLevel === 10 ? '10' : '12'} — {ch.subject} — {ch.title}</option>
                ))}
              </select>
            </div>
            {sectionOptions.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Section</label>
                <select value={section} onChange={(e) => setSection(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                  {sectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">MCQ Count</label>
              <input type="number" min={3} max={30} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Due Date (optional)</label>
              <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Difficulty sliders — 3c */}
          <div className="rounded-xl border border-amber-100 bg-white p-4">
            <DifficultySliders
              easy={easyPct} medium={mediumPct} hard={hardPct}
              onChange={(e, m, h) => { setEasyPct(e); setMediumPct(m); setHardPct(h); }}
            />
          </div>

          {/* Question types — 3d */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Additional Question Types</label>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'short', label: 'Short Answer', state: includeShortAnswers, setter: setIncludeShortAnswers },
                { key: 'long', label: 'Long Answer', state: includeLongAnswers, setter: setIncludeLongAnswers },
                { key: 'formula', label: 'Formula Drill', state: includeFormulaDrill, setter: setIncludeFormulaDrill },
              ].map(({ key, label, state, setter }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setter(!state)}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors',
                    state ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  )}
                >
                  {state ? <CheckCircle className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-current" />}
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              {questionCount} MCQs
              {includeShortAnswers ? ' + Short Answers' : ''}
              {includeLongAnswers ? ' + Long Answers' : ''}
              {includeFormulaDrill ? ' + Formula Drill' : ''}
            </p>
          </div>

          <div className="flex gap-2">
            <button onClick={createPack} disabled={!chapterId || creating} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
              {creating ? 'Creating…' : 'Create Pack'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Chapter filter ───────────────────────────────────────────────── */}
      {packs.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-xs font-medium text-gray-500 shrink-0">Filter by chapter</label>
          <select
            value={filterChapterId}
            onChange={(e) => setFilterChapterId(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm flex-1 max-w-xs"
          >
            <option value="">All chapters ({packs.length})</option>
            {Array.from(new Set(packs.map((p) => p.chapterId))).map((cid) => {
              const ch = ALL_CHAPTERS.find((c) => c.id === cid);
              const count = packs.filter((p) => p.chapterId === cid).length;
              return <option key={cid} value={cid}>{ch ? ch.title : cid} ({count})</option>;
            })}
          </select>
        </div>
      )}

      {loading && packs.length === 0 && (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading assignments…
        </div>
      )}

      {!loading && packs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No assignments yet</p>
          <p className="text-sm mt-1">Create your first assignment pack above.</p>
        </div>
      )}

      {/* ── Pack list ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {filteredPacks.map((pack) => {
          const chapter = ALL_CHAPTERS.find((c) => c.id === pack.chapterId);
          const status = STATUS_LABELS[pack.status] ?? { label: pack.status, className: 'bg-gray-50 text-gray-600 border-gray-200' };
          const isExpanded = expandedPackId === pack.packId;
          const isEditing = editingPackId === pack.packId;
          const showAll = showAllQuestionsFor === pack.packId;
          const mcqs = pack.mcqs ?? [];
          const displayMcqs = showAll ? mcqs : mcqs.slice(0, 3);

          return (
            <div key={pack.packId} className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm overflow-hidden">
              <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedPackId(isExpanded ? null : pack.packId)}
              >
                <Layers className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {chapter ? `${chapter.title} (Class ${chapter.classLevel} ${chapter.subject})` : pack.chapterId}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${status.className}`}>{status.label}</span>
                    {pack.section && <span className="text-xs text-gray-400">§ {pack.section}</span>}
                    {pack.dueDate && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="w-3 h-3" /> Due {new Date(pack.dueDate).toLocaleDateString()}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {new Date(pack.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{mcqs.length}Q</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-[#E8E4DC] px-5 py-4 bg-gray-50 space-y-4">
                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {pack.status === 'draft' && (
                      <>
                        <button onClick={() => mutatePack('approve', pack.packId)} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </button>
                        <div className="flex items-center gap-1.5">
                          <input
                            placeholder="Feedback for regen (optional)"
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs w-52"
                          />
                          <button onClick={() => mutatePack('regenerate', pack.packId)} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50">
                            <RefreshCw className="w-3.5 h-3.5" /> Regen
                          </button>
                        </div>
                        {/* Edit button — 3b */}
                        {!isEditing && (
                          <button onClick={() => startEditing(pack)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">
                            <Edit2 className="w-3.5 h-3.5" /> Edit Questions
                          </button>
                        )}
                      </>
                    )}
                    {pack.status === 'review' && (
                      <button onClick={() => mutatePack('publish', pack.packId)} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
                        <Send className="w-3.5 h-3.5" /> Publish
                      </button>
                    )}
                    {pack.status === 'published' && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            placeholder="Days"
                            min={1}
                            value={extendDays[pack.packId] ?? ''}
                            onChange={(e) => setExtendDays((prev) => ({ ...prev, [pack.packId]: e.target.value }))}
                            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs w-20"
                          />
                          <button onClick={() => lifecyclePack(pack.packId, 'extend')} disabled={loading} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">Extend</button>
                        </div>
                        <button onClick={() => lifecyclePack(pack.packId, 'close')} disabled={loading} className="px-3 py-1.5 rounded-lg bg-slate-600 text-white text-xs font-semibold hover:bg-slate-700 disabled:opacity-50">Close</button>
                      </>
                    )}
                    {(pack.visibilityStatus === 'closed') && (
                      <button onClick={() => lifecyclePack(pack.packId, 'reopen')} disabled={loading} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50">Reopen</button>
                    )}
                    {pack.status !== 'archived' && (
                      <button onClick={() => mutatePack('archive', pack.packId)} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-500 text-white text-xs font-semibold hover:bg-gray-600 disabled:opacity-50">
                        <Archive className="w-3.5 h-3.5" /> Archive
                      </button>
                    )}
                  </div>

                  {/* ── Inline question editor — 3b ───────────────────── */}
                  {isEditing && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-violet-700">Editing MCQs — click the lettered circle to change the correct answer</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdits(pack.packId)}
                            disabled={savingEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50"
                          >
                            <Save className="w-3.5 h-3.5" /> {savingEdit ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingPackId(null)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium hover:bg-gray-50"
                          >
                            <XIcon className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </div>
                      </div>
                      <MCQEditor
                        mcqs={editDraft[pack.packId] ?? mcqs}
                        onChange={(updated) => setEditDraft((prev) => ({ ...prev, [pack.packId]: updated }))}
                      />
                    </div>
                  )}

                  {/* ── MCQs preview — 3a (show all with toggle) ────────── */}
                  {!isEditing && mcqs.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">MCQs ({mcqs.length})</p>
                      <div className="space-y-2">
                        {displayMcqs.map((q, i) => (
                          <div key={i} className="rounded-lg bg-white border border-gray-100 p-3 text-xs">
                            <p className="font-medium text-gray-700">Q{i + 1}. {q.question}</p>
                            <div className="mt-1 grid grid-cols-2 gap-1">
                              {q.options?.map((opt, j) => (
                                <span key={j} className={clsx('px-2 py-1 rounded', j === q.answer ? 'bg-emerald-100 text-emerald-700 font-medium' : 'text-gray-500')}>{opt}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                        {mcqs.length > 3 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setShowAllQuestionsFor(showAll ? null : pack.packId); }}
                            className="text-xs text-amber-600 hover:text-amber-700 font-semibold"
                          >
                            {showAll ? '▲ Show less' : `▼ Show ${mcqs.length - 3} more questions`}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
