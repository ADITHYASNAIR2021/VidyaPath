import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { ALL_CHAPTERS } from '@/lib/data';
import { getAnalyticsSummary } from '@/lib/analytics-store';
import { readStateFromSupabase, writeStateToSupabase } from '@/lib/persistence/supabase-state';
import type { RevisionWeek } from '@/lib/ai/validators';
import type {
  PublicTeacherConfig,
  TeacherActionHistoryEntry,
  TeacherAnnouncement,
  TeacherAssignmentAnalytics,
  TeacherAssignmentPack,
  TeacherClassPreset,
  TeacherSubmission,
  TeacherSubmissionAnswer,
  TeacherSubmissionResult,
  TeacherSubmissionSummary,
  TeacherWeeklyPlan,
} from '@/lib/teacher-types';

interface TeacherStoreState {
  updatedAt: string;
  importantTopics: Record<string, string[]>;
  quizLinks: Record<string, string>;
  announcements: TeacherAnnouncement[];
  assignmentPacks: Record<string, TeacherAssignmentPack>;
  submissionsByPack: Record<string, TeacherSubmission[]>;
  weeklyPlans: Record<string, TeacherWeeklyPlan>;
  actionHistory: TeacherActionHistoryEntry[];
}

export interface PrivateTeacherConfig extends PublicTeacherConfig {
  analytics: Awaited<ReturnType<typeof getAnalyticsSummary>>;
  assignmentAnalytics: TeacherAssignmentAnalytics;
  assignmentPacks: TeacherAssignmentPack[];
  actionHistory: TeacherActionHistoryEntry[];
}

const RUNTIME_DIR = path.join(process.cwd(), 'lib', 'runtime');
const TEACHER_STORE_PATH = path.join(RUNTIME_DIR, 'teacher-config.json');
const TEACHER_STATE_KEY = 'teacher_store_v2';

const EMPTY_STATE: TeacherStoreState = {
  updatedAt: new Date().toISOString(),
  importantTopics: {},
  quizLinks: {},
  announcements: [],
  assignmentPacks: {},
  submissionsByPack: {},
  weeklyPlans: {},
  actionHistory: [],
};

let memoryState: TeacherStoreState = EMPTY_STATE;

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeText(value: string, max = 220): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeTopicList(items: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const clean = sanitizeText(item, 120);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= 12) break;
  }
  return output;
}

function sanitizeQuestionNo(value: string): string {
  return sanitizeText(value, 30).toUpperCase();
}

function sanitizeSubmissionCode(value: string): string {
  return sanitizeText(value, 60).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function asObjectRecord<T>(value: unknown, fallback: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return value as T;
}

function ensureStateShape(parsed: unknown): TeacherStoreState {
  const record = asObjectRecord(parsed, EMPTY_STATE);
  return {
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : nowIso(),
    importantTopics: asObjectRecord(record.importantTopics, {}),
    quizLinks: asObjectRecord(record.quizLinks, {}),
    announcements: Array.isArray(record.announcements) ? record.announcements : [],
    assignmentPacks: asObjectRecord(record.assignmentPacks, {}),
    submissionsByPack: asObjectRecord(record.submissionsByPack, {}),
    weeklyPlans: asObjectRecord(record.weeklyPlans, {}),
    actionHistory: Array.isArray(record.actionHistory) ? record.actionHistory : [],
  };
}

function buildId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getWeekStart(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const shift = day === 0 ? 6 : day - 1;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - shift);
  return copy;
}

function getTeacherKeyId(rawKey: string): string {
  const normalized = sanitizeText(rawKey, 100);
  if (!normalized) return 'unknown';
  const digest = createHash('sha1').update(normalized).digest('hex').slice(0, 10);
  return `key_${digest}`;
}

