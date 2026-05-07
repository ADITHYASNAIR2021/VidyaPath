import type { FlashcardItem, MCQItem } from '@/lib/ai/validators';

// These interfaces are retained so any external callers continue to type-check.
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

/**
 * Returns an empty array — quiz generation no longer uses a template fallback.
 * Real questions come from the AI using retrieved NCERT context.
 * Retained for call-site compatibility only.
 */
export function buildDynamicQuizFallback(_input: DynamicQuizInput): MCQItem[] {
  return [];
}

/**
 * Returns an empty array — flashcard generation no longer uses a template fallback.
 * Real cards come from the AI using retrieved NCERT context.
 * Retained for call-site compatibility only.
 */
export function buildDynamicFlashcardFallback(_input: BaseDynamicInput, _cardCount = 5): FlashcardItem[] {
  return [];
}
