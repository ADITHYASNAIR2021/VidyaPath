import { randomUUID } from 'node:crypto';
import { fsrs, createEmptyCard, Rating, type Card, type Grade } from 'ts-fsrs';
import { ALL_CHAPTERS } from '@/lib/data';
import { isSupabaseServiceConfigured, supabaseInsert, supabaseSelect, supabaseUpdate } from '@/lib/supabase-rest';
import { getStudentAttendanceSummary, listStudentGrades } from '@/lib/school-ops-db';

const TABLES = {
  notes: 'chapter_notes',
  streaks: 'student_streaks',
  badges: 'student_badges',
  srs: 'srs_cards',
  mockExamSessions: 'mock_exam_sessions',
};

type SrsStateKey = 'new' | 'learning' | 'review' | 'relearning';

const SRS_STATE_TO_NUM: Record<SrsStateKey, number> = {
  new: 0,
  learning: 1,
  review: 2,
  relearning: 3,
};

const SRS_NUM_TO_STATE: Record<number, SrsStateKey> = {
  0: 'new',
  1: 'learning',
  2: 'review',
  3: 'relearning',
};

const scheduler = fsrs({});

interface ChapterNoteRow {
  id: string;
  student_id: string;
  chapter_id: string;
  content: string;
  updated_at: string;
}

interface StudentStreakRow {
  student_id: string;
  current_streak: number;
  longest_streak: number;
  last_active: string | null;
  total_study_days: number;
  updated_at?: string;
}

interface StudentBadgeRow {
  id: string;
  student_id: string;
  badge_type: string;
  earned_at: string;
}

interface SrsCardRow {
  id: string;
  student_id: string;
  card_id: string;
  chapter_id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: SrsStateKey;
  last_review: string | null;
  created_at?: string;
  updated_at?: string;
}

interface MockExamSessionRow {
  id: string;
  student_id: string;
  school_id: string | null;
  class_level: number;
  subject: string;
  duration_minutes: number;
  question_count: number;
  status: 'active' | 'submitted';
  questions: Array<{ id: string; prompt: string; options: string[]; answerIndex: number; chapterId?: string; explanation?: string }>;
  answers: Record<string, number>;
  score: number | null;
  created_at: string;
  submitted_at: string | null;
}

export interface StudentStreakData {
  currentStreak: number;
  longestStreak: number;
  totalStudyDays: number;
  lastActive?: string;
}

export interface SrsDueCard {
  cardId: string;
  chapterId: string;
  chapterTitle: string;
  subject: string;
  classLevel: 10 | 12;
  front: string;
  back: string;
  dueAt: string;
  state: SrsStateKey;
  reps: number;
  lapses: number;
}

function sanitizeText(value: string, max = 240): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeId(value: string): string {
  return sanitizeText(value, 100);
}

function toIsoDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function ymdToDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function previousDate(date: string): string {
  const d = ymdToDate(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function toSrsCard(row: SrsCardRow): Card {
  return {
    due: new Date(row.due),
    stability: Number(row.stability) || 1,
    difficulty: Number(row.difficulty) || 5,
    elapsed_days: Number(row.elapsed_days) || 0,
    scheduled_days: Number(row.scheduled_days) || 0,
    learning_steps: 0,
    reps: Number(row.reps) || 0,
    lapses: Number(row.lapses) || 0,
    state: SRS_STATE_TO_NUM[row.state] ?? 0,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

function fromSrsCard(studentId: string, cardId: string, chapterId: string, card: Card): Omit<SrsCardRow, 'id'> {
  const stateNum = Number((card as { state?: number }).state ?? 0);
  return {
    student_id: studentId,
    card_id: cardId,
    chapter_id: chapterId,
    due: (card.due instanceof Date ? card.due : new Date()).toISOString(),
    stability: Number(card.stability) || 1,
    difficulty: Number(card.difficulty) || 5,
    elapsed_days: Number(card.elapsed_days) || 0,
    scheduled_days: Number(card.scheduled_days) || 0,
    reps: Number(card.reps) || 0,
    lapses: Number(card.lapses) || 0,
    state: SRS_NUM_TO_STATE[stateNum] ?? 'new',
    last_review: card.last_review instanceof Date ? card.last_review.toISOString() : null,
  };
}

function buildCardCatalog(input?: { classLevel?: 10 | 12; subjectAllowList?: string[] }): Array<{
  cardId: string;
  chapterId: string;
  chapterTitle: string;
  subject: string;
  classLevel: 10 | 12;
  front: string;
  back: string;
}> {
  const allowedSubjects = new Set((input?.subjectAllowList || []).map((item) => sanitizeText(item, 80).toLowerCase()));
  const list: Array<{
    cardId: string;
    chapterId: string;
    chapterTitle: string;
    subject: string;
    classLevel: 10 | 12;
    front: string;
    back: string;
  }> = [];
  for (const chapter of ALL_CHAPTERS) {
    const classLevel = Number(chapter.classLevel);
    if (classLevel !== 10 && classLevel !== 12) continue;
    if (input?.classLevel && classLevel !== input.classLevel) continue;
    const subject = sanitizeText(String(chapter.subject || ''), 80);
    if (allowedSubjects.size > 0 && !allowedSubjects.has(subject.toLowerCase())) continue;
    const chapterId = sanitizeText(String(chapter.id || ''), 80);
    const chapterTitle = sanitizeText(String(chapter.title || chapterId), 180) || chapterId;
    const flashcardsRaw = Array.isArray((chapter as { flashcards?: unknown }).flashcards)
      ? ((chapter as { flashcards?: unknown }).flashcards as unknown[])
      : [];
    flashcardsRaw.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const row = item as { front?: unknown; back?: unknown };
      const front = sanitizeText(typeof row.front === 'string' ? row.front : '', 500);
      const back = sanitizeText(typeof row.back === 'string' ? row.back : '', 500);
      if (!front || !back) return;
      list.push({
        cardId: `${chapterId}::${index}`,
        chapterId,
        chapterTitle,
        subject,
        classLevel,
        front,
        back,
      });
    });
  }
  return list;
}

async function ensureStreakRow(studentId: string): Promise<StudentStreakRow> {
  const cleanStudentId = sanitizeId(studentId);
  const existing = await supabaseSelect<StudentStreakRow>(TABLES.streaks, {
    select: '*',
    filters: [{ column: 'student_id', value: cleanStudentId }],
    limit: 1,
  }).catch(() => []);
  if (existing[0]) return existing[0];
  const [inserted] = await supabaseInsert<StudentStreakRow>(TABLES.streaks, {
    student_id: cleanStudentId,
    current_streak: 0,
    longest_streak: 0,
    last_active: null,
    total_study_days: 0,
  }).catch(() => []);
  return inserted ?? {
    student_id: cleanStudentId,
    current_streak: 0,
    longest_streak: 0,
    last_active: null,
    total_study_days: 0,
  };
}

async function ensureBadge(studentId: string, badgeType: string): Promise<boolean> {
  const cleanStudentId = sanitizeId(studentId);
  const cleanBadge = sanitizeText(badgeType, 120).toLowerCase();
  if (!cleanStudentId || !cleanBadge) return false;
  const existing = await supabaseSelect<StudentBadgeRow>(TABLES.badges, {
    select: 'id,student_id,badge_type,earned_at',
    filters: [{ column: 'student_id', value: cleanStudentId }, { column: 'badge_type', value: cleanBadge }],
    limit: 1,
  }).catch(() => []);
  if (existing[0]) return false;
  const rows = await supabaseInsert<StudentBadgeRow>(TABLES.badges, {
    id: randomUUID(),
    student_id: cleanStudentId,
    badge_type: cleanBadge,
  }).catch(() => []);
  return !!rows[0];
}

export async function getStudentStreakData(studentId: string): Promise<StudentStreakData> {
  if (!isSupabaseServiceConfigured()) return { currentStreak: 0, longestStreak: 0, totalStudyDays: 0 };
  const row = await ensureStreakRow(studentId);
  return {
    currentStreak: Number(row.current_streak) || 0,
    longestStreak: Number(row.longest_streak) || 0,
    totalStudyDays: Number(row.total_study_days) || 0,
    lastActive: row.last_active ?? undefined,
  };
}

export async function listStudentBadges(studentId: string): Promise<Array<{ badgeType: string; earnedAt: string }>> {
  if (!isSupabaseServiceConfigured()) return [];
  const rows = await supabaseSelect<StudentBadgeRow>(TABLES.badges, {
    select: 'id,student_id,badge_type,earned_at',
    filters: [{ column: 'student_id', value: sanitizeId(studentId) }],
    orderBy: 'earned_at',
    ascending: false,
    limit: 300,
  }).catch(() => []);
  return rows.map((row) => ({ badgeType: row.badge_type, earnedAt: row.earned_at }));
}

export async function recordStudentActivity(studentId: string, at?: string | Date): Promise<{
  streak: StudentStreakData;
  newBadges: string[];
}> {
  if (!isSupabaseServiceConfigured()) return { streak: { currentStreak: 0, longestStreak: 0, totalStudyDays: 0 }, newBadges: [] };
  const activityDate = toIsoDate(at ?? new Date());
  const row = await ensureStreakRow(studentId);

  const current = Number(row.current_streak) || 0;
  const longest = Number(row.longest_streak) || 0;
  const total = Number(row.total_study_days) || 0;
  const lastActive = row.last_active || null;

  let nextCurrent = current;
  let nextTotal = total;
  if (lastActive !== activityDate) {
    nextTotal += 1;
    nextCurrent = lastActive === previousDate(activityDate) ? current + 1 : 1;
  }
  const nextLongest = Math.max(longest, nextCurrent);

  const [updated] = await supabaseUpdate<StudentStreakRow>(
    TABLES.streaks,
    {
      current_streak: nextCurrent,
      longest_streak: nextLongest,
      total_study_days: nextTotal,
      last_active: activityDate,
      updated_at: new Date().toISOString(),
    },
    [{ column: 'student_id', value: sanitizeId(studentId) }]
  ).catch(() => []);

  const newBadges: string[] = [];
  if (nextTotal >= 1 && await ensureBadge(studentId, 'first-study-day')) newBadges.push('first-study-day');
  if (nextCurrent >= 7 && await ensureBadge(studentId, 'week-streak')) newBadges.push('week-streak');
  if (nextCurrent >= 30 && await ensureBadge(studentId, 'month-streak')) newBadges.push('month-streak');
  if (nextTotal >= 100 && await ensureBadge(studentId, '100-study-days')) newBadges.push('100-study-days');

  return {
    streak: {
      currentStreak: Number(updated?.current_streak ?? nextCurrent) || 0,
      longestStreak: Number(updated?.longest_streak ?? nextLongest) || 0,
      totalStudyDays: Number(updated?.total_study_days ?? nextTotal) || 0,
      lastActive: (updated?.last_active ?? activityDate) || undefined,
    },
    newBadges,
  };
}

export async function getChapterNote(studentId: string, chapterId: string): Promise<{ content: string; updatedAt?: string }> {
  if (!isSupabaseServiceConfigured()) return { content: '' };
  const rows = await supabaseSelect<ChapterNoteRow>(TABLES.notes, {
    select: 'id,student_id,chapter_id,content,updated_at',
    filters: [
      { column: 'student_id', value: sanitizeId(studentId) },
      { column: 'chapter_id', value: sanitizeText(chapterId, 80) },
    ],
    limit: 1,
  }).catch(() => []);
  return {
    content: rows[0]?.content || '',
    updatedAt: rows[0]?.updated_at,
  };
}

export async function saveChapterNote(studentId: string, chapterId: string, content: string): Promise<{ content: string; updatedAt: string }> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const cleanStudentId = sanitizeId(studentId);
  const cleanChapterId = sanitizeText(chapterId, 80);
  const cleanContent = String(content || '').slice(0, 60000);
  const nowIso = new Date().toISOString();

  const existing = await supabaseSelect<ChapterNoteRow>(TABLES.notes, {
    select: 'id,student_id,chapter_id,content,updated_at',
    filters: [{ column: 'student_id', value: cleanStudentId }, { column: 'chapter_id', value: cleanChapterId }],
    limit: 1,
  }).catch(() => []);

  if (existing[0]?.id) {
    const [updated] = await supabaseUpdate<ChapterNoteRow>(
      TABLES.notes,
      { content: cleanContent, updated_at: nowIso },
      [{ column: 'id', value: existing[0].id }]
    ).catch(() => []);
    return {
      content: updated?.content ?? cleanContent,
      updatedAt: updated?.updated_at ?? nowIso,
    };
  }

  const [inserted] = await supabaseInsert<ChapterNoteRow>(TABLES.notes, {
    id: randomUUID(),
    student_id: cleanStudentId,
    chapter_id: cleanChapterId,
    content: cleanContent,
    updated_at: nowIso,
  }).catch(() => []);

  return {
    content: inserted?.content ?? cleanContent,
    updatedAt: inserted?.updated_at ?? nowIso,
  };
}

async function ensureSrsBootstrap(input: {
  studentId: string;
  classLevel?: 10 | 12;
  subjectAllowList?: string[];
  limit?: number;
}): Promise<void> {
  if (!isSupabaseServiceConfigured()) return;
  const studentId = sanitizeId(input.studentId);
  const candidates = buildCardCatalog({ classLevel: input.classLevel, subjectAllowList: input.subjectAllowList });
  if (candidates.length === 0) return;

  const existingRows = await supabaseSelect<SrsCardRow>(TABLES.srs, {
    select: 'id,student_id,card_id,chapter_id,due,stability,difficulty,elapsed_days,scheduled_days,reps,lapses,state,last_review',
    filters: [{ column: 'student_id', value: studentId }],
    limit: 50000,
  }).catch(() => []);
  const existing = new Set(existingRows.map((row) => row.card_id));

  const targetCount = Number.isFinite(input.limit) ? Math.max(10, Math.min(120, Number(input.limit))) : 40;
  const createRows: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    if (createRows.length >= targetCount) break;
    if (existing.has(candidate.cardId)) continue;
    const empty = createEmptyCard(new Date());
    const row = fromSrsCard(studentId, candidate.cardId, candidate.chapterId, empty);
    createRows.push({ id: randomUUID(), ...row });
  }
  if (createRows.length > 0) {
    await supabaseInsert<SrsCardRow>(TABLES.srs, createRows).catch(() => []);
  }
}