function normalizeRevisionWeeks(weeks: RevisionWeek[]): RevisionWeek[] {
  const output: RevisionWeek[] = [];
  for (const [index, week] of weeks.entries()) {
    const focusChapters = Array.isArray(week.focusChapters)
      ? week.focusChapters.map((id) => sanitizeText(id, 40)).filter(Boolean).slice(0, 6)
      : [];
    const tasks = Array.isArray(week.tasks)
      ? week.tasks.map((task) => sanitizeText(task, 240)).filter(Boolean).slice(0, 10)
      : [];
    if (focusChapters.length === 0 && tasks.length === 0) continue;
    output.push({
      week: Number.isFinite(Number(week.week)) ? Number(week.week) : index + 1,
      focusChapters,
      tasks,
      targetMarks: Number.isFinite(Number(week.targetMarks)) ? Math.max(1, Math.min(40, Number(week.targetMarks))) : 8,
      reviewSlots: Array.isArray(week.reviewSlots)
        ? week.reviewSlots.map((slot) => sanitizeText(slot, 180)).filter(Boolean).slice(0, 6)
        : [],
      miniTests: Array.isArray(week.miniTests)
        ? week.miniTests.map((test) => sanitizeText(test, 180)).filter(Boolean).slice(0, 6)
        : [],
    });
  }
  return output.slice(0, 16);
}

function sanitizeSubmissionAnswers(answers: TeacherSubmissionAnswer[]): TeacherSubmissionAnswer[] {
  const sanitized: TeacherSubmissionAnswer[] = [];
  for (const answer of answers) {
    const questionNo = sanitizeQuestionNo(answer.questionNo);
    const answerText = sanitizeText(answer.answerText, 1200);
    if (!questionNo || !answerText) continue;
    sanitized.push({ questionNo, answerText });
    if (sanitized.length >= 120) break;
  }
  return sanitized;
}

function normalizeActionHistory(items: TeacherActionHistoryEntry[]): TeacherActionHistoryEntry[] {
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ...item,
      id: sanitizeText(item.id || buildId('act'), 80),
      keyId: sanitizeText(item.keyId || 'unknown', 80),
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : nowIso(),
    }))
    .slice(-300);
}

async function readState(): Promise<TeacherStoreState> {
  const remoteState = await readStateFromSupabase<TeacherStoreState>(TEACHER_STATE_KEY);
  if (remoteState) {
    const parsed = ensureStateShape(remoteState);
    memoryState = parsed;
    return parsed;
  }

  try {
    const raw = await fs.readFile(TEACHER_STORE_PATH, 'utf-8');
    const parsed = ensureStateShape(JSON.parse(raw));
    return parsed;
  } catch {
    return memoryState;
  }
}

async function writeState(state: TeacherStoreState): Promise<void> {
  memoryState = state;
  const remoteOk = await writeStateToSupabase(TEACHER_STATE_KEY, state);
  if (remoteOk) return;

  try {
    await fs.mkdir(RUNTIME_DIR, { recursive: true });
    await fs.writeFile(TEACHER_STORE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // keep in-memory fallback for restricted environments
  }
}

function toPublicConfig(state: TeacherStoreState): PublicTeacherConfig {
  const weeklyPlans = Object.values(state.weeklyPlans)
    .filter((plan) => plan.status === 'active')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);
  return {
    updatedAt: state.updatedAt,
    importantTopics: state.importantTopics,
    quizLinks: state.quizLinks,
    announcements: state.announcements.slice(0, 12),
    weeklyPlans,
  };
}

