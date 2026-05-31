import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readStateFromSupabase, writeStateToSupabase } from '@/lib/persistence/supabase-state';

export type AiTask =
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
type QualityBand = 'excellent' | 'healthy' | 'watch' | 'critical';
export type AiQualityRole = 'student' | 'teacher' | 'admin' | 'developer';
export type AiQualityIssueType =
  | 'unsafe-answer'
  | 'weak-grounding'
  | 'missing-citation'
  | 'hallucination-flag'
  | 'other';

export interface AiQualityRecord {
  id: string;
  createdAt: string;
  task: AiTask;
  provider?: Provider;
  model?: string;
  schoolId?: string;
  authUserId?: string;
  role?: AiQualityRole;
  subject?: string;
  chapterId?: string;
  endpoint?: string;
  requestId?: string;
  responseId?: string;
  promptVersion?: string;
  routingKey?: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  success: boolean;
  contextSnippetCount?: number;
  groundednessScore?: number;
  citationCoverageScore?: number;
  retrievalConfidence?: number;
  retrievalConfidenceLevel?: 'low' | 'medium' | 'high';
  retrievalAvgRelevance?: number;
  retrievalMiss?: boolean;
  repaired?: boolean;
  rejected?: boolean;
  hallucinationFlag?: boolean;
  lowQuality?: boolean;
  qualityBand?: QualityBand;
  errorCode?: string;
  errorMessage?: string;
}

export interface AiQualityFeedback {
  id: string;
  createdAt: string;
  schoolId?: string;
  authUserId?: string;
  role?: AiQualityRole;
  task?: AiTask | 'unknown';
  chapterId?: string;
  subject?: string;
  provider?: string;
  model?: string;
  responseId?: string;
  retrievalMiss?: boolean;
  hallucinationFlag?: boolean;
  issueType: AiQualityIssueType;
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
const MAX_RECORDS = 5000;
const MAX_FEEDBACK = 2500;

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

function safePercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function deriveQualityBand(input: {
  success: boolean;
  groundednessScore?: number;
  citationCoverageScore?: number;
  retrievalMiss?: boolean;
  hallucinationFlag?: boolean;
  rejected?: boolean;
}): QualityBand {
  if (!input.success || input.rejected || input.hallucinationFlag) return 'critical';
  if (input.retrievalMiss) return 'watch';
  const groundedness = safeNumber(input.groundednessScore) ?? 0;
  const citations = safeNumber(input.citationCoverageScore) ?? 0;
  if (groundedness >= 80 && citations >= 75) return 'excellent';
  if (groundedness >= 60 && citations >= 45) return 'healthy';
  if (groundedness >= 35) return 'watch';
  return 'critical';
}

function isLowQualityRecord(record: AiQualityRecord): boolean {
  if (record.lowQuality === true) return true;
  if (!record.success || record.rejected || record.hallucinationFlag) return true;
  if (record.retrievalMiss) return true;
  const groundedness = safeNumber(record.groundednessScore);
  const citations = safeNumber(record.citationCoverageScore);
  return (typeof groundedness === 'number' && groundedness < 40) || (typeof citations === 'number' && citations < 30);
}

function bucketDate(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return 'unknown';
  return value.toISOString().slice(0, 10);
}

async function readState(): Promise<AiQualityState> {
  const remote = await readStateFromSupabase<AiQualityState>(STATE_KEY);
  if (remote) {
    return {
      updatedAt: remote.updatedAt ?? new Date().toISOString(),
      records: Array.isArray(remote.records) ? remote.records : [],
      feedback: Array.isArray(remote.feedback) ? remote.feedback : [],
    };
  }
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as AiQualityState;
    return {
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      records: Array.isArray(parsed.records) ? parsed.records : [],
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    };
  } catch {
    return { ...memoryState };
  }
}