export async function listDueSrsCards(input: {
  studentId: string;
  classLevel?: 10 | 12;
  subjectAllowList?: string[];
  limit?: number;
}): Promise<SrsDueCard[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const studentId = sanitizeId(input.studentId);
  const dueLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(80, Number(input.limit))) : 20;

  let rows = await supabaseSelect<SrsCardRow>(TABLES.srs, {
    select: 'id,student_id,card_id,chapter_id,due,stability,difficulty,elapsed_days,scheduled_days,reps,lapses,state,last_review',
    filters: [
      { column: 'student_id', value: studentId },
      { column: 'due', op: 'lte', value: new Date().toISOString() },
    ],
    orderBy: 'due',
    ascending: true,
    limit: dueLimit,
  }).catch(() => []);

  if (rows.length === 0) {
    await ensureSrsBootstrap({
      studentId,
      classLevel: input.classLevel,
      subjectAllowList: input.subjectAllowList,
      limit: 50,
    });
    rows = await supabaseSelect<SrsCardRow>(TABLES.srs, {
      select: 'id,student_id,card_id,chapter_id,due,stability,difficulty,elapsed_days,scheduled_days,reps,lapses,state,last_review',
      filters: [
        { column: 'student_id', value: studentId },
        { column: 'due', op: 'lte', value: new Date().toISOString() },
      ],
      orderBy: 'due',
      ascending: true,
      limit: dueLimit,
    }).catch(() => []);
  }

  const catalog = new Map(buildCardCatalog({ classLevel: input.classLevel, subjectAllowList: input.subjectAllowList }).map((item) => [item.cardId, item]));
  return rows
    .map((row) => {
      const card = catalog.get(row.card_id);
      if (!card) return null;
      return {
        cardId: row.card_id,
        chapterId: card.chapterId,
        chapterTitle: card.chapterTitle,
        subject: card.subject,
        classLevel: card.classLevel,
        front: card.front,
        back: card.back,
        dueAt: row.due,
        state: row.state,
        reps: Number(row.reps) || 0,
        lapses: Number(row.lapses) || 0,
      } as SrsDueCard;
    })
    .filter((item): item is SrsDueCard => !!item);
}

