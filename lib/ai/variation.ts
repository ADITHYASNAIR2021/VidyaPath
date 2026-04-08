import type { ContextTask } from '@/lib/ai/context-retriever';

const VARIETY_ANGLES = [
  'board-marking clarity',
  'real-life application',
  'common mistake correction',
  'step-by-step reasoning',
  'assertion-reason style',
  'mixed conceptual + numerical',
] as const;

const QUESTION_STYLES = [
  'direct concept check',
  'case-based classroom scenario',
  'elimination-heavy MCQ',
  'formula-application short numeric',
  'trap-aware board pattern',
] as const;

const EXPLANATION_STYLES = [
  'one-line exam key',
  'two-step reasoning',
  'why-not-other-options',
  'mistake-to-avoid callout',
] as const;

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(items: readonly T[], seed: number, offset: number): T {
  const index = (seed + offset) % items.length;
  return items[index];
}

export interface VariationProfile {
  angle: string;
  questionStyle: string;
  explanationStyle: string;
  diversityKey: string;
}

function buildTimeBucket(): string {
  const now = new Date();
  return now.toISOString().slice(0, 13); // hourly bucket for fresh variants
}

export function buildVariationProfile(options: {
  task: ContextTask;
  contextHash: string;
  chapterId?: string;
  difficulty?: string;
}): VariationProfile {
  const bucket = buildTimeBucket();
  const base = `${options.task}|${options.contextHash}|${options.chapterId ?? 'na'}|${options.difficulty ?? 'mixed'}|${bucket}`;
  const seed = hashString(base);

  return {
    angle: pick(VARIETY_ANGLES, seed, 1),
    questionStyle: pick(QUESTION_STYLES, seed, 7),
    explanationStyle: pick(EXPLANATION_STYLES, seed, 13),
    diversityKey: `${options.task}:${options.chapterId ?? 'na'}:${bucket}`,
  };
}

export function buildVariationInstruction(profile: VariationProfile): string {
  return [
    `Variation target: ${profile.angle}.`,
    `Question framing: ${profile.questionStyle}.`,
    `Explanation style: ${profile.explanationStyle}.`,
    'Generate fresh wording and option sets; avoid repeating exact previous phrasing.',
  ].join(' ');
}