async function writeState(next: AiQualityState): Promise<void> {
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
  input: Omit<AiQualityRecord, 'id' | 'createdAt' | 'qualityBand' | 'lowQuality'> & {
    createdAt?: string;
    qualityBand?: QualityBand;
    lowQuality?: boolean;
  }
): Promise<void> {
  const state = await readState();
  const derivedQualityBand =
    input.qualityBand ??
    deriveQualityBand({
      success: input.success === true,
      groundednessScore: input.groundednessScore,
      citationCoverageScore: input.citationCoverageScore,
      retrievalMiss: input.retrievalMiss === true,
      hallucinationFlag: input.hallucinationFlag === true,
      rejected: input.rejected === true,
    });
  const record: AiQualityRecord = {
    id: randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    task: input.task,
    provider: input.provider,
    model: input.model ? sanitizeText(input.model, 180) : undefined,
    schoolId: input.schoolId ? sanitizeText(input.schoolId, 120) : undefined,
    authUserId: input.authUserId ? sanitizeText(input.authUserId, 120) : undefined,
    role: input.role,
    subject: input.subject ? sanitizeText(input.subject, 120) : undefined,
    chapterId: input.chapterId ? sanitizeText(input.chapterId, 120) : undefined,
    endpoint: input.endpoint ? sanitizeText(input.endpoint, 120) : undefined,
    requestId: input.requestId ? sanitizeText(input.requestId, 120) : undefined,
    responseId: input.responseId ? sanitizeText(input.responseId, 120) : undefined,
    promptVersion: input.promptVersion ? sanitizeText(input.promptVersion, 120) : undefined,
    routingKey: input.routingKey ? sanitizeText(input.routingKey, 180) : undefined,
    latencyMs: safeNumber(input.latencyMs),
    promptTokens: safeNumber(input.promptTokens),
    completionTokens: safeNumber(input.completionTokens),
    totalTokens: safeNumber(input.totalTokens),
    success: input.success === true,
    contextSnippetCount: safeNumber(input.contextSnippetCount),
    groundednessScore: safeNumber(input.groundednessScore),
    citationCoverageScore: safeNumber(input.citationCoverageScore),
    retrievalConfidence: safeNumber(input.retrievalConfidence),
    retrievalConfidenceLevel: input.retrievalConfidenceLevel,
    retrievalAvgRelevance: safeNumber(input.retrievalAvgRelevance),
    retrievalMiss: input.retrievalMiss === true,
    repaired: input.repaired === true,
    rejected: input.rejected === true,
    hallucinationFlag: input.hallucinationFlag === true,
    lowQuality:
      input.lowQuality === true ||
      isLowQualityRecord({
        id: 'derived',
        createdAt: input.createdAt ?? new Date().toISOString(),
        task: input.task,
        success: input.success === true,
        groundednessScore: input.groundednessScore,
        citationCoverageScore: input.citationCoverageScore,
        retrievalMiss: input.retrievalMiss === true,
        hallucinationFlag: input.hallucinationFlag === true,
        rejected: input.rejected === true,
      }),
    qualityBand: derivedQualityBand,
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
    subject: input.subject ? sanitizeText(input.subject, 120) : undefined,
    provider: input.provider ? sanitizeText(input.provider, 80) : undefined,
    model: input.model ? sanitizeText(input.model, 180) : undefined,
    responseId: input.responseId ? sanitizeText(input.responseId, 120) : undefined,
    retrievalMiss: input.retrievalMiss === true,
    hallucinationFlag: input.hallucinationFlag === true,
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

export async function getAiQualitySummary(
  windowHours = 168,
  filter?: { schoolId?: string }
): Promise<{
  generatedAt: string;
  windowHours: number;
  records: number;
  successes: number;
  failures: number;
  repairRatePercent: number;
  rejectionRatePercent: number;
  retrievalMissRatePercent: number;
  lowQualityGenerationRatePercent: number;
  avgGroundednessScore: number;
  avgCitationCoverageScore: number;
  avgRetrievalConfidence: number;
  hallucinationFlags: number;
  providerStats: Array<{
    task: string;
    provider: string;
    model: string;
    events: number;
    successes: number;
    failures: number;
    lowQualityEvents: number;
    failureRatePercent: number;
    lowQualityRatePercent: number;
    avgLatencyMs: number;
    avgGroundednessScore: number;
    avgRetrievalConfidence: number;
    totalTokens: number;
  }>;
  modelStats: Array<{
    provider: string;
    model: string;
    events: number;
    failureRatePercent: number;
    lowQualityRatePercent: number;
    avgGroundednessScore: number;
  }>;
  taskStats: Array<{
    task: string;
    events: number;
    failureRatePercent: number;
    lowQualityRatePercent: number;
    avgGroundednessScore: number;
    avgLatencyMs: number;
  }>;
  chapterStats: Array<{
    chapterId: string;
    subject: string;
    events: number;
    lowQualityEvents: number;
    retrievalMisses: number;
    avgGroundednessScore: number;
  }>;
  chapterCoverageGaps: Array<{
    chapterId: string;
    subject: string;
    events: number;
    lowQualityEvents: number;
    reason: string;
  }>;
  providerTrends: Array<{
    bucket: string;
    provider: string;
    events: number;
    failureRatePercent: number;
    lowQualityRatePercent: number;
    avgGroundednessScore: number;
    avgRetrievalConfidence: number;
  }>;
  routingRecommendations: Array<{
    task: string;
    recommendedProvider: string;
    recommendedModel: string;
    reason: string;
  }>;
  issueStats: {
    lowQualityEvents: number;
    retrievalMisses: number;
    hallucinationSignals: number;
    rejected: number;
    repaired: number;
  };
  recentFlags: Array<{
    id: string;
    createdAt: string;
    task: string;
    provider?: string;
    model?: string;
    chapterId?: string;
    subject?: string;
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
  const schoolId = filter?.schoolId ? sanitizeText(filter.schoolId, 120) : '';
  const state = await readState();
  const records = state.records.filter((record) => {
    if (Date.parse(record.createdAt) < cutoffMs) return false;
    if (schoolId && record.schoolId !== schoolId) return false;
    return true;
  });
  const feedback = state.feedback.filter((item) => {
    if (Date.parse(item.createdAt) < cutoffMs) return false;
    if (schoolId && item.schoolId !== schoolId) return false;
    return true;
  });
  const successes = records.filter((record) => record.success).length;
  const failures = records.length - successes;
  const repaired = records.filter((record) => record.repaired === true).length;
  const rejected = records.filter((record) => record.rejected === true).length;
  const retrievalMiss = records.filter((record) => record.retrievalMiss === true).length;
  const lowQualityEvents = records.filter((record) => isLowQualityRecord(record)).length;
  const hallucinationSignals = records.filter((record) => record.hallucinationFlag === true).length;

  const groundedScores = records
    .map((record) => safeNumber(record.groundednessScore))
    .filter((value): value is number => typeof value === 'number');
  const citationScores = records
    .map((record) => safeNumber(record.citationCoverageScore))
    .filter((value): value is number => typeof value === 'number');
  const confidenceScores = records
    .map((record) => safeNumber(record.retrievalConfidence))
    .filter((value): value is number => typeof value === 'number');

  const providerMap = new Map<string, {
    task: string;
    provider: string;
    model: string;
    events: number;
    successes: number;
    failures: number;
    lowQualityEvents: number;
    latencySamples: number[];
    groundedScores: number[];
    confidenceScores: number[];
    totalTokens: number;
  }>();
  const modelMap = new Map<string, {
    provider: string;
    model: string;
    events: number;
    failures: number;
    lowQualityEvents: number;
    groundedScores: number[];
  }>();
  const taskMap = new Map<string, {
    events: number;
    failures: number;
    lowQualityEvents: number;
    groundedScores: number[];
    latencySamples: number[];
  }>();
  const chapterMap = new Map<string, {
    chapterId: string;
    subject: string;
    events: number;
    lowQualityEvents: number;
    retrievalMisses: number;
    groundedScores: number[];
  }>();
  const trendMap = new Map<string, {
    bucket: string;
    provider: string;
    events: number;
    failures: number;
    lowQualityEvents: number;
    groundedScores: number[];
    confidenceScores: number[];
  }>();

  for (const record of records) {
    const lowQuality = isLowQualityRecord(record);
    const providerKey = `${record.task}::${record.provider || 'unknown'}::${record.model || 'unknown'}`;
    const providerBucket = providerMap.get(providerKey) ?? {
      task: record.task,
      provider: record.provider || 'unknown',
      model: record.model || 'unknown',
      events: 0,
      successes: 0,
      failures: 0,
      lowQualityEvents: 0,
      latencySamples: [],
      groundedScores: [],
      confidenceScores: [],
      totalTokens: 0,
    };
    providerBucket.events += 1;
    if (record.success) providerBucket.successes += 1;
    if (!record.success) providerBucket.failures += 1;
    if (lowQuality) providerBucket.lowQualityEvents += 1;
    if (typeof safeNumber(record.latencyMs) === 'number') providerBucket.latencySamples.push(Number(record.latencyMs));
    if (typeof safeNumber(record.groundednessScore) === 'number') providerBucket.groundedScores.push(Number(record.groundednessScore));
    if (typeof safeNumber(record.retrievalConfidence) === 'number') providerBucket.confidenceScores.push(Number(record.retrievalConfidence));
    providerBucket.totalTokens += Math.max(0, Number(record.totalTokens) || 0);
    providerMap.set(providerKey, providerBucket);

    const modelKey = `${record.provider || 'unknown'}::${record.model || 'unknown'}`;
    const modelBucket = modelMap.get(modelKey) ?? {
      provider: record.provider || 'unknown',
      model: record.model || 'unknown',
      events: 0,
      failures: 0,
      lowQualityEvents: 0,
      groundedScores: [],
    };
    modelBucket.events += 1;
    if (!record.success) modelBucket.failures += 1;
    if (lowQuality) modelBucket.lowQualityEvents += 1;
    if (typeof safeNumber(record.groundednessScore) === 'number') modelBucket.groundedScores.push(Number(record.groundednessScore));
    modelMap.set(modelKey, modelBucket);

    const taskBucket = taskMap.get(record.task) ?? {
      events: 0,
      failures: 0,
      lowQualityEvents: 0,
      groundedScores: [],
      latencySamples: [],
    };
    taskBucket.events += 1;
    if (!record.success) taskBucket.failures += 1;
    if (lowQuality) taskBucket.lowQualityEvents += 1;
    if (typeof safeNumber(record.groundednessScore) === 'number') taskBucket.groundedScores.push(Number(record.groundednessScore));
    if (typeof safeNumber(record.latencyMs) === 'number') taskBucket.latencySamples.push(Number(record.latencyMs));
    taskMap.set(record.task, taskBucket);

    if (record.chapterId) {
      const chapterKey = `${record.chapterId}::${record.subject || 'unknown'}`;
      const chapterBucket = chapterMap.get(chapterKey) ?? {
        chapterId: record.chapterId,
        subject: record.subject || 'unknown',
        events: 0,
        lowQualityEvents: 0,
        retrievalMisses: 0,
        groundedScores: [],
      };
      chapterBucket.events += 1;
      if (lowQuality) chapterBucket.lowQualityEvents += 1;
      if (record.retrievalMiss) chapterBucket.retrievalMisses += 1;
      if (typeof safeNumber(record.groundednessScore) === 'number') chapterBucket.groundedScores.push(Number(record.groundednessScore));
      chapterMap.set(chapterKey, chapterBucket);
    }

    const trendKey = `${bucketDate(record.createdAt)}::${record.provider || 'unknown'}`;
    const trendBucket = trendMap.get(trendKey) ?? {
      bucket: bucketDate(record.createdAt),
      provider: record.provider || 'unknown',
      events: 0,
      failures: 0,
      lowQualityEvents: 0,
      groundedScores: [],
      confidenceScores: [],
    };
    trendBucket.events += 1;
    if (!record.success) trendBucket.failures += 1;
    if (lowQuality) trendBucket.lowQualityEvents += 1;
    if (typeof safeNumber(record.groundednessScore) === 'number') trendBucket.groundedScores.push(Number(record.groundednessScore));
    if (typeof safeNumber(record.retrievalConfidence) === 'number') trendBucket.confidenceScores.push(Number(record.retrievalConfidence));
    trendMap.set(trendKey, trendBucket);
  }

  const providerStats = [...providerMap.values()]
    .map((bucket) => ({
      task: bucket.task,
      provider: bucket.provider,
      model: bucket.model,
      events: bucket.events,
      successes: bucket.successes,
      failures: bucket.failures,
      lowQualityEvents: bucket.lowQualityEvents,
      failureRatePercent: safePercent(bucket.failures, bucket.events),
      lowQualityRatePercent: safePercent(bucket.lowQualityEvents, bucket.events),
      avgLatencyMs: Math.round(average(bucket.latencySamples)),
      avgGroundednessScore: average(bucket.groundedScores),
      avgRetrievalConfidence: average(bucket.confidenceScores),
      totalTokens: bucket.totalTokens,
    }))
    .sort((a, b) => b.events - a.events)
    .slice(0, 30);

  const modelStats = [...modelMap.values()]
    .map((bucket) => ({
      provider: bucket.provider,
      model: bucket.model,
      events: bucket.events,
      failureRatePercent: safePercent(bucket.failures, bucket.events),
      lowQualityRatePercent: safePercent(bucket.lowQualityEvents, bucket.events),
      avgGroundednessScore: average(bucket.groundedScores),
    }))
    .sort((a, b) => b.events - a.events)
    .slice(0, 20);

  const taskStats = [...taskMap.entries()]
    .map(([task, bucket]) => ({
      task,
      events: bucket.events,
      failureRatePercent: safePercent(bucket.failures, bucket.events),
      lowQualityRatePercent: safePercent(bucket.lowQualityEvents, bucket.events),
      avgGroundednessScore: average(bucket.groundedScores),
      avgLatencyMs: Math.round(average(bucket.latencySamples)),
    }))
    .sort((a, b) => b.events - a.events);

  const chapterStats = [...chapterMap.values()]
    .map((bucket) => ({
      chapterId: bucket.chapterId,
      subject: bucket.subject,
      events: bucket.events,
      lowQualityEvents: bucket.lowQualityEvents,
      retrievalMisses: bucket.retrievalMisses,
      avgGroundednessScore: average(bucket.groundedScores),
    }))
    .sort((a, b) => b.lowQualityEvents - a.lowQualityEvents || b.events - a.events)
    .slice(0, 20);

  const chapterCoverageGaps = chapterStats
    .filter((item) => item.lowQualityEvents > 0 || item.retrievalMisses > 0)
    .map((item) => ({
      chapterId: item.chapterId,
      subject: item.subject,
      events: item.events,
      lowQualityEvents: item.lowQualityEvents,
      reason:
        item.retrievalMisses > 0
          ? `retrieval misses ${item.retrievalMisses} times in the recent window`
          : `low-quality generations in ${item.lowQualityEvents} of ${item.events} tracked events`,
    }))
    .slice(0, 12);

  const providerTrends = [...trendMap.values()]
    .map((bucket) => ({
      bucket: bucket.bucket,
      provider: bucket.provider,
      events: bucket.events,
      failureRatePercent: safePercent(bucket.failures, bucket.events),
      lowQualityRatePercent: safePercent(bucket.lowQualityEvents, bucket.events),
      avgGroundednessScore: average(bucket.groundedScores),
      avgRetrievalConfidence: average(bucket.confidenceScores),
    }))
    .sort((a, b) => b.bucket.localeCompare(a.bucket) || a.provider.localeCompare(b.provider))
    .slice(0, 40);

  const routingRecommendations = [...providerMap.values()]
    .filter((bucket) => bucket.events >= 2)
    .sort((a, b) => {
      const aScore =
        (a.successes / Math.max(1, a.events)) * 65 +
        average(a.groundedScores) * 0.3 +
        average(a.confidenceScores) * 0.15 -
        Math.min(12, average(a.latencySamples) / 1000);
      const bScore =
        (b.successes / Math.max(1, b.events)) * 65 +
        average(b.groundedScores) * 0.3 +
        average(b.confidenceScores) * 0.15 -
        Math.min(12, average(b.latencySamples) / 1000);
      return bScore - aScore;
    })
    .reduce<Array<{ task: string; recommendedProvider: string; recommendedModel: string; reason: string }>>((acc, bucket) => {
      if (acc.some((item) => item.task === bucket.task)) return acc;
      acc.push({
        task: bucket.task,
        recommendedProvider: bucket.provider,
        recommendedModel: bucket.model,
        reason: `best recent mix of success (${safePercent(bucket.successes, bucket.events)}%), grounding (${average(bucket.groundedScores)}), and confidence (${average(bucket.confidenceScores)})`,
      });
      return acc;
    }, [])
    .slice(0, 12);

  const recentFlags = records
    .filter((record) => isLowQualityRecord(record) || !record.success)
    .slice(0, 30)
    .map((record) => ({
      id: record.id,
      createdAt: record.createdAt,
      task: record.task,
      provider: record.provider,
      model: record.model,
      chapterId: record.chapterId,
      subject: record.subject,
      issue: !record.success
        ? record.errorCode || 'generation-failed'
        : record.hallucinationFlag
          ? 'hallucination-signal'
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
    hallucinationFlag:
      feedback.filter((item) => item.issueType === 'hallucination-flag' || item.hallucinationFlag === true).length,
    other: feedback.filter((item) => item.issueType === 'other').length,
  };

  return {
    generatedAt: new Date().toISOString(),
    windowHours: safeWindow,
    records: records.length,
    successes,
    failures,
    repairRatePercent: safePercent(repaired, records.length),
    rejectionRatePercent: safePercent(rejected, records.length),
    retrievalMissRatePercent: safePercent(retrievalMiss, records.length),
    lowQualityGenerationRatePercent: safePercent(lowQualityEvents, records.length),
    avgGroundednessScore: average(groundedScores),
    avgCitationCoverageScore: average(citationScores),
    avgRetrievalConfidence: average(confidenceScores),
    hallucinationFlags: hallucinationSignals + feedbackSummary.hallucinationFlag + feedbackSummary.unsafeAnswer,
    providerStats,
    modelStats,
    taskStats,
    chapterStats,
    chapterCoverageGaps,
    providerTrends,
    routingRecommendations,
    issueStats: {
      lowQualityEvents,
      retrievalMisses: retrievalMiss,
      hallucinationSignals,
      rejected,
      repaired,
    },
    recentFlags,
    feedback: feedbackSummary,
  };
}

export async function rankModelCandidatesForTask<T extends { provider?: string; model?: string }>(
  task: AiTask,
  candidates: T[],
  sampleSize = 100
): Promise<T[]> {
  if (candidates.length < 2) return candidates;
  const state = await readState();
  const relevant = state.records
    .filter((record) => record.task === task && typeof record.provider === 'string' && typeof record.model === 'string')
    .slice(0, Math.max(20, sampleSize));
  if (relevant.length < 6) return candidates;

  const stats = new Map<string, {
    events: number;
    successes: number;
    grounded: number[];
    confidence: number[];
    latency: number[];
    lowQualityEvents: number;
    rejectionEvents: number;
    hallucinationEvents: number;
    retrievalMissEvents: number;
  }>();

  for (const record of relevant) {
    const key = `${record.provider}::${record.model}`;
    const bucket = stats.get(key) ?? {
      events: 0,
      successes: 0,
      grounded: [],
      confidence: [],
      latency: [],
      lowQualityEvents: 0,
      rejectionEvents: 0,
      hallucinationEvents: 0,
      retrievalMissEvents: 0,
    };
    bucket.events += 1;
    if (record.success) bucket.successes += 1;
    if (typeof safeNumber(record.groundednessScore) === 'number') bucket.grounded.push(Number(record.groundednessScore));
    if (typeof safeNumber(record.retrievalConfidence) === 'number') bucket.confidence.push(Number(record.retrievalConfidence));
    if (typeof safeNumber(record.latencyMs) === 'number') bucket.latency.push(Number(record.latencyMs));
    if (isLowQualityRecord(record)) bucket.lowQualityEvents += 1;
    if (record.rejected) bucket.rejectionEvents += 1;
    if (record.hallucinationFlag) bucket.hallucinationEvents += 1;
    if (record.retrievalMiss) bucket.retrievalMissEvents += 1;
    stats.set(key, bucket);
  }

  return [...candidates].sort((a, b) => {
    const aStats = stats.get(`${a.provider || 'unknown'}::${a.model || 'unknown'}`);
    const bStats = stats.get(`${b.provider || 'unknown'}::${b.model || 'unknown'}`);
    if (!aStats && !bStats) return 0;
    if (!aStats) return 1;
    if (!bStats) return -1;

    const scoreFor = (bucket: typeof aStats) => {
      const successRate = bucket.successes / Math.max(1, bucket.events);
      const groundedness = average(bucket.grounded);
      const confidence = average(bucket.confidence);
      const latency = average(bucket.latency);
      const lowQualityPenalty = safePercent(bucket.lowQualityEvents, bucket.events) * 0.22;
      const rejectionPenalty = safePercent(bucket.rejectionEvents, bucket.events) * 0.16;
      const hallucinationPenalty = safePercent(bucket.hallucinationEvents, bucket.events) * 0.25;
      const retrievalPenalty = safePercent(bucket.retrievalMissEvents, bucket.events) * 0.12;
      return (
        successRate * 62 +
        groundedness * 0.42 +
        confidence * 0.16 -
        Math.min(12, latency / 1100) +
        Math.min(8, bucket.events / 8) -
        lowQualityPenalty -
        rejectionPenalty -
        hallucinationPenalty -
        retrievalPenalty
      );
    };

    return scoreFor(bStats) - scoreFor(aStats);
  });
}
