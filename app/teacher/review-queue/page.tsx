'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BookOpenCheck, CheckCircle2, Clock3, MessageSquare, RefreshCw, Users } from 'lucide-react';

type TeacherAssignmentPack = {
  packId: string;
  title: string;
  chapterId: string;
  subject: string;
  status: string;
  updatedAt: string;
  questionMeta?: Record<string, { weakSignal?: boolean; quality?: 'strong' | 'weak' | 'needs-review' }>;
};

type TeacherSubmissionAttemptRow = {
  submissionId: string;
  studentName: string;
  scoreEstimate: number;
  status: 'pending_review' | 'graded' | 'released';
  weakTopics?: string[];
  integritySummary?: {
    riskLevel?: 'low' | 'medium' | 'high';
  };
};

type TeacherSubmissionSummary = {
  pendingReviewCount: number;
  attemptsByStudent: TeacherSubmissionAttemptRow[];
};

type StudentQuestion = {
  id: string;
  chapterId: string;
  subject: string;
  question: string;
  studentName?: string;
  createdAt: string;
};

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function extractApiMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'message' in (payload as Record<string, unknown>)) {
    const maybe = (payload as Record<string, unknown>).message;
    if (typeof maybe === 'string' && maybe.trim()) return maybe.trim();
  }
  return fallback;
}

interface QueueStudentRisk {
  id: string;
  studentName: string;
  packTitle: string;
  scoreEstimate: number;
  reason: string;
}