export async function reviewSrsCard(input: {
  studentId: string;
  cardId: string;
  rating: Rating;
}): Promise<{ dueAt: string; state: SrsStateKey; reps: number; lapses: number }> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const studentId = sanitizeId(input.studentId);
  const cardId = sanitizeText(input.cardId, 160);
  const rating = Number(input.rating) as Rating;
  if (![Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].includes(rating)) {
    throw new Error('Invalid SRS rating.');
  }

  const existing = await supabaseSelect<SrsCardRow>(TABLES.srs, {
    select: 'id,student_id,card_id,chapter_id,due,stability,difficulty,elapsed_days,scheduled_days,reps,lapses,state,last_review',
    filters: [{ column: 'student_id', value: studentId }, { column: 'card_id', value: cardId }],
    limit: 1,
  }).catch(() => []);

  const catalog = new Map(buildCardCatalog().map((item) => [item.cardId, item]));
  const chapterId = existing[0]?.chapter_id || catalog.get(cardId)?.chapterId || cardId.split('::')[0] || 'unknown';
  const baseCard = existing[0] ? toSrsCard(existing[0]) : createEmptyCard(new Date());
  const now = new Date();
  const scheduling = scheduler.repeat(baseCard, now);
  const nextCard = (scheduling[rating as Grade] ?? scheduling[Rating.Good as Grade]).card;
  const payload = fromSrsCard(studentId, cardId, chapterId, nextCard);

  if (existing[0]?.id) {
    await supabaseUpdate<SrsCardRow>(TABLES.srs, payload, [{ column: 'id', value: existing[0].id }]).catch(() => []);
  } else {
    await supabaseInsert<SrsCardRow>(TABLES.srs, { id: randomUUID(), ...payload }).catch(() => []);
  }

  await recordStudentActivity(studentId, now);

  return {
    dueAt: payload.due,
    state: payload.state,
    reps: payload.reps,
    lapses: payload.lapses,
  };
}

