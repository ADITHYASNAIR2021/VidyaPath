import type { MCQItem } from '@/lib/ai/validators';
import type { ContextSnippet } from '@/lib/ai/context-retriever';
import { logger } from '@/lib/logger';

const VERIFY_TIMEOUT_MS = 12_000;
const MIN_KEEP_RATIO = 0.6;

function buildVerifyPrompt(questions: MCQItem[], snippets: ContextSnippet[]): string {
  const contextText = snippets
    .slice(0, 4)
    .map((s) => s.text.slice(0, 380))
    .join('\n---\n');

  const questionsText = questions
    .map((q, i) => {
      const correctOption = String(q.options?.[q.answer] ?? '').slice(0, 120);
      return `Q${i + 1}: ${String(q.question).slice(0, 180)}\nMarked correct: "${correctOption}"`;
    })
    .join('\n\n');

  return `You are a CBSE subject expert. Based ONLY on the context below, determine if each marked answer is correct.

CONTEXT:
${contextText}

QUESTIONS AND MARKED ANSWERS:
${questionsText}

Reply ONLY with a JSON boolean array, one entry per question (true = correct, false = wrong):
[true, false, ...]
No explanation, no markdown, just the array.`;
}

function parseVerifyResponse(text: string, expectedCount: number): boolean[] | null {
  const match = text.trim().match(/\[([^\]]*)\]/);
  if (!match) return null;
  const parts = match[1]
    .split(',')
    .map((s) => s.trim().toLowerCase());
  if (parts.length !== expectedCount) return null;
  const results = parts.map((s) => s !== 'false' && s !== '0');
  return results;
}

export async function verifySelfCheck(
  questions: MCQItem[],
  snippets: ContextSnippet[]
): Promise<MCQItem[]> {
  if (process.env.AI_ENABLE_SELF_VERIFY !== '1') return questions;
  if (questions.length === 0) return questions;

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey || groqKey.length < 20) return questions;

  const batch = questions.slice(0, 15);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: buildVerifyPrompt(batch, snippets) }],
        temperature: 0,
        max_tokens: 120,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) return questions;

    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? '';
    const results = parseVerifyResponse(text, batch.length);
    if (!results) return questions;

    const batchFiltered = batch.filter((_, idx) => results[idx] !== false);
    const remainder = questions.slice(15);
    const filtered = [...batchFiltered, ...remainder];

    if (filtered.length < Math.ceil(questions.length * MIN_KEEP_RATIO)) {
      logger.warn(
        { kept: filtered.length, total: questions.length },
        '[question-verifier] too many rejections — skipping filter'
      );
      return questions;
    }

    const removed = questions.length - filtered.length;
    if (removed > 0) {
      logger.info({ removed, total: questions.length }, '[question-verifier] removed incorrect questions');
    }
    return filtered;
  } catch (error) {
    logger.warn({ err: error }, '[question-verifier] verification skipped');
    return questions;
  }
}