export default function TeacherReviewQueuePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [packs, setPacks] = useState<TeacherAssignmentPack[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<StudentQuestion[]>([]);
  const [submissionSummaries, setSubmissionSummaries] = useState<Record<string, TeacherSubmissionSummary>>({});

  async function loadQueue() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, configRes, questionRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher', { cache: 'no-store' }),
        fetch('/api/teacher/questions?status=pending', { cache: 'no-store' }),
      ]);

      if (!sessionRes.ok) {
        setError('Session expired. Please sign in again.');
        return;
      }

      const configBody = unwrap<{ assignmentPacks?: TeacherAssignmentPack[] } | null>(await configRes.json().catch(() => null));
      const questionBody = unwrap<StudentQuestion[] | null>(await questionRes.json().catch(() => null));
      if (!configRes.ok) {
        setError(extractApiMessage(configBody, 'Failed to load assignment queue data.'));
        return;
      }
      if (!questionRes.ok) {
        setError(extractApiMessage(questionBody, 'Failed to load pending questions.'));
        return;
      }

      const nextPacks = Array.isArray(configBody?.assignmentPacks)
        ? configBody.assignmentPacks
          .filter((pack) => pack.status === 'published' || pack.status === 'review')
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : [];
      setPacks(nextPacks);
      setPendingQuestions(Array.isArray(questionBody) ? questionBody : []);

      const targetPacks = nextPacks.slice(0, 8);
      const summaryPairs = await Promise.all(
        targetPacks.map(async (pack) => {
          const res = await fetch(`/api/teacher/submission-summary?packId=${encodeURIComponent(pack.packId)}`, { cache: 'no-store' });
          const body = unwrap<TeacherSubmissionSummary | null>(await res.json().catch(() => null));
          if (!res.ok || !body) return [pack.packId, null] as const;
          return [pack.packId, body] as const;
        })
      );

      const nextSummaries: Record<string, TeacherSubmissionSummary> = {};
      for (const [packId, summary] of summaryPairs) {
        if (summary) nextSummaries[packId] = summary;
      }
      setSubmissionSummaries(nextSummaries);
    } catch {
      setError('Failed to load review queue.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  const ungradedQueue = useMemo(() => {
    return packs
      .map((pack) => ({
        pack,
        pending: submissionSummaries[pack.packId]?.pendingReviewCount ?? 0,
      }))
      .filter((item) => item.pending > 0)
      .sort((a, b) => b.pending - a.pending);
  }, [packs, submissionSummaries]);

  const weakQuestionQueue = useMemo(() => {
    return packs
      .map((pack) => {
        const meta = pack.questionMeta || {};
        const flagged = Object.values(meta).filter((entry) => entry.weakSignal || entry.quality === 'weak' || entry.quality === 'needs-review').length;
        return { pack, flagged };
      })
      .filter((item) => item.flagged > 0)
      .sort((a, b) => b.flagged - a.flagged);
  }, [packs]);

  const studentAttentionQueue = useMemo<QueueStudentRisk[]>(() => {
    const items: QueueStudentRisk[] = [];
    for (const pack of packs) {
      const summary = submissionSummaries[pack.packId];
      if (!summary) continue;
      for (const attempt of summary.attemptsByStudent || []) {
        const lowScore = Number.isFinite(attempt.scoreEstimate) && attempt.scoreEstimate < 40;
        const highRisk = attempt.integritySummary?.riskLevel === 'high';
        if (!lowScore && !highRisk) continue;
        const reason = highRisk ? 'High integrity risk event' : 'Low estimated score';
        items.push({
          id: `${pack.packId}:${attempt.submissionId}`,
          studentName: attempt.studentName,
          packTitle: pack.title,
          scoreEstimate: attempt.scoreEstimate,
          reason,
        });
      }
    }
    return items.slice(0, 12);
  }, [packs, submissionSummaries]);

  const totalUngraded = ungradedQueue.reduce((sum, item) => sum + item.pending, 0);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700">Review Queue</h1>
          <p className="mt-1 text-sm text-gray-500">Ungraded submissions, weak generated questions, and students needing intervention.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadQueue()}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50"
        >
          <span className="inline-flex items-center gap-1.5"><RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> Refresh</span>
        </button>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Ungraded Submissions</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1C2E]">{totalUngraded}</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Pending Student Questions</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1C2E]">{pendingQuestions.length}</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Weak Generated Questions</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1C2E]">{weakQuestionQueue.reduce((sum, item) => sum + item.flagged, 0)}</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Students Need Attention</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1C2E]">{studentAttentionQueue.length}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Ungraded Submission Queue</h2>
          <div className="mt-3 space-y-2">
            {ungradedQueue.map(({ pack, pending }) => (
              <div key={pack.packId} className="rounded-xl border border-[#E8E4DC] bg-[#FCFBF8] px-3 py-2">
                <p className="text-sm font-semibold text-gray-900">{pack.title}</p>
                <p className="mt-0.5 text-xs text-gray-600">{pack.subject} | {pending} pending review</p>
              </div>
            ))}
            {ungradedQueue.length === 0 ? <p className="text-xs text-gray-500">No ungraded submissions in the current queue.</p> : null}
          </div>
          <Link href="/teacher/grading" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800"><BookOpenCheck className="h-3.5 w-3.5" />Open grading desk</Link>
        </section>

        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Pending Student Questions</h2>
          <div className="mt-3 space-y-2">
            {pendingQuestions.slice(0, 8).map((question) => (
              <div key={question.id} className="rounded-xl border border-[#E8E4DC] bg-[#FCFBF8] px-3 py-2">
                <p className="text-sm font-semibold text-gray-900">{question.subject} - {question.chapterId}</p>
                <p className="mt-1 text-xs text-gray-700 line-clamp-2">{question.question}</p>
              </div>
            ))}
            {pendingQuestions.length === 0 ? <p className="text-xs text-gray-500">No pending student questions.</p> : null}
          </div>
          <Link href="/teacher/questions" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800"><MessageSquare className="h-3.5 w-3.5" />Open Q&A board</Link>
        </section>

        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Weak Generated Questions</h2>
          <div className="mt-3 space-y-2">
            {weakQuestionQueue.map(({ pack, flagged }) => (
              <div key={pack.packId} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-sm font-semibold text-amber-900">{pack.title}</p>
                <p className="mt-0.5 text-xs text-amber-800">{flagged} question(s) flagged as weak / needs review.</p>
              </div>
            ))}
            {weakQuestionQueue.length === 0 ? <p className="text-xs text-gray-500">No weak question flags right now.</p> : null}
          </div>
          <Link href="/teacher/assignments" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800"><Clock3 className="h-3.5 w-3.5" />Open assignment packs</Link>
        </section>

        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Students Needing Attention</h2>
          <div className="mt-3 space-y-2">
            {studentAttentionQueue.map((item) => (
              <div key={item.id} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                <p className="text-sm font-semibold text-rose-900">{item.studentName} | {item.packTitle}</p>
                <p className="mt-0.5 text-xs text-rose-800">{item.reason} {Number.isFinite(item.scoreEstimate) ? `(${item.scoreEstimate}%)` : ''}</p>
              </div>
            ))}
            {studentAttentionQueue.length === 0 ? <p className="text-xs text-gray-500">No students flagged for immediate intervention.</p> : null}
          </div>
          <Link href="/teacher/students" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800"><Users className="h-3.5 w-3.5" />Open student insights</Link>
        </section>
      </div>

      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />Queue items refresh based on latest submissions, question activity, and AI quality signals.</span>
      </div>

      {!loading ? (
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Review queue synced
        </div>
      ) : null}
    </div>
  );
}