function generateMockQuestions(input: {
  classLevel: 10 | 12;
  subject?: string;
  questionCount: number;
}): Array<{ id: string; prompt: string; options: string[]; answerIndex: number; chapterId?: string; explanation?: string }> {
  const catalog = buildCardCatalog({
    classLevel: input.classLevel,
    subjectAllowList: input.subject ? [input.subject] : undefined,
  });
  const distractors = catalog.map((item) => item.back).filter((item) => !!item);
  const questions: Array<{ id: string; prompt: string; options: string[]; answerIndex: number; chapterId?: string; explanation?: string }> = [];

  for (const item of catalog) {
    if (questions.length >= input.questionCount) break;
    const options = [item.back];
    for (const candidate of distractors) {
      if (options.length >= 4) break;
      if (candidate === item.back || options.includes(candidate)) continue;
      options.push(candidate);
    }
    while (options.length < 4) {
      options.push(`Review concept from ${item.subject}`);
    }
    const shuffled = [...options].sort(() => Math.random() - 0.5);
    const answerIndex = shuffled.findIndex((opt) => opt === item.back);
    questions.push({
      id: randomUUID(),
      prompt: item.front,
      options: shuffled,
      answerIndex: answerIndex >= 0 ? answerIndex : 0,
      chapterId: item.chapterId,
      explanation: item.back,
    });
  }

  if (questions.length === 0) {
    for (let index = 0; index < input.questionCount; index += 1) {
      questions.push({
        id: randomUUID(),
        prompt: `Practice question ${index + 1} for ${input.subject || 'your stream'}`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        answerIndex: 0,
      });
    }
  }

  return questions.slice(0, input.questionCount);
}

export async function createMockExamSession(input: {
  studentId: string;
  schoolId?: string;
  classLevel: 10 | 12;
  subject: string;
  durationMinutes: number;
  questionCount: number;
}): Promise<{ sessionId: string }> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const durationMinutes = Math.max(15, Math.min(240, Math.round(input.durationMinutes || 60)));
  const questionCount = Math.max(5, Math.min(100, Math.round(input.questionCount || 20)));
  const questions = generateMockQuestions({
    classLevel: input.classLevel,
    subject: sanitizeText(input.subject, 100),
    questionCount,
  });
  const sessionId = randomUUID();
  await supabaseInsert<MockExamSessionRow>(TABLES.mockExamSessions, {
    id: sessionId,
    student_id: sanitizeId(input.studentId),
    school_id: input.schoolId ? sanitizeId(input.schoolId) : null,
    class_level: input.classLevel,
    subject: sanitizeText(input.subject, 100),
    duration_minutes: durationMinutes,
    question_count: questions.length,
    status: 'active',
    questions,
    answers: {},
    score: null,
  });
  return { sessionId };
}

