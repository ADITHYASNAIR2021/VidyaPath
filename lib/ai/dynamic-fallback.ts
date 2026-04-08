import type { FlashcardItem, MCQItem } from '@/lib/ai/validators';

interface BaseDynamicInput {
  chapterTitle: string;
  subject: string;
  chapterTopics: string[];
  pyqTopics?: string[];
  seedText: string;
}

interface DynamicQuizInput extends BaseDynamicInput {
  questionCount: number;
  difficulty?: string;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (seed + i * 17) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const clean = item.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function pickTopic(pool: string[], index: number, seed: number): string {
  if (pool.length === 0) return 'core concept';
  return pool[(index + seed) % pool.length];
}

function buildDistractors(topic: string, topicPool: string[], seed: number): string[] {
  const otherTopics = unique(topicPool.filter((item) => item.toLowerCase() !== topic.toLowerCase()));
  const picks = shuffle(otherTopics, seed).slice(0, 3);
  if (picks.length >= 3) return picks;
  const fillers = [
    'a statement that ignores NCERT conditions',
    'an option with unit/sign mismatch',
    'a partially correct but incomplete statement',
  ];
  return [...picks, ...fillers].slice(0, 3);
}

export function buildDynamicQuizFallback(input: DynamicQuizInput): MCQItem[] {
  const seed = hashString(`${input.seedText}|${input.chapterTitle}|${input.subject}|${input.questionCount}`);
  const topicPool = unique([...(input.pyqTopics ?? []), ...input.chapterTopics]);
  const stems = [
    'Which statement is most accurate for',
    'In a board-exam context, what best explains',
    'A student confuses a key rule in',
    'Select the correct application of',
    'What is the most scoring interpretation of',
  ];
  const requested = Math.max(3, Math.min(20, input.questionCount));
  const items: MCQItem[] = [];

  for (let i = 0; i < requested; i++) {
    const topic = pickTopic(topicPool, i, seed);
    const stem = stems[(seed + i) % stems.length];
    const correct = `${topic} should be answered using the exact NCERT rule with condition checks.`;
    const distractors = buildDistractors(topic, topicPool, seed + i * 11).map(
      (item) => `${item} as the primary answer strategy.`
    );
    const options = shuffle([correct, ...distractors], seed + i * 31).slice(0, 4);
    const answer = Math.max(0, options.findIndex((option) => option === correct));
    const difficultyHint = input.difficulty ? ` (${input.difficulty})` : '';

    items.push({
      question: `${stem} "${topic}" in ${input.chapterTitle}${difficultyHint}?`,
      options,
      answer,
      explanation: `Focus on ${topic} with definition, condition, and final conclusion format used in CBSE marking.`,
    });
  }

  return items;
}

export function buildDynamicFlashcardFallback(input: BaseDynamicInput, cardCount = 5): FlashcardItem[] {
  const seed = hashString(`${input.seedText}|${input.chapterTitle}|flashcards|${cardCount}`);
  const topicPool = unique([...(input.pyqTopics ?? []), ...input.chapterTopics]);
  const prompts = [
    'Define',
    'State one exam-useful point for',
    'Write a quick revision note on',
    'What mistake should be avoided in',
    'How is this tested in boards:',
  ];

  return Array.from({ length: Math.max(3, Math.min(10, cardCount)) }).map((_, i) => {
    const topic = pickTopic(topicPool, i, seed);
    const prompt = prompts[(seed + i * 3) % prompts.length];
    return {
      front: `${prompt} ${topic}.`,
      back: `${topic} in ${input.chapterTitle}: write the core rule, one board-style application, and one common pitfall to avoid.`,
    };
  });
}