function countFrequency(values: string[]): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const value of values) {
    const key = sanitizeText(value, 120).toLowerCase();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function chapterExists(chapterId: string): boolean {
  return ALL_CHAPTERS.some((chapter) => chapter.id === chapterId);
}

function getSubmissionSummaryFromState(state: TeacherStoreState, packId: string): TeacherSubmissionSummary {
  const attempts = state.submissionsByPack[packId] ?? [];
  if (attempts.length === 0) {
    return {
      attempts: 0,
      averageScore: 0,
      topMistakes: [],
      weakTopics: [],
      recommendedNextChapterIds: [],
      attemptsByStudent: [],
      questionStats: [],
      scoreTrend: [],
      pendingReviewCount: 0,
      gradedCount: 0,
      releasedCount: 0,
    };
  }

  let pendingReviewCount = 0;
  let gradedCount = 0;
  let releasedCount = 0;
  for (const attempt of attempts) {
    const status =
      attempt.status === 'graded' || attempt.status === 'released' || attempt.status === 'pending_review'
        ? attempt.status
        : 'pending_review';
    if (status === 'pending_review') pendingReviewCount += 1;
    if (status === 'graded') gradedCount += 1;
    if (status === 'released') releasedCount += 1;
  }

  const averageScore = Math.round(
    attempts.reduce((sum, item) => sum + Math.max(0, Math.min(100, item.scoreEstimate)), 0) / attempts.length
  );
  const mistakeFrequency = countFrequency(attempts.flatMap((item) => item.mistakes)).slice(0, 8);
  const weakTopicFrequency = countFrequency(attempts.flatMap((item) => item.weakTopics)).slice(0, 8);
  const questionStatsMap = new Map<string, TeacherSubmissionSummary['questionStats'][number]>();

  const attemptsByStudent = attempts.map((attempt, index) => {
    const detail = attempt.attemptDetail;
    const questionResults = detail?.questionResults ?? [];
    const wrongQuestionNos = questionResults
      .filter((result) => result.verdict === 'wrong')
      .map((result) => sanitizeQuestionNo(result.questionNo))
      .filter(Boolean)
      .slice(0, 12);
    const partialQuestionNos = questionResults
      .filter((result) => result.verdict === 'partial')
      .map((result) => sanitizeQuestionNo(result.questionNo))
      .filter(Boolean)
      .slice(0, 12);
    const unansweredQuestionNos = questionResults
      .filter((result) => result.verdict === 'unanswered')
      .map((result) => sanitizeQuestionNo(result.questionNo))
      .filter(Boolean)
      .slice(0, 12);

    for (const result of questionResults) {
      const key = sanitizeQuestionNo(result.questionNo);
      if (!key) continue;
      const current = questionStatsMap.get(key) ?? {
        questionNo: key,
        prompt: sanitizeText(result.prompt, 300),
        kind: result.kind,
        attempts: 0,
        correct: 0,
        partial: 0,
        wrong: 0,
        unanswered: 0,
        accuracyPercent: 0,
      };
      current.attempts += 1;
      if (result.verdict === 'correct') current.correct += 1;
      else if (result.verdict === 'partial') current.partial += 1;
      else if (result.verdict === 'wrong') current.wrong += 1;
      else current.unanswered += 1;
      const denominator = Math.max(1, current.attempts);
      current.accuracyPercent = Math.round(((current.correct + current.partial * 0.5) / denominator) * 100);
      questionStatsMap.set(key, current);
    }

    return {
      submissionId: attempt.submissionId,
      studentName: sanitizeText(attempt.studentName || 'Student', 120) || 'Student',
      submissionCode: sanitizeSubmissionCode(attempt.submissionCode),
      studentId: attempt.studentId,
      scoreEstimate: Math.max(0, Math.min(100, Number(attempt.scoreEstimate) || 0)),
      attemptNo: Number.isFinite(Number(attempt.attemptNo)) ? Number(attempt.attemptNo) : index + 1,
      correctCount: detail?.correctCount ?? 0,
      wrongCount: detail?.wrongCount ?? 0,
      partialCount: detail?.partialCount ?? 0,
      unansweredCount: detail?.unansweredCount ?? 0,
      submittedAt: detail?.submittedAt ?? attempt.createdAt,
      weakTopics: attempt.weakTopics ?? [],
      mistakes: attempt.mistakes ?? [],
      integritySummary: attempt.integritySummary,
      wrongQuestionNos,
      partialQuestionNos,
      unansweredQuestionNos,
      status:
        attempt.status === 'graded' || attempt.status === 'released' || attempt.status === 'pending_review'
          ? attempt.status
          : 'pending_review',
      grading: attempt.grading,
      releasedAt: attempt.releasedAt,
    };
  });

  const scoreTrend = attemptsByStudent
    .map((attempt) => ({
      label: `${sanitizeText(attempt.studentName, 40) || 'Student'} A${attempt.attemptNo}`,
      score: attempt.scoreEstimate,
      submittedAt: attempt.submittedAt,
    }))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .slice(-40);

  const recommendedChapters = ALL_CHAPTERS.filter((chapter) =>
    weakTopicFrequency.some(({ key }) =>
      chapter.title.toLowerCase().includes(key) ||
      chapter.topics.some((topic) => topic.toLowerCase().includes(key))
    )
  )
    .slice(0, 6)
    .map((chapter) => chapter.id);

  return {
    attempts: attempts.length,
    averageScore,
    topMistakes: mistakeFrequency.map((item) => ({ item: item.key, count: item.count })),
    weakTopics: weakTopicFrequency.map((item) => ({ topic: item.key, count: item.count })),
    recommendedNextChapterIds: recommendedChapters,
    attemptsByStudent: attemptsByStudent.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 80),
    questionStats: [...questionStatsMap.values()].sort((a, b) => a.questionNo.localeCompare(b.questionNo)).slice(0, 120),
    scoreTrend,
    pendingReviewCount,
    gradedCount,
    releasedCount,
  };
}