export async function getMockExamSession(input: { sessionId: string; studentId: string }): Promise<MockExamSessionRow | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const rows = await supabaseSelect<MockExamSessionRow>(TABLES.mockExamSessions, {
    select: '*',
    filters: [
      { column: 'id', value: sanitizeId(input.sessionId) },
      { column: 'student_id', value: sanitizeId(input.studentId) },
    ],
    limit: 1,
  }).catch(() => []);
  return rows[0] ?? null;
}

export async function submitMockExamSession(input: {
  sessionId: string;
  studentId: string;
  answers: Record<string, number>;
}): Promise<{
  score: number;
  correct: number;
  total: number;
  results: Array<{ questionId: string; correct: boolean; selectedIndex: number | null; answerIndex: number }>;
}> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const session = await getMockExamSession({ sessionId: input.sessionId, studentId: input.studentId });
  if (!session) throw new Error('Mock exam session not found.');
  if (session.status === 'submitted') {
    const total = Array.isArray(session.questions) ? session.questions.length : 0;
    const score = Number(session.score) || 0;
    return { score, correct: Math.round((score / 100) * Math.max(1, total)), total, results: [] };
  }

  const safeAnswers: Record<string, number> = {};
  for (const [questionId, value] of Object.entries(input.answers || {})) {
    const index = Number(value);
    if (!Number.isFinite(index)) continue;
    safeAnswers[sanitizeText(questionId, 120)] = Math.max(0, Math.min(20, Math.trunc(index)));
  }

  let correct = 0;
  const results = session.questions.map((question) => {
    const selectedIndex = safeAnswers[question.id];
    const isCorrect = Number.isFinite(selectedIndex) && selectedIndex === question.answerIndex;
    if (isCorrect) correct += 1;
    return {
      questionId: question.id,
      correct: isCorrect,
      selectedIndex: Number.isFinite(selectedIndex) ? selectedIndex : null,
      answerIndex: question.answerIndex,
    };
  });

  const total = Math.max(1, session.questions.length);
  const score = Math.round((correct / total) * 10000) / 100;

  await supabaseUpdate<MockExamSessionRow>(
    TABLES.mockExamSessions,
    {
      answers: safeAnswers,
      score,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    },
    [
      { column: 'id', value: sanitizeId(input.sessionId) },
      { column: 'student_id', value: sanitizeId(input.studentId) },
    ]
  ).catch(() => []);

  await recordStudentActivity(input.studentId, new Date());

  return { score, correct, total, results };
}

export async function getStudentCertificateSummary(input: {
  studentId: string;
  studentName: string;
  classLevel: 10 | 12;
  rollCode: string;
  schoolId?: string;
}): Promise<{
  studentName: string;
  classLevel: 10 | 12;
  rollCode: string;
  generatedAt: string;
  attendancePercentage: number;
  averageGrade: number;
  examsAttempted: number;
  chaptersCompleted: number;
  currentStreak: number;
  longestStreak: number;
  badges: string[];
}> {
  const grades = await listStudentGrades({
    studentId: input.studentId,
    rollCode: input.rollCode,
    schoolId: input.schoolId,
  });
  const attendance = await getStudentAttendanceSummary({ studentId: input.studentId, schoolId: input.schoolId, days: 180 });
  const streak = await getStudentStreakData(input.studentId);
  const badges = await listStudentBadges(input.studentId);

  const examsAttempted = grades.length;
  const averageGrade = grades.length > 0
    ? Math.round((grades.reduce((sum, row) => sum + row.score, 0) / grades.length) * 100) / 100
    : 0;
  const chaptersCompleted = new Set(grades.filter((row) => row.score >= 40).map((row) => row.chapterId)).size;

  return {
    studentName: input.studentName,
    classLevel: input.classLevel,
    rollCode: input.rollCode,
    generatedAt: new Date().toISOString(),
    attendancePercentage: attendance.percentage,
    averageGrade,
    examsAttempted,
    chaptersCompleted,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    badges: badges.map((badge) => badge.badgeType),
  };
}

