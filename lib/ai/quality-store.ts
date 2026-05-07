import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readStateFromSupabase, writeStateToSupabase } from '@/lib/persistence/supabase-state';

type AiTask =
  | 'chat'
  | 'flashcards'
  | 'mcq'
  | 'adaptive-test'
  | 'revision-plan'
  | 'paper-evaluate'
  | 'chapter-pack'
  | 'chapter-drill'
  | 'chapter-diagnose'
  | 'chapter-remediate';

type Provider = 'nvidia' | 'gemini' | 'groq' | 'cerebras' | 'mistral';

export interface AiQualityRecord {
  id: string;
  createdAt: string;
  task: AiTask;
  provider?: Provider;
  model?: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  success: boolean;
  contextSnippetCount?: number;
  groundednessScore?: number;
  citationCoverageScore?: number;
  retrievalMiss?: boolean;
  repaired?: boolean;
  rejected?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface AiQualityFeedback {
  id: string;
  createdAt: string;
  schoolId?: string;
  authUserId?: string;
  role?: 'student' | 'teacher' | 'admin' | 'developer';
  task?: AiTask | 'unknown';
  chapterId?: string;
  responseId?: string;
  issueType: 'unsafe-answer' | 'weak-grounding' | 'missing-citation' | 'hallucination-flag' | 'other';
  note?: string;
}

interface AiQualityState {
  updatedAt: string;
  records: AiQualityRecord[];
  feedback: AiQualityFeedback[];
}

const STATE_KEY = 'ai_quality_v1';
const RUNTIME_DIR = path.join(process.cwd(), 'lib', 'runtime');
const STATE_PATH = path.join(RUNTIME_DIR, 'ai-quality.json');
const MAX_RECORDS = 3000;
const MAX_FEEDBACK = 1500;

let memoryState: AiQualityState = {
  updatedAt: new Date().toISOString(),
  records: [],
  feedback: [],
};

function sanitizeText(input: string, max = 240): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function readState(): Promise<AiQualityState> {
  const remote = await readStateFromSupabase<AiQualityState>(STATE_KEY);
  if (remote) {
    const normalized: AiQualityState = {
      updatedAt: remote.updatedAt ?? new Date().toISOString(),
      records: Array.isArray(remote.records) ? remote.records : [],
      feedback: Array.isArray(remote.feedback) ? remote.feedback : [],
    };
    memoryState = normalized;
    return normalized;
  }
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as AiQualityState;
    const normalized: AiQualityState = {
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      records: Array.isArray(parsed.records) ? parsed.records : [],
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    };
    memoryState = normalized;
    return normalized;
  } catch {
    return memoryState;
  }
}