function computeAssignmentAnalytics(state: TeacherStoreState): TeacherAssignmentAnalytics {
  const packs = Object.values(state.assignmentPacks);
  const now = new Date();
  const weekStart = getWeekStart(now).getTime();
  const allSubmissions = Object.values(state.submissionsByPack).flat();
  const submissionsThisWeek = allSubmissions.filter((submission) => new Date(submission.createdAt).getTime() >= weekStart);
  const assignmentCompletionSet = new Set(submissionsThisWeek.map((submission) => submission.packId));

  const weakTopicFrequency = countFrequency(allSubmissions.flatMap((submission) => submission.weakTopics)).slice(0, 20);

  const packPerformance = packs
    .map((pack) => {
      const attempts = state.submissionsByPack[pack.packId] ?? [];
      const averageScore = attempts.length > 0
        ? Math.round(attempts.reduce((sum, item) => sum + item.scoreEstimate, 0) / attempts.length)
        : 0;
      const lastSubmissionAt = attempts.length > 0
        ? attempts.map((item) => item.createdAt).sort((a, b) => b.localeCompare(a))[0]
        : undefined;
      return {
        packId: pack.packId,
        title: pack.title,
        attempts: attempts.length,
        averageScore,
        lastSubmissionAt,
      };
    })
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 12);

  return {
    updatedAt: state.updatedAt,
    totalPacks: packs.length,
    activePacks: packs.filter((pack) => pack.status === 'published').length,
    submissionsThisWeek: submissionsThisWeek.length,
    assignmentsCompletedThisWeek: assignmentCompletionSet.size,
    topWeakTopics: weakTopicFrequency.slice(0, 8).map((item) => ({ topic: item.key, count: item.count })),
    weakTopicHeatmap: weakTopicFrequency.map((item) => ({ topic: item.key, count: item.count })),
    packPerformance,
  };
}

async function addActionHistory(
  state: TeacherStoreState,
  entry: Omit<TeacherActionHistoryEntry, 'id' | 'createdAt'>
): Promise<TeacherStoreState> {
  const next: TeacherStoreState = {
    ...state,
    actionHistory: normalizeActionHistory([
      ...state.actionHistory,
      {
        ...entry,
        id: buildId('act'),
        createdAt: nowIso(),
      },
    ]),
    updatedAt: nowIso(),
  };
  await writeState(next);
  return next;
}

export async function getPublicTeacherConfig(): Promise<PublicTeacherConfig> {
  const state = await readState();
  return toPublicConfig(state);
}

export async function getPrivateTeacherConfig(): Promise<PrivateTeacherConfig> {
  const state = await readState();
  const analytics = await getAnalyticsSummary(12);
  const assignmentAnalytics = computeAssignmentAnalytics(state);
  const assignmentPacks = Object.values(state.assignmentPacks).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    ...toPublicConfig(state),
    analytics,
    assignmentAnalytics,
    assignmentPacks,
    actionHistory: [...state.actionHistory].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60),
  };
}

export async function setImportantTopics(chapterId: string, topics: string[], keyId = 'unknown'): Promise<PublicTeacherConfig> {
  const cleanChapterId = sanitizeText(chapterId, 60);
  if (!cleanChapterId || !chapterExists(cleanChapterId)) {
    throw new Error('Valid chapterId is required.');
  }
  const state = await readState();
  const cleanTopics = sanitizeTopicList(topics);
  const nextImportantTopics = { ...state.importantTopics };
  if (cleanTopics.length === 0) {
    delete nextImportantTopics[cleanChapterId];
  } else {
    nextImportantTopics[cleanChapterId] = cleanTopics;
  }
  let nextState: TeacherStoreState = {
    ...state,
    importantTopics: nextImportantTopics,
    updatedAt: nowIso(),
  };
  nextState = await addActionHistory(nextState, {
    action: 'set-important-topics',
    chapterId: cleanChapterId,
    keyId,
    metadata: { topicCount: cleanTopics.length },
  });
  return toPublicConfig(nextState);
}

