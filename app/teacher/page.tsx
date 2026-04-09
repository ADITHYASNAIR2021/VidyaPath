'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ALL_CHAPTERS } from '@/lib/data';
import type {
  TeacherActionHistoryEntry,
  TeacherAssignmentAnalytics,
  TeacherAssignmentPack,
  TeacherQuestionBankItem,
  TeacherScope,
  TeacherSubmissionSummary,
  TeacherStorageStatus,
} from '@/lib/teacher-types';

type QuestionKind = 'mcq' | 'short' | 'long';

interface TeacherConfigResponse {
  updatedAt: string;
  importantTopics: Record<string, string[]>;
  quizLinks: Record<string, string>;
  announcements: Array<{ id: string; title: string; body: string; createdAt: string }>;
  assignmentAnalytics?: TeacherAssignmentAnalytics;
  assignmentPacks?: TeacherAssignmentPack[];
  actionHistory?: TeacherActionHistoryEntry[];
  storageStatus?: TeacherStorageStatus;
}

function fmt(value?: string): string {
  if (!value) return 'NA';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export default function TeacherPortalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [teacherName, setTeacherName] = useState('Teacher');
  const [scopes, setScopes] = useState<TeacherScope[]>([]);
  const [config, setConfig] = useState<TeacherConfigResponse | null>(null);
  const [chapterId, setChapterId] = useState('');
  const [section, setSection] = useState('');
  const [topics, setTopics] = useState('');
  const [quizLink, setQuizLink] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [questionCount, setQuestionCount] = useState(12);
  const [difficultyMix, setDifficultyMix] = useState('40% easy, 40% medium, 20% hard');
  const [includeShortAnswers, setIncludeShortAnswers] = useState(true);
  const [includeFormulaDrill, setIncludeFormulaDrill] = useState(true);
  const [dueDate, setDueDate] = useState('');
  const [feedback, setFeedback] = useState('');
  const [selectedPackId, setSelectedPackId] = useState('');
  const [summary, setSummary] = useState<TeacherSubmissionSummary | null>(null);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, Record<string, { s: string; m: string; f: string }>>>({});
  const [qbItems, setQbItems] = useState<TeacherQuestionBankItem[]>([]);
  const [qbKind, setQbKind] = useState<QuestionKind>('mcq');
  const [qbPrompt, setQbPrompt] = useState('');
  const [qbOptions, setQbOptions] = useState('');
  const [qbAnswerIndex, setQbAnswerIndex] = useState('0');
  const [qbMarks, setQbMarks] = useState('1');
  const [qbRubric, setQbRubric] = useState('');
  const [qbImageUrl, setQbImageUrl] = useState('');

  const chapters = useMemo(() => {
    if (scopes.length === 0) return ALL_CHAPTERS;
    return ALL_CHAPTERS.filter((ch) =>
      scopes.some((s) => s.isActive && s.classLevel === ch.classLevel && s.subject === ch.subject)
    );
  }, [scopes]);

  const sectionOptions = useMemo(() => {
    const chapter = ALL_CHAPTERS.find((c) => c.id === chapterId);
    if (!chapter) return [];
    return Array.from(
      new Set(
        scopes
          .filter((s) => s.isActive && s.classLevel === chapter.classLevel && s.subject === chapter.subject && s.section)
          .map((s) => s.section || '')
          .filter(Boolean)
      )
    );
  }, [chapterId, scopes]);

  const packs = useMemo(
    () => [...(config?.assignmentPacks ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [config?.assignmentPacks]
  );
  const selectedPack = packs.find((p) => p.packId === selectedPackId) ?? null;
  const selectedChapter = useMemo(
    () => (selectedPack ? ALL_CHAPTERS.find((chapter) => chapter.id === selectedPack.chapterId) ?? null : null),
    [selectedPack]
  );
  const selectedPackQuestionRows = useMemo(() => {
    if (!selectedPack) return [];
    const rows: Array<{ questionNo: string; defaultMax: number }> = [];
    const getMetaMax = (questionNo: string, fallback: number) => {
      const maxMarks = selectedPack.questionMeta?.[questionNo]?.maxMarks;
      if (!Number.isFinite(Number(maxMarks))) return fallback;
      return Math.max(0.25, Number(maxMarks));
    };
    for (let idx = 0; idx < selectedPack.mcqs.length; idx++) {
      const questionNo = `Q${idx + 1}`;
      rows.push({ questionNo, defaultMax: getMetaMax(questionNo, 1) });
    }
    for (let idx = 0; idx < selectedPack.shortAnswers.length; idx++) {
      const questionNo = `S${idx + 1}`;
      rows.push({ questionNo, defaultMax: getMetaMax(questionNo, 1) });
    }
    for (let idx = 0; idx < selectedPack.longAnswers.length; idx++) {
      const questionNo = `L${idx + 1}`;
      rows.push({ questionNo, defaultMax: getMetaMax(questionNo, 2) });
    }
    return rows;
  }, [selectedPack]);
  const studentProgressRows = useMemo(() => {
    const attempts = summary?.attemptsByStudent ?? [];
    const grouped = new Map<
      string,
      {
        studentName: string;
        submissionCode: string;
        attempts: number;
        scoreTotal: number;
        weakMap: Map<string, number>;
        latestSubmittedAt: string;
        latestStatus: 'pending_review' | 'graded' | 'released';
      }
    >();
    for (const attempt of attempts) {
      const key = `${attempt.submissionCode}::${attempt.studentName}`;
      const score = Number.isFinite(Number(attempt.grading?.percentage))
        ? Number(attempt.grading?.percentage)
        : Number(attempt.scoreEstimate || 0);
      const bucket = grouped.get(key) ?? {
        studentName: attempt.studentName,
        submissionCode: attempt.submissionCode,
        attempts: 0,
        scoreTotal: 0,
        weakMap: new Map<string, number>(),
        latestSubmittedAt: attempt.submittedAt,
        latestStatus: attempt.status,
      };
      bucket.attempts += 1;
      bucket.scoreTotal += Math.max(0, Math.min(100, score));
      if (attempt.submittedAt > bucket.latestSubmittedAt) {
        bucket.latestSubmittedAt = attempt.submittedAt;
        bucket.latestStatus = attempt.status;
      }
      for (const weak of attempt.weakTopics ?? []) {
        const clean = weak.trim().toLowerCase();
        if (!clean) continue;
        bucket.weakMap.set(clean, (bucket.weakMap.get(clean) ?? 0) + 1);
      }
      grouped.set(key, bucket);
    }
    return [...grouped.values()]
      .map((bucket) => ({
        studentName: bucket.studentName,
        submissionCode: bucket.submissionCode,
        attempts: bucket.attempts,
        averageScore: Math.round(bucket.scoreTotal / Math.max(1, bucket.attempts)),
        weakTags: [...bucket.weakMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([topic]) => topic),
        latestStatus: bucket.latestStatus,
        latestSubmittedAt: bucket.latestSubmittedAt,
      }))
      .sort((a, b) => a.averageScore - b.averageScore)
      .slice(0, 24);
  }, [summary?.attemptsByStudent]);

  async function loadConfig() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, configRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher', { cache: 'no-store' }),
      ]);
      const sessionData = await sessionRes.json().catch(() => null);
      if (!sessionRes.ok || !sessionData) {
        router.replace('/teacher/login');
        return;
      }
      const nextScopes = Array.isArray(sessionData.effectiveScopes) ? (sessionData.effectiveScopes as TeacherScope[]) : [];
      setScopes(nextScopes);
      setTeacherName(String(sessionData.teacher?.name || 'Teacher'));
      if (!chapterId && chapters.length > 0) setChapterId(chapters[0].id);

      const cfg = (await configRes.json().catch(() => null)) as TeacherConfigResponse | null;
      if (!configRes.ok || !cfg) {
        setError((cfg as { error?: string } | null)?.error || 'Failed to load dashboard.');
        return;
      }
      setConfig(cfg);
      if (!selectedPackId && (cfg.assignmentPacks ?? []).length > 0) {
        setSelectedPackId((cfg.assignmentPacks ?? [])[0].packId);
      }
    } catch {
      setError('Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }

  async function loadQuestionBank() {
    if (!chapterId) return;
    try {
      const response = await fetch(`/api/teacher/question-bank/item?chapterId=${encodeURIComponent(chapterId)}`, {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data) setQbItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      // no-op
    }
  }

  useEffect(() => {
    void loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!chapterId || !config) return;
    setTopics(config.importantTopics?.[chapterId]?.join(', ') ?? '');
    setQuizLink(config.quizLinks?.[chapterId] ?? '');
    void loadQuestionBank();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, config?.updatedAt]);

  useEffect(() => {
    if (sectionOptions.length === 0) {
      setSection('');
      return;
    }
    if (!section || !sectionOptions.includes(section)) setSection(sectionOptions[0]);
  }, [sectionOptions, section]);

  useEffect(() => {
    if (!selectedPackId) return;
    async function run() {
      const response = await fetch(`/api/teacher/submission-summary?packId=${encodeURIComponent(selectedPackId)}`, {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      setSummary(response.ok && data ? (data as TeacherSubmissionSummary) : null);
    }
    void run();
  }, [selectedPackId]);

  async function postTeacherAction(payload: Record<string, unknown>) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Update failed.');
        return false;
      }
      await loadConfig();
      return true;
    } catch {
      setError('Update failed.');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function createDraftPack() {
    const chapter = ALL_CHAPTERS.find((c) => c.id === chapterId);
    if (!chapter) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/teacher/assignment-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId,
          classLevel: chapter.classLevel,
          subject: chapter.subject,
          questionCount,
          difficultyMix,
          includeShortAnswers,
          includeFormulaDrill,
          dueDate: dueDate || undefined,
          section: section || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.packId) {
        setError(data?.error || 'Failed to create draft pack.');
        return;
      }
      setSelectedPackId(String(data.packId));
      await loadConfig();
    } catch {
      setError('Failed to create draft pack.');
    } finally {
      setLoading(false);
    }
  }

  async function mutatePack(action: 'regenerate' | 'approve' | 'publish' | 'archive', packId: string) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/teacher/assignment-pack/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packId,
          feedback: feedback || undefined,
          questionCount: action === 'regenerate' ? questionCount : undefined,
          difficultyMix: action === 'regenerate' ? difficultyMix : undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || `Failed to ${action} pack.`);
        return;
      }
      if (action === 'regenerate') setFeedback('');
      await loadConfig();
      setSelectedPackId(packId);
    } catch {
      setError(`Failed to ${action} pack.`);
    } finally {
      setLoading(false);
    }
  }

  async function createQuestion() {
    if (!chapterId || !qbPrompt.trim()) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/teacher/question-bank/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId,
          kind: qbKind,
          prompt: qbPrompt,
          options: qbKind === 'mcq' ? qbOptions.split('\n').map((x) => x.trim()).filter(Boolean) : undefined,
          answerIndex: qbKind === 'mcq' ? Number(qbAnswerIndex) : undefined,
          maxMarks: Number(qbMarks),
          rubric: qbRubric || undefined,
          imageUrl: qbImageUrl || undefined,
          section: section || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Failed to create question.');
        return;
      }
      setQbPrompt('');
      setQbOptions('');
      setQbRubric('');
      setQbImageUrl('');
      setQbMarks('1');
      setQbAnswerIndex('0');
      await loadQuestionBank();
    } catch {
      setError('Failed to create question.');
    } finally {
      setLoading(false);
    }
  }

  async function deleteQuestion(itemId: string) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/teacher/question-bank/item/${itemId}`, { method: 'DELETE' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Failed to delete question.');
        return;
      }
      await loadQuestionBank();
    } catch {
      setError('Failed to delete question.');
    } finally {
      setLoading(false);
    }
  }

  async function gradeAttempt(submissionId: string) {
    const rows = gradeDrafts[submissionId] ?? {};
    const questionGrades = Object.entries(rows)
      .map(([questionNo, row]) => ({
        questionNo,
        scoreAwarded: Number(row.s),
        maxScore: Number(row.m),
        feedback: row.f || undefined,
      }))
      .filter((row) => Number.isFinite(row.scoreAwarded) && Number.isFinite(row.maxScore));
    if (questionGrades.length === 0) {
      setError('Enter at least one question mark before grading.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/teacher/submission/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, questionGrades }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Failed to grade submission.');
        return;
      }
      if (selectedPackId) {
        const res = await fetch(`/api/teacher/submission-summary?packId=${encodeURIComponent(selectedPackId)}`, {
          cache: 'no-store',
        });
        const summaryData = await res.json().catch(() => null);
        if (res.ok && summaryData) setSummary(summaryData as TeacherSubmissionSummary);
      }
    } catch {
      setError('Failed to grade submission.');
    } finally {
      setLoading(false);
    }
  }

  async function releaseResults() {
    if (!selectedPackId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/teacher/submission/release-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: selectedPackId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Failed to release results.');
        return;
      }
      const res = await fetch(`/api/teacher/submission-summary?packId=${encodeURIComponent(selectedPackId)}`, {
        cache: 'no-store',
      });
      const summaryData = await res.json().catch(() => null);
      if (res.ok && summaryData) setSummary(summaryData as TeacherSubmissionSummary);
    } catch {
      setError('Failed to release results.');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch('/api/teacher/session/logout', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
    }).catch(() => undefined);
    window.location.assign('/teacher/login?logout=1');
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 text-white px-5 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-fraunces text-2xl sm:text-3xl font-bold">Teacher Assessment Desk</h1>
              <p className="text-amber-100 text-sm mt-1.5">Welcome, {teacherName}.</p>
              <p className="text-amber-100 text-sm mt-1">Draft to Review to Publish. Teacher grading is final. Results release is manual.</p>
            </div>
            <button onClick={logout} className="self-start text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg border border-white/30">Logout</button>
          </div>
          <p className="text-[11px] mt-2 text-amber-50">Updated: {fmt(config?.updatedAt)}</p>
        </div>

        <div className={`rounded-xl border px-4 py-3 text-xs ${config?.storageStatus?.mode === 'connected' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <span className="font-semibold">Storage:</span> {config?.storageStatus?.message || 'Status unavailable'}
        </div>

        <div className="grid lg:grid-cols-3 gap-5 min-w-0">
          <div className="lg:col-span-2 space-y-5 min-w-0">
            <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
              <h2 className="font-fraunces text-lg font-bold text-navy-700">Chapter Controls</h2>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <select value={chapterId} onChange={(event) => setChapterId(event.target.value)} className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2">
                  {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>Class {chapter.classLevel} - {chapter.subject} - {chapter.title}</option>)}
                </select>
                {sectionOptions.length > 0 ? (
                  <select value={section} onChange={(event) => setSection(event.target.value)} className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2">
                    {sectionOptions.map((item) => <option key={item} value={item}>Section {item}</option>)}
                  </select>
                ) : (
                  <div className="text-xs text-[#6A6A84] border border-[#E8E4DC] rounded-xl px-3 py-2 flex items-center">All sections scope</div>
                )}
              </div>

              <textarea value={topics} onChange={(event) => setTopics(event.target.value)} rows={3} placeholder="Important topics (comma separated)" className="w-full mt-3 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5" />
              <button disabled={loading || !chapterId} onClick={() => postTeacherAction({ action: 'set-important-topics', chapterId, section: section || undefined, topics: topics.split(',').map((item) => item.trim()).filter(Boolean) })} className="mt-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl disabled:opacity-50">Save important topics</button>

              <input value={quizLink} onChange={(event) => setQuizLink(event.target.value)} placeholder="Google Form quiz URL" className="w-full mt-3 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5" />
              <button disabled={loading || !chapterId} onClick={() => postTeacherAction({ action: 'set-quiz-link', chapterId, section: section || undefined, url: quizLink })} className="mt-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl disabled:opacity-50">Save quiz link</button>
            </div>

            <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
              <h2 className="font-fraunces text-lg font-bold text-navy-700">Assignment Draft Workflow</h2>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <input type="number" min={4} max={24} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
                <input value={difficultyMix} onChange={(event) => setDifficultyMix(event.target.value)} className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
              </div>
              <div className="mt-2 text-xs text-[#5F5A73] flex gap-3">
                <label><input type="checkbox" checked={includeShortAnswers} onChange={(event) => setIncludeShortAnswers(event.target.checked)} /> Short answers</label>
                <label><input type="checkbox" checked={includeFormulaDrill} onChange={(event) => setIncludeFormulaDrill(event.target.checked)} /> Formula drill</label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={loading || !chapterId} onClick={createDraftPack} className="text-sm font-semibold bg-saffron-500 hover:bg-saffron-600 text-white px-4 py-2 rounded-xl disabled:opacity-50">Generate Draft</button>
                {selectedPack && (
                  <>
                    <button disabled={loading} onClick={() => mutatePack('approve', selectedPack.packId)} className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl disabled:opacity-50">Approve</button>
                    <button disabled={loading} onClick={() => mutatePack('publish', selectedPack.packId)} className="text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl disabled:opacity-50">Publish</button>
                    <button disabled={loading} onClick={() => mutatePack('archive', selectedPack.packId)} className="text-sm font-semibold border border-rose-200 text-rose-700 bg-rose-50 px-4 py-2 rounded-xl disabled:opacity-50">Archive</button>
                  </>
                )}
              </div>
              <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={3} placeholder="Teacher feedback for regenerate" className="w-full mt-3 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5" />
              {selectedPack && (
                <button disabled={loading} onClick={() => mutatePack('regenerate', selectedPack.packId)} className="mt-2 text-sm font-semibold border border-indigo-200 text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 disabled:opacity-50">Regenerate from feedback</button>
              )}
            </div>

            <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
              <h2 className="font-fraunces text-lg font-bold text-navy-700">Question Builder</h2>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <select value={qbKind} onChange={(event) => setQbKind(event.target.value as QuestionKind)} className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2">
                  <option value="mcq">MCQ</option>
                  <option value="short">Short Answer</option>
                  <option value="long">Long Answer</option>
                </select>
                <input value={qbMarks} onChange={(event) => setQbMarks(event.target.value)} placeholder="Max marks" className="text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
              </div>
              <textarea value={qbPrompt} onChange={(event) => setQbPrompt(event.target.value)} rows={3} placeholder="Question prompt" className="w-full mt-3 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5" />
              {qbKind === 'mcq' && (
                <>
                  <textarea value={qbOptions} onChange={(event) => setQbOptions(event.target.value)} rows={4} placeholder="Options (one per line)" className="w-full mt-3 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5" />
                  <input value={qbAnswerIndex} onChange={(event) => setQbAnswerIndex(event.target.value)} placeholder="Answer index (0-3)" className="w-full mt-2 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5" />
                </>
              )}
              <textarea value={qbRubric} onChange={(event) => setQbRubric(event.target.value)} rows={2} placeholder="Rubric / instructions" className="w-full mt-3 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5" />
              <input value={qbImageUrl} onChange={(event) => setQbImageUrl(event.target.value)} placeholder="Optional image URL" className="w-full mt-2 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5" />
              <button disabled={loading || !chapterId} onClick={createQuestion} className="mt-3 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl disabled:opacity-50">Add Question</button>
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
                {qbItems.slice(0, 24).map((item) => (
                  <div key={item.id} className="rounded-xl border border-[#E8E4DC] bg-[#F9F8F4] px-3 py-2">
                    <p className="text-xs font-semibold text-[#1F1F35]">{item.kind.toUpperCase()} | {item.maxMarks} marks</p>
                    <p className="text-xs text-[#4A4A6A] mt-1">{item.prompt}</p>
                    <button onClick={() => deleteQuestion(item.id)} className="mt-1 text-[11px] font-semibold text-rose-700 hover:text-rose-800">Delete</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
              <h2 className="font-fraunces text-lg font-bold text-navy-700">Announcements</h2>
              <input value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} placeholder="Announcement title" className="w-full mt-3 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5" />
              <textarea value={announcementBody} onChange={(event) => setAnnouncementBody(event.target.value)} rows={3} placeholder="Announcement body" className="w-full mt-3 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5" />
              <button disabled={loading} onClick={async () => {
                const ok = await postTeacherAction({ action: 'add-announcement', chapterId: chapterId || undefined, section: section || undefined, title: announcementTitle, body: announcementBody });
                if (ok) {
                  setAnnouncementTitle('');
                  setAnnouncementBody('');
                }
              }} className="mt-2 text-sm font-semibold bg-saffron-500 hover:bg-saffron-600 text-white px-4 py-2 rounded-xl disabled:opacity-50">Publish announcement</button>
            </div>
          </div>

          <div className="space-y-5 min-w-0">
            <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
              <p className="text-xs font-semibold text-indigo-900">Assignments completed this week</p>
              <p className="text-xl font-bold text-indigo-700">{config?.assignmentAnalytics?.assignmentsCompletedThisWeek ?? 0}</p>
              <p className="text-xs font-semibold text-emerald-900 mt-3">Submissions this week</p>
              <p className="text-xl font-bold text-emerald-700">{config?.assignmentAnalytics?.submissionsThisWeek ?? 0}</p>
            </div>

            <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
              <p className="text-xs font-semibold text-[#2C2A3A]">Assignment packs</p>
              <div className="mt-2 space-y-2 max-h-72 overflow-y-auto pr-1">
                {packs.slice(0, 20).map((pack) => (
                  <div key={pack.packId} className="rounded-xl border border-[#E8E4DC] bg-[#F9F8F4] px-3 py-2 min-w-0">
                    <p className="text-xs font-semibold text-[#20203A]">{pack.title}</p>
                    <p className="text-[11px] text-[#6A6A84] mt-0.5">{pack.status} | due {pack.dueDate || 'NA'}</p>
                    <div className="mt-1.5 flex gap-2 text-[11px] flex-wrap">
                      <Link href={pack.shareUrl} className="text-indigo-700 font-semibold hover:text-indigo-800">Student view</Link>
                      <Link href={`/exam/assignment/${pack.packId}`} className="text-emerald-700 font-semibold hover:text-emerald-800">Exam mode</Link>
                      <button onClick={() => setSelectedPackId(pack.packId)} className="text-saffron-700 font-semibold hover:text-saffron-800">Grade desk</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#2C2A3A]">Grading Desk</p>
                <button onClick={releaseResults} disabled={loading || !selectedPackId} className="text-[11px] font-semibold bg-emerald-600 text-white px-2.5 py-1 rounded-lg disabled:opacity-50">Release Results</button>
              </div>
              {selectedPack && (
                <div className="mt-2 rounded-lg border border-[#E8E4DC] bg-[#F9F8F4] px-2.5 py-2 text-[11px] text-[#4A4A6A] break-words">
                  <p className="font-semibold text-[#1F1F35]">{selectedPack.title}</p>
                  <p className="mt-0.5">
                    Chapter: {selectedChapter?.title ?? selectedPack.chapterId}
                    {selectedPack.portion ? ` | Portion: ${selectedPack.portion}` : ''}
                    {selectedPack.dueDate ? ` | Due: ${selectedPack.dueDate}` : ''}
                  </p>
                </div>
              )}
              <p className="mt-1 text-[11px] text-[#6A6A84]">Pending: {summary?.pendingReviewCount ?? 0} | Graded: {summary?.gradedCount ?? 0} | Released: {summary?.releasedCount ?? 0}</p>
              <div className="mt-3 space-y-2 max-h-[34rem] overflow-y-auto pr-1">
                {(summary?.attemptsByStudent ?? []).slice(0, 18).map((attempt) => {
                  const draftRows = gradeDrafts[attempt.submissionId] ?? {};
                  const questionList = selectedPackQuestionRows.length > 0
                    ? selectedPackQuestionRows
                    : [{ questionNo: 'Q1', defaultMax: 1 }];
                  return (
                    <div key={attempt.submissionId} className="rounded-xl border border-[#E8E4DC] bg-[#F9F8F4] px-3 py-2">
                      <p className="text-xs font-semibold text-[#1f1f35]">{attempt.studentName} ({attempt.submissionCode})</p>
                      <p className="text-[11px] text-[#4a4a6a]">Attempt {attempt.attemptNo} | {attempt.status} | {fmt(attempt.submittedAt)}</p>
                      <div className="mt-2 space-y-1">
                        {questionList.map((questionRow) => {
                          const questionNo = questionRow.questionNo;
                          const existingGrade = attempt.grading?.questionGrades.find((grade) => grade.questionNo === questionNo);
                          const scoreValue = draftRows[questionNo]?.s ?? (existingGrade ? String(existingGrade.scoreAwarded) : '');
                          const maxValue =
                            draftRows[questionNo]?.m ??
                            (existingGrade ? String(existingGrade.maxScore) : String(questionRow.defaultMax));
                          const feedbackValue = draftRows[questionNo]?.f ?? (existingGrade?.feedback ?? '');
                          return (
                          <div key={`${attempt.submissionId}-${questionNo}`} className="grid grid-cols-1 sm:grid-cols-12 gap-1.5 items-center">
                            <span className="text-[11px] text-[#4a4a6a] sm:col-span-2">{questionNo}</span>
                            <input value={scoreValue} onChange={(e) => setGradeDrafts((prev) => ({ ...prev, [attempt.submissionId]: { ...(prev[attempt.submissionId] ?? {}), [questionNo]: { s: e.target.value, m: maxValue, f: feedbackValue } } }))} placeholder="score" className="text-[11px] border border-[#E8E4DC] rounded px-1.5 py-1.5 sm:col-span-2 w-full" />
                            <input value={maxValue} onChange={(e) => setGradeDrafts((prev) => ({ ...prev, [attempt.submissionId]: { ...(prev[attempt.submissionId] ?? {}), [questionNo]: { s: scoreValue || '0', m: e.target.value, f: feedbackValue } } }))} placeholder="max" className="text-[11px] border border-[#E8E4DC] rounded px-1.5 py-1.5 sm:col-span-2 w-full" />
                            <input value={feedbackValue} onChange={(e) => setGradeDrafts((prev) => ({ ...prev, [attempt.submissionId]: { ...(prev[attempt.submissionId] ?? {}), [questionNo]: { s: scoreValue || '0', m: maxValue, f: e.target.value } } }))} placeholder="feedback" className="text-[11px] border border-[#E8E4DC] rounded px-1.5 py-1.5 sm:col-span-6 w-full" />
                          </div>
                          );
                        })}
                      </div>
                      <button onClick={() => gradeAttempt(attempt.submissionId)} className="mt-2 text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg">Save Grades</button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 rounded-xl border border-[#E8E4DC] bg-[#FAF9F5] px-3 py-2">
                <p className="text-[11px] font-semibold text-[#2C2A3A]">Student Performance Snapshot</p>
                <div className="mt-2 max-h-48 overflow-y-auto pr-1 space-y-1.5">
                  {studentProgressRows.map((row) => (
                    <div key={`${row.submissionCode}-${row.studentName}`} className="rounded-lg border border-[#E8E4DC] bg-white px-2.5 py-1.5">
                      <p className="text-[11px] font-semibold text-[#1F1F35]">
                        {row.studentName} ({row.submissionCode}) - {row.averageScore}%
                      </p>
                      <p className="text-[10px] text-[#5F5A73]">
                        Attempts: {row.attempts} | Status: {row.latestStatus} | Last: {fmt(row.latestSubmittedAt)}
                      </p>
                      {row.weakTags.length > 0 && (
                        <p className="text-[10px] text-[#5F5A73] mt-0.5">
                          Weak tags: {row.weakTags.join(' | ')}
                        </p>
                      )}
                    </div>
                  ))}
                  {studentProgressRows.length === 0 && (
                    <p className="text-[11px] text-[#6A6A84]">No attempts yet.</p>
                  )}
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-[#E8E4DC] bg-white px-3 py-2">
                <p className="text-[11px] font-semibold text-[#2C2A3A]">Assessment Table</p>
                <div className="mt-2 max-h-64 overflow-auto">
                  <table className="min-w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-[#6A6A84]">
                        <th className="px-2 py-1.5 font-semibold">Student</th>
                        <th className="px-2 py-1.5 font-semibold">Code</th>
                        <th className="px-2 py-1.5 font-semibold">Attempt</th>
                        <th className="px-2 py-1.5 font-semibold">Chapter</th>
                        <th className="px-2 py-1.5 font-semibold">Portion</th>
                        <th className="px-2 py-1.5 font-semibold">Teacher</th>
                        <th className="px-2 py-1.5 font-semibold">Marks</th>
                        <th className="px-2 py-1.5 font-semibold">%</th>
                        <th className="px-2 py-1.5 font-semibold">Status</th>
                        <th className="px-2 py-1.5 font-semibold">Submitted</th>
                        <th className="px-2 py-1.5 font-semibold">Released</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary?.attemptsByStudent ?? []).slice(0, 120).map((attempt) => (
                        <tr key={`table-${attempt.submissionId}`} className="border-t border-[#F0ECE3] text-[#2C2A3A]">
                          <td className="px-2 py-1.5 font-medium">{attempt.studentName}</td>
                          <td className="px-2 py-1.5">{attempt.submissionCode}</td>
                          <td className="px-2 py-1.5">A{attempt.attemptNo}</td>
                          <td className="px-2 py-1.5">{selectedChapter?.title ?? selectedPack?.chapterId ?? 'NA'}</td>
                          <td className="px-2 py-1.5">{selectedPack?.portion || 'Full chapter'}</td>
                          <td className="px-2 py-1.5">{teacherName}</td>
                          <td className="px-2 py-1.5">
                            {attempt.grading ? `${attempt.grading.totalScore}/${attempt.grading.maxScore}` : '--'}
                          </td>
                          <td className="px-2 py-1.5">
                            {attempt.grading ? `${attempt.grading.percentage}%` : `${attempt.scoreEstimate}%`}
                          </td>
                          <td className="px-2 py-1.5">{attempt.status}</td>
                          <td className="px-2 py-1.5">{fmt(attempt.submittedAt)}</td>
                          <td className="px-2 py-1.5">{attempt.releasedAt ? fmt(attempt.releasedAt) : 'Not released'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(summary?.attemptsByStudent ?? []).length === 0 && (
                    <p className="text-[11px] text-[#6A6A84] px-2 py-2">No graded attempts available yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      </div>
    </div>
  );
}