async function writeState(next: AiQualityState): Promise<void> {
  memoryState = next;
  const remoteOk = await writeStateToSupabase(STATE_KEY, next);
  if (remoteOk) return;
  try {
    await fs.mkdir(RUNTIME_DIR, { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(next, null, 2), 'utf-8');
  } catch {
    // Ignore local write errors in restricted environments.
  }
}

export async function recordAiQualityRecord(
  input: Omit<AiQualityRecord, 'id' | 'createdAt'> & { createdAt?: string }
): Promise<void> {
  const state = await readState();
  const record: AiQualityRecord = {
    id: randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    task: input.task,
    provider: input.provider,
    model: input.model ? sanitizeText(input.model, 180) : undefined,
    latencyMs: safeNumber(input.latencyMs),
    promptTokens: safeNumber(input.promptTokens),
    completionTokens: safeNumber(input.completionTokens),
    totalTokens: safeNumber(input.totalTokens),
    success: input.success === true,
    contextSnippetCount: safeNumber(input.contextSnippetCount),
    groundednessScore: safeNumber(input.groundednessScore),
    citationCoverageScore: safeNumber(input.citationCoverageScore),
    retrievalMiss: input.retrievalMiss === true,
    repaired: input.repaired === true,
    rejected: input.rejected === true,
    errorCode: input.errorCode ? sanitizeText(input.errorCode, 120) : undefined,
    errorMessage: input.errorMessage ? sanitizeText(input.errorMessage, 500) : undefined,
  };
  const records = [record, ...state.records].slice(0, MAX_RECORDS);
  await writeState({
    ...state,
    records,
    updatedAt: new Date().toISOString(),
  });
}

export async function recordAiQualityFeedback(
  input: Omit<AiQualityFeedback, 'id' | 'createdAt'> & { createdAt?: string }
): Promise<void> {
  const state = await readState();
  const feedbackItem: AiQualityFeedback = {
    id: randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    schoolId: input.schoolId ? sanitizeText(input.schoolId, 120) : undefined,
    authUserId: input.authUserId ? sanitizeText(input.authUserId, 120) : undefined,
    role: input.role,
    task: input.task,
    chapterId: input.chapterId ? sanitizeText(input.chapterId, 120) : undefined,
    responseId: input.responseId ? sanitizeText(input.responseId, 120) : undefined,
    issueType: input.issueType,
    note: input.note ? sanitizeText(input.note, 1000) : undefined,
  };
  const feedback = [feedbackItem, ...state.feedback].slice(0, MAX_FEEDBACK);
  await writeState({
    ...state,
    feedback,
    updatedAt: new Date().toISOString(),
  });
}

export async function getAiQualitySummary(windowHours = 168): Promise<{
  generatedAt: string;
  windowHours: number;
  records: number;
  successes: number;
  failures: number;
  repairRatePercent: number;
  rejectionRatePercent: number;
  retrievalMissRatePercent: number;
  avgGroundednessScore: number;
  avgCitationCoverageScore: number;
  hallucinationFlags: number;
  providerStats: Array<{
    task: string;
    provider: string;
    model: string;
    events: number;
    failures: number;
    avgLatencyMs: number;
    totalTokens: number;
  }>;
  taskStats: Array<{
    task: string;
    events: number;
    failureRatePercent: number;
    avgGroundednessScore: number;
  }>;
  recentFlags: Array<{
    id: string;
    createdAt: string;
    task: string;
    provider?: string;
    model?: string;
    issue: string;
  }>;
  feedback: {
    total: number;
    unsafeAnswer: number;
    weakGrounding: number;
    missingCitation: number;
    hallucinationFlag: number;
    other: number;
  };
}> {
  const safeWindow = Math.max(1, Math.min(24 * 60, Number(windowHours) || 168));
  const cutoffMs = Date.now() - safeWindow * 60 * 60 * 1000;
  const state = await readState();
  const records = state.records.filter((record) => Date.parse(record.createdAt) >= cutoffMs);
  const feedback = state.feedback.filter((item) => Date.parse(item.createdAt) >= cutoffMs);
  const successes = records.filter((record) => record.success).length;
  const failures = records.length - successes;
  const repaired = records.filter((record) => record.repaired === true).length;
  const rejected = records.filter((record) => record.rejected === true).length;
  const retrievalMiss = records.filter((record) => record.retrievalMiss === true).length;

  const groundedScores = records
    .map((record) => safeNumber(record.groundednessScore))
    .filter((value): value is number => typeof value === 'number');
  const citationScores = records
    .map((record) => safeNumber(record.citationCoverageScore))
    .filter((value): value is number => typeof value === 'number');

  const providerMap = new Map<string, {
    task: string;
    provider: string;
    model: string;
    events: number;
    failures: number;
    latencyTotal: number;
    latencySamples: number;
    totalTokens: number;
  }>();
  for (const record of records) {
    const key = `${record.task}::${record.provider || 'unknown'}::${record.model || 'unknown'}`;
    const bucket = providerMap.get(key) ?? {
      task: record.task,
      provider: record.provider || 'unknown',
      model: record.model || 'unknown',
      events: 0,
      failures: 0,
      latencyTotal: 0,
      latencySamples: 0,
      totalTokens: 0,
    };
    bucket.events += 1;
    if (!record.success) bucket.failures += 1;
    if (Number.isFinite(Number(record.latencyMs))) {
      bucket.latencyTotal += Number(record.latencyMs) || 0;
      bucket.latencySamples += 1;
    }
    bucket.totalTokens += Math.max(0, Number(record.totalTokens) || 0);
    providerMap.set(key, bucket);
  }
  const providerStats = [...providerMap.values()]
    .map((bucket) => ({
      task: bucket.task,
      provider: bucket.provider,
      model: bucket.model,
      events: bucket.events,
      failures: bucket.failures,
      avgLatencyMs: bucket.latencySamples > 0 ? Math.round(bucket.latencyTotal / bucket.latencySamples) : 0,
      totalTokens: bucket.totalTokens,
    }))
    .sort((a, b) => b.events - a.events)
    .slice(0, 24);

  const taskMap = new Map<string, { events: number; failures: number; grounded: number; groundedSamples: number }>();
  for (const record of records) {
    const bucket = taskMap.get(record.task) ?? { events: 0, failures: 0, grounded: 0, groundedSamples: 0 };
    bucket.events += 1;
    if (!record.success) bucket.failures += 1;
    if (Number.isFinite(Number(record.groundednessScore))) {
      bucket.grounded += Number(record.groundednessScore) || 0;
      bucket.groundedSamples += 1;
    }
    taskMap.set(record.task, bucket);
  }
  const taskStats = [...taskMap.entries()]
    .map(([task, bucket]) => ({
      task,
      events: bucket.events,
      failureRatePercent: bucket.events > 0 ? Math.round((bucket.failures / bucket.events) * 10000) / 100 : 0,
      avgGroundednessScore:
        bucket.groundedSamples > 0 ? Math.round((bucket.grounded / bucket.groundedSamples) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.events - a.events);

  const recentFlags = records
    .filter((record) => {
      const lowGrounding = Number(record.groundednessScore) > 0 && Number(record.groundednessScore) < 45;
      return record.rejected === true || record.retrievalMiss === true || lowGrounding || !record.success;
    })
    .slice(0, 30)
    .map((record) => ({
      id: record.id,
      createdAt: record.createdAt,
      task: record.task,
      provider: record.provider,
      model: record.model,
      issue: !record.success
        ? (record.errorCode || 'generation-failed')
        : record.rejected
          ? 'rejected-after-grounding-check'
          : record.retrievalMiss
            ? 'retrieval-miss'
            : 'low-grounding',
    }));

  const feedbackSummary = {
    total: feedback.length,
    unsafeAnswer: feedback.filter((item) => item.issueType === 'unsafe-answer').length,
    weakGrounding: feedback.filter((item) => item.issueType === 'weak-grounding').length,
    missingCitation: feedback.filter((item) => item.issueType === 'missing-citation').length,
    hallucinationFlag: feedback.filter((item) => item.issueType === 'hallucination-flag').length,
    other: feedback.filter((item) => item.issueType === 'other').length,
  };

  return {
    generatedAt: new Date().toISOString(),
    windowHours: safeWindow,
    records: records.length,
    successes,
    failures,
    repairRatePercent: records.length > 0 ? Math.round((repaired / records.length) * 10000) / 100 : 0,
    rejectionRatePercent: records.length > 0 ? Math.round((rejected / records.length) * 10000) / 100 : 0,
    retrievalMissRatePercent: records.length > 0 ? Math.round((retrievalMiss / records.length) * 10000) / 100 : 0,
    avgGroundednessScore:
      groundedScores.length > 0
        ? Math.round((groundedScores.reduce((sum, value) => sum + value, 0) / groundedScores.length) * 100) / 100
        : 0,
    avgCitationCoverageScore:
      citationScores.length > 0
        ? Math.round((citationScores.reduce((sum, value) => sum + value, 0) / citationScores.length) * 100) / 100
        : 0,
    hallucinationFlags:
      recentFlags.filter((item) => item.issue.includes('low-grounding') || item.issue.includes('rejected')).length +
      feedbackSummary.hallucinationFlag +
      feedbackSummary.unsafeAnswer,
    providerStats,
    taskStats,
    recentFlags,
    feedback: feedbackSummary,
  };
}