export async function setQuizLink(chapterId: string, url: string, keyId = 'unknown'): Promise<PublicTeacherConfig> {
  const cleanChapterId = sanitizeText(chapterId, 60);
  if (!cleanChapterId || !chapterExists(cleanChapterId)) {
    throw new Error('Valid chapterId is required.');
  }
  const cleanUrl = sanitizeText(url, 500);
  if (cleanUrl && !isValidHttpUrl(cleanUrl)) {
    throw new Error('Quiz link must be a valid http/https URL.');
  }

  const state = await readState();
  const nextQuizLinks = { ...state.quizLinks };
  if (!cleanUrl) {
    delete nextQuizLinks[cleanChapterId];
  } else {
    nextQuizLinks[cleanChapterId] = cleanUrl;
  }

  let nextState: TeacherStoreState = {
    ...state,
    quizLinks: nextQuizLinks,
    updatedAt: nowIso(),
  };
  nextState = await addActionHistory(nextState, {
    action: 'set-quiz-link',
    chapterId: cleanChapterId,
    keyId,
    metadata: { hasLink: !!cleanUrl },
  });
  return toPublicConfig(nextState);
}

export async function addAnnouncement(title: string, body: string, keyId = 'unknown'): Promise<PublicTeacherConfig> {
  const cleanTitle = sanitizeText(title, 120);
  const cleanBody = sanitizeText(body, 700);
  if (!cleanTitle || !cleanBody) {
    throw new Error('Announcement title and body are required.');
  }
  const state = await readState();
  const announcement: TeacherAnnouncement = {
    id: buildId('ann'),
    title: cleanTitle,
    body: cleanBody,
    createdAt: nowIso(),
  };
  let nextState: TeacherStoreState = {
    ...state,
    announcements: [announcement, ...state.announcements].slice(0, 30),
    updatedAt: nowIso(),
  };
  nextState = await addActionHistory(nextState, {
    action: 'add-announcement',
    keyId,
    metadata: { title: cleanTitle },
  });
  return toPublicConfig(nextState);
}

export async function removeAnnouncement(id: string, keyId = 'unknown'): Promise<PublicTeacherConfig> {
  const cleanId = sanitizeText(id, 80);
  const state = await readState();
  let nextState: TeacherStoreState = {
    ...state,
    announcements: state.announcements.filter((item) => item.id !== cleanId),
    updatedAt: nowIso(),
  };
  nextState = await addActionHistory(nextState, {
    action: 'remove-announcement',
    keyId,
    metadata: { announcementId: cleanId },
  });
  return toPublicConfig(nextState);
}

