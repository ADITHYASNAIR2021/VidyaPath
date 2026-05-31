import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readStateFromSupabase, writeStateToSupabase } from '@/lib/persistence/supabase-state';

interface GeneratedQuestionHistoryItem {
  id: string;
  authUserId: string;
  chapterId: string;
  subject?: string;
  hash: string;
  stem: string;
  generatedAt: string;
}

interface QuestionPerformanceItem {
  id: string;
  authUserId: string;
  chapterId: string;
  hash: string;
  stem: string;
  attempts: number;
  correct: number;
  incorrect: number;
  updatedAt: string;
}

export interface AdaptiveQuestionHistoryProfile {
  attempted: number;
  aggregateAccuracy: number | null;
  targetDifficultyBand: 'foundation' | 'standard' | 'challenge';
  recommendedDifficultyMix: string;
  reviewQuota: number;
  recentHashes: string[];
  recentQuestions: string[];
  weakHashes: string[];
  weakQuestions: string[];
  strongHashes: string[];
  attemptedHashes: string[];
}

interface QuestionHistoryState {
  updatedAt: string;
  generated: GeneratedQuestionHistoryItem[];
  performance: QuestionPerformanceItem[];
}

interface QuestionOutcomeInput {
  question: string;
  correct: boolean;
}

const STATE_KEY = 'ai_question_history_v1';
const RUNTIME_DIR = path.join(process.cwd(), 'lib', 'runtime');
const STATE_PATH = path.join(RUNTIME_DIR, 'ai-question-history.json');
const MAX_GENERATED = 12000;
const MAX_PERFORMANCE = 12000;

let memoryState: QuestionHistoryState = {
  updatedAt: new Date().toISOString(),
  generated: [],
  performance: [],
};