export async function upsertAssignmentPack(
  input: Omit<TeacherAssignmentPack, 'createdAt' | 'updatedAt' | 'createdByKeyId' | 'status'> & Partial<Pick<TeacherAssignmentPack, 'status'>>,
  keyId = 'unknown'
): Promise<TeacherAssignmentPack> {
  const state = await readState();
  const packId = sanitizeText(input.packId, 80) || buildId('pack');
  const existing = state.assignmentPacks[packId];
  const createdAt = existing?.createdAt ?? nowIso();

  const sanitizedPack: TeacherAssignmentPack = {
    ...input,
    packId,
    title: sanitizeText(input.title, 180),
    chapterId: sanitizeText(input.chapterId, 60),
    subject: sanitizeText(input.subject, 40),
    difficultyMix: sanitizeText(input.difficultyMix, 120),
    dueDate: input.dueDate ? sanitizeText(input.dueDate, 40) : undefined,
    shortAnswers: (input.shortAnswers ?? []).map((item) => sanitizeText(item, 300)).filter(Boolean).slice(0, 16),
    formulaDrill: (input.formulaDrill ?? []).map((item) => ({
      name: sanitizeText(item.name, 140),
      latex: item.latex ? sanitizeText(item.latex, 240) : undefined,
    })),
    commonMistakes: (input.commonMistakes ?? []).map((item) => sanitizeText(item, 260)).filter(Boolean).slice(0, 12),
    mcqs: (input.mcqs ?? []).slice(0, 40),
    answerKey: (input.answerKey ?? []).slice(0, 40),
    estimatedTimeMinutes: Math.max(5, Math.min(240, Number(input.estimatedTimeMinutes) || 25)),
    shareUrl: sanitizeText(input.shareUrl, 360),
    printUrl: sanitizeText(input.printUrl, 360),
    includeShortAnswers: input.includeShortAnswers === true,
    includeFormulaDrill: input.includeFormulaDrill === true,
    questionCount: Math.max(1, Math.min(40, Number(input.questionCount) || 8)),
    classLevel: input.classLevel,
    createdAt,
    updatedAt: nowIso(),
    createdByKeyId: existing?.createdByKeyId ?? keyId,
    status: input.status === 'archived' ? 'archived' : (input.status === 'published' ? 'published' : 'draft'),
  };

  if (!sanitizedPack.title || !sanitizedPack.chapterId || !chapterExists(sanitizedPack.chapterId)) {
    throw new Error('Assignment pack requires valid title and chapterId.');
  }

  const nextStateBase: TeacherStoreState = {
    ...state,
    assignmentPacks: {
      ...state.assignmentPacks,
      [packId]: sanitizedPack,
    },
    updatedAt: nowIso(),
  };
  const nextState = await addActionHistory(nextStateBase, {
    action: 'create-assignment-pack',
    keyId,
    chapterId: sanitizedPack.chapterId,
    packId,
    metadata: { questionCount: sanitizedPack.questionCount },
  });
  return nextState.assignmentPacks[packId];
}

export async function getAssignmentPack(packId: string): Promise<TeacherAssignmentPack | null> {
  const cleanId = sanitizeText(packId, 80);
  if (!cleanId) return null;
  const state = await readState();
  return state.assignmentPacks[cleanId] ?? null;
}

export async function listAssignmentPacks(): Promise<TeacherAssignmentPack[]> {
  const state = await readState();
  return Object.values(state.assignmentPacks).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function publishWeeklyPlan(
  input: {
    title: string;
    classPreset: TeacherClassPreset;
    classLevel: 10 | 12;
    subject?: string;
    focusChapterIds: string[];
    planWeeks: RevisionWeek[];
    dueDate?: string;
  },
  keyId = 'unknown'
): Promise<TeacherWeeklyPlan> {
  const state = await readState();
  const focusChapterIds = input.focusChapterIds
    .map((id) => sanitizeText(id, 60))
    .filter((id) => chapterExists(id))
    .slice(0, 12);
  const planWeeks = normalizeRevisionWeeks(input.planWeeks);
  if (!input.title.trim() || focusChapterIds.length === 0 || planWeeks.length === 0) {
    throw new Error('Weekly plan requires title, focusChapterIds, and planWeeks.');
  }
  const planId = buildId('plan');
  const plan: TeacherWeeklyPlan = {
    planId,
    title: sanitizeText(input.title, 180),
    classPreset: input.classPreset,
    classLevel: input.classLevel,
    subject: input.subject ? sanitizeText(input.subject, 40) : undefined,
    focusChapterIds,
    planWeeks,
    dueDate: input.dueDate ? sanitizeText(input.dueDate, 40) : undefined,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdByKeyId: keyId,
    status: 'active',
  };

  const nextStateBase: TeacherStoreState = {
    ...state,
    weeklyPlans: {
      ...state.weeklyPlans,
      [planId]: plan,
    },
    updatedAt: nowIso(),
  };
  const nextState = await addActionHistory(nextStateBase, {
    action: 'create-assignment-pack',
    planId,
    keyId,
    metadata: { classPreset: input.classPreset, weeks: planWeeks.length },
  });
  return nextState.weeklyPlans[planId];
}

export async function archiveWeeklyPlan(planId: string, keyId = 'unknown'): Promise<TeacherWeeklyPlan | null> {
  const cleanPlanId = sanitizeText(planId, 80);
  const state = await readState();
  const existing = state.weeklyPlans[cleanPlanId];
  if (!existing) return null;
  const nextPlan: TeacherWeeklyPlan = {
    ...existing,
    status: 'archived',
    updatedAt: nowIso(),
  };

  const nextStateBase: TeacherStoreState = {
    ...state,
    weeklyPlans: {
      ...state.weeklyPlans,
      [cleanPlanId]: nextPlan,
    },
    updatedAt: nowIso(),
  };
  const nextState = await addActionHistory(nextStateBase, {
    action: 'archive-assignment-pack',
    planId: cleanPlanId,
    keyId,
  });
  return nextState.weeklyPlans[cleanPlanId];
}

export async function addSubmission(
  input: {
    packId: string;
    studentName?: string;
    submissionCode: string;
    answers: TeacherSubmissionAnswer[];
    result: TeacherSubmissionResult;
  },
  keyId = 'student'
): Promise<{ submission: TeacherSubmission; duplicate: boolean }> {
  const cleanPackId = sanitizeText(input.packId, 80);
  const state = await readState();
  const pack = state.assignmentPacks[cleanPackId];
  if (!pack) {
    throw new Error('Assignment pack not found.');
  }

  const submissionCode = sanitizeSubmissionCode(input.submissionCode);
  if (!submissionCode) {
    throw new Error('submissionCode is required.');
  }

  const answers = sanitizeSubmissionAnswers(input.answers);
  if (answers.length === 0) {
    throw new Error('At least one answer is required.');
  }

  const studentName = sanitizeText(input.studentName || 'Student', 120) || 'Student';
  const existingAttemptsForCode = (state.submissionsByPack[cleanPackId] ?? []).filter(
    (item) => item.submissionCode === submissionCode
  );
  const attemptNo = existingAttemptsForCode.length + 1;

  const existing = (state.submissionsByPack[cleanPackId] ?? []).find(
    (item) => item.submissionCode === submissionCode
  );
  if (existing) {
    return { submission: existing, duplicate: true };
  }

  const createdAt = nowIso();
  const submission: TeacherSubmission = {
    submissionId: buildId('sub'),
    packId: cleanPackId,
    studentName,
    submissionCode,
    attemptNo,
    answers,
    scoreEstimate: Math.max(0, Math.min(100, Number(input.result.scoreEstimate) || 0)),
    mistakes: input.result.mistakes.map((item) => sanitizeText(item, 260)).filter(Boolean).slice(0, 12),
    weakTopics: input.result.weakTopics.map((item) => sanitizeText(item, 120)).filter(Boolean).slice(0, 12),
    nextActions: input.result.nextActions.map((item) => sanitizeText(item, 220)).filter(Boolean).slice(0, 10),
    attemptDetail: input.result.attemptDetail
      ? {
          ...input.result.attemptDetail,
          attemptNo,
          submittedAt: createdAt,
        }
      : undefined,
    integritySummary: input.result.integritySummary,
    createdAt,
    status: 'pending_review',
  };

  const packSubmissions = state.submissionsByPack[cleanPackId] ?? [];
  const nextStateBase: TeacherStoreState = {
    ...state,
    submissionsByPack: {
      ...state.submissionsByPack,
      [cleanPackId]: [submission, ...packSubmissions].slice(0, 300),
    },
    updatedAt: nowIso(),
  };
  await addActionHistory(nextStateBase, {
    action: 'add-submission',
    keyId,
    packId: cleanPackId,
    metadata: { scoreEstimate: submission.scoreEstimate },
  });
  return { submission, duplicate: false };
}

export async function getSubmissionSummary(packId: string): Promise<TeacherSubmissionSummary> {
  const cleanPackId = sanitizeText(packId, 80);
  const state = await readState();
  return getSubmissionSummaryFromState(state, cleanPackId);
}

export async function getSubmissionCount(packId: string): Promise<number> {
  const cleanPackId = sanitizeText(packId, 80);
  const state = await readState();
  return (state.submissionsByPack[cleanPackId] ?? []).length;
}

export function isValidTeacherKey(key?: string): boolean {
  if (!key) return false;
  const configuredKey = process.env.TEACHER_PORTAL_KEY?.trim();
  if (!configuredKey) return false;
  return key.trim() === configuredKey;
}

export function deriveTeacherKeyId(key?: string): string {
  return getTeacherKeyId(key ?? '');
}