function normalizeStem(question: string): string {
  return String(question || '')
    .toLowerCase()
    .replace(/\[s\d+\]/gi, ' ')
    .replace(/[^a-z0-9\u0900-\u097f\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

async function readState(): Promise<QuestionHistoryState> {
  const remote = await readStateFromSupabase<QuestionHistoryState>(STATE_KEY);
  if (remote) {
    return {
      updatedAt: remote.updatedAt ?? new Date().toISOString(),
      generated: Array.isArray(remote.generated) ? remote.generated : [],
      performance: Array.isArray(remote.performance) ? remote.performance : [],
    };
  }
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as QuestionHistoryState;
    return {
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      generated: Array.isArray(parsed.generated) ? parsed.generated : [],
      performance: Array.isArray(parsed.performance) ? parsed.performance : [],
    };
  } catch {
    return { ...memoryState };
  }
}

async function writeState(next: QuestionHistoryState): Promise<void> {
  // Do not cache in memoryState — concurrent requests from different users would
  // read each other's stale writes. Always write-through to persistent store only.
  const remoteOk = await writeStateToSupabase(STATE_KEY, next);
  if (remoteOk) return;
  try {
    await fs.mkdir(RUNTIME_DIR, { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(next, null, 2), 'utf-8');
  } catch {
    // Ignore local persistence failures.
  }
}

export function hashQuestionStem(question: string): string {
  return createHash('sha1').update(normalizeStem(question)).digest('hex');
}

export async function getRecentQuestionHistory(input: {
  authUserId?: string | null;
  chapterId?: string | null;
  limit?: number;
}): Promise<{
  recentHashes: string[];
  recentQuestions: string[];
  attempted: number;
  accuracyRate: number | null;
  weakQuestions: string[];
}> {
  const authUserId = String(input.authUserId || '').trim();
  const chapterId = String(input.chapterId || '').trim();
  if (!authUserId || !chapterId) {
    return { recentHashes: [], recentQuestions: [], attempted: 0, accuracyRate: null, weakQuestions: [] };
  }

  const limit = Math.max(1, Math.min(20, Math.floor(input.limit || 12)));
  const state = await readState();
  const generated = state.generated
    .filter((item) => item.authUserId === authUserId && item.chapterId === chapterId)
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
  const deduped = new Map<string, GeneratedQuestionHistoryItem>();
  for (const item of generated) {
    if (!deduped.has(item.hash)) deduped.set(item.hash, item);
    if (deduped.size >= limit) break;
  }

  const performance = state.performance.filter(
    (item) => item.authUserId === authUserId && item.chapterId === chapterId
  );
  const attempted = performance.reduce((sum, item) => sum + item.attempts, 0);
  const correct = performance.reduce((sum, item) => sum + item.correct, 0);
  const weakQuestions = performance
    .filter((item) => item.attempts >= 1 && item.correct / Math.max(1, item.attempts) < 0.45)
    .sort((a, b) => (a.correct / Math.max(1, a.attempts)) - (b.correct / Math.max(1, b.attempts)))
    .slice(0, 6)
    .map((item) => item.stem);

  return {
    recentHashes: [...deduped.values()].map((item) => item.hash),
    recentQuestions: [...deduped.values()].map((item) => item.stem),
    attempted,
    accuracyRate: attempted > 0 ? Number((correct / attempted).toFixed(2)) : null,
    weakQuestions,
  };
}

function deriveAdaptiveBand(aggregateAccuracy: number | null): AdaptiveQuestionHistoryProfile['targetDifficultyBand'] {
  if (aggregateAccuracy === null) return 'standard';
  if (aggregateAccuracy < 0.5) return 'foundation';
  if (aggregateAccuracy >= 0.78) return 'challenge';
  return 'standard';
}

function deriveDifficultyMix(band: AdaptiveQuestionHistoryProfile['targetDifficultyBand']): string {
  if (band === 'foundation') return '50% easy, 35% medium, 15% hard';
  if (band === 'challenge') return '20% easy, 35% medium, 45% hard';
  return '30% easy, 45% medium, 25% hard';
}

function deriveReviewQuota(band: AdaptiveQuestionHistoryProfile['targetDifficultyBand']): number {
  if (band === 'foundation') return 0.35;
  if (band === 'challenge') return 0.1;
  return 0.2;
}

export async function getAdaptiveHistoryProfile(input: {
  authUserId?: string | null;
  chapterIds: string[];
  recentLimit?: number;
}): Promise<AdaptiveQuestionHistoryProfile> {
  const authUserId = String(input.authUserId || '').trim();
  const chapterIds = Array.from(new Set((input.chapterIds ?? []).map((item) => String(item || '').trim()).filter(Boolean)));
  if (!authUserId || chapterIds.length === 0) {
    return {
      attempted: 0,
      aggregateAccuracy: null,
      targetDifficultyBand: 'standard',
      recommendedDifficultyMix: deriveDifficultyMix('standard'),
      reviewQuota: deriveReviewQuota('standard'),
      recentHashes: [],
      recentQuestions: [],
      weakHashes: [],
      weakQuestions: [],
      strongHashes: [],
      attemptedHashes: [],
    };
  }

  const state = await readState();
  const recentLimit = Math.max(1, Math.min(20, Math.floor(input.recentLimit || 10)));
  const generated = state.generated
    .filter((item) => item.authUserId === authUserId && chapterIds.includes(item.chapterId))
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
  const dedupRecent = new Map<string, GeneratedQuestionHistoryItem>();
  for (const item of generated) {
    if (!dedupRecent.has(item.hash)) dedupRecent.set(item.hash, item);
    if (dedupRecent.size >= recentLimit) break;
  }

  const performance = state.performance.filter(
    (item) => item.authUserId === authUserId && chapterIds.includes(item.chapterId)
  );
  const attempted = performance.reduce((sum, item) => sum + item.attempts, 0);
  const correct = performance.reduce((sum, item) => sum + item.correct, 0);
  const aggregateAccuracy = attempted > 0 ? Number((correct / attempted).toFixed(2)) : null;
  const targetDifficultyBand = deriveAdaptiveBand(aggregateAccuracy);
  const sortedWeak = performance
    .filter((item) => item.attempts >= 1 && item.correct / Math.max(1, item.attempts) < 0.55)
    .sort((a, b) => {
      const aRate = a.correct / Math.max(1, a.attempts);
      const bRate = b.correct / Math.max(1, b.attempts);
      if (aRate !== bRate) return aRate - bRate;
      return b.attempts - a.attempts;
    });
  const sortedStrong = performance
    .filter((item) => item.attempts >= 1 && item.correct / Math.max(1, item.attempts) >= 0.75)
    .sort((a, b) => {
      const aRate = a.correct / Math.max(1, a.attempts);
      const bRate = b.correct / Math.max(1, b.attempts);
      if (aRate !== bRate) return bRate - aRate;
      return b.attempts - a.attempts;
    });

  return {
    attempted,
    aggregateAccuracy,
    targetDifficultyBand,
    recommendedDifficultyMix: deriveDifficultyMix(targetDifficultyBand),
    reviewQuota: deriveReviewQuota(targetDifficultyBand),
    recentHashes: [...dedupRecent.values()].map((item) => item.hash),
    recentQuestions: [...dedupRecent.values()].map((item) => item.stem),
    weakHashes: sortedWeak.slice(0, 10).map((item) => item.hash),
    weakQuestions: sortedWeak.slice(0, 8).map((item) => item.stem),
    strongHashes: sortedStrong.slice(0, 10).map((item) => item.hash),
    attemptedHashes: performance.map((item) => item.hash),
  };
}

export function prioritizeUnseenQuestions<T extends { question: string }>(
  items: T[],
  recentHashes: string[]
): T[] {
  if (recentHashes.length === 0) return items;
  const seen = new Set(recentHashes);
  const unseen = items.filter((item) => !seen.has(hashQuestionStem(item.question)));
  const alreadySeen = items.filter((item) => seen.has(hashQuestionStem(item.question)));
  return [...unseen, ...alreadySeen];
}

export function prioritizeQuestionsForAdaptiveProfile<T extends { question: string }>(
  items: T[],
  profile: AdaptiveQuestionHistoryProfile
): T[] {
  const recent = new Set(profile.recentHashes);
  const weak = new Set(profile.weakHashes);
  const strong = new Set(profile.strongHashes);
  return [...items].sort((a, b) => {
    const hashA = hashQuestionStem(a.question);
    const hashB = hashQuestionStem(b.question);

    const scoreFor = (hash: string) => {
      const unseenBoost = recent.has(hash) ? 0 : 4;
      const weakBoost = weak.has(hash) ? 5 : 0;
      const strongBoost = strong.has(hash) ? 3 : 0;
      if (profile.targetDifficultyBand === 'foundation') return weakBoost + unseenBoost;
      if (profile.targetDifficultyBand === 'challenge') return unseenBoost + strongBoost - (recent.has(hash) ? 2 : 0);
      return unseenBoost + weakBoost * 0.6 + strongBoost * 0.4;
    };

    return scoreFor(hashB) - scoreFor(hashA);
  });
}

export async function recordGeneratedQuestions(input: {
  authUserId?: string | null;
  chapterId?: string | null;
  subject?: string | null;
  questions: Array<{ question: string }>;
}): Promise<void> {
  const authUserId = String(input.authUserId || '').trim();
  const chapterId = String(input.chapterId || '').trim();
  if (!authUserId || !chapterId || input.questions.length === 0) return;

  const state = await readState();
  const timestamp = new Date().toISOString();
  const nextItems = input.questions
    .map((item) => normalizeStem(item.question))
    .filter(Boolean)
    .map((stem) => ({
      id: randomUUID(),
      authUserId,
      chapterId,
      subject: input.subject ? String(input.subject).trim() : undefined,
      hash: hashQuestionStem(stem),
      stem,
      generatedAt: timestamp,
    }));

  await writeState({
    ...state,
    updatedAt: timestamp,
    generated: [...nextItems, ...state.generated].slice(0, MAX_GENERATED),
  });
}

export async function recordQuestionOutcomes(input: {
  authUserId?: string | null;
  chapterId?: string | null;
  results: QuestionOutcomeInput[];
}): Promise<void> {
  const authUserId = String(input.authUserId || '').trim();
  const chapterId = String(input.chapterId || '').trim();
  if (!authUserId || !chapterId || input.results.length === 0) return;

  const state = await readState();
  const nextPerformance = [...state.performance];
  const timestamp = new Date().toISOString();

  for (const result of input.results) {
    const stem = normalizeStem(result.question);
    if (!stem) continue;
    const hash = hashQuestionStem(stem);
    const existingIndex = nextPerformance.findIndex(
      (item) => item.authUserId === authUserId && item.chapterId === chapterId && item.hash === hash
    );
    if (existingIndex >= 0) {
      const existing = nextPerformance[existingIndex];
      nextPerformance[existingIndex] = {
        ...existing,
        attempts: existing.attempts + 1,
        correct: existing.correct + (result.correct ? 1 : 0),
        incorrect: existing.incorrect + (result.correct ? 0 : 1),
        updatedAt: timestamp,
      };
      continue;
    }
    nextPerformance.unshift({
      id: randomUUID(),
      authUserId,
      chapterId,
      hash,
      stem,
      attempts: 1,
      correct: result.correct ? 1 : 0,
      incorrect: result.correct ? 0 : 1,
      updatedAt: timestamp,
    });
  }

  await writeState({
    ...state,
    updatedAt: timestamp,
    performance: nextPerformance.slice(0, MAX_PERFORMANCE),
  });
}
