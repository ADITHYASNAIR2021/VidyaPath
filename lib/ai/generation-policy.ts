import { getChapterById } from '@/lib/data';
import type { ContextSnippet, ContextTask } from '@/lib/ai/context-retriever';
import { inspectAiPayload, inspectAiText, recordBoundaryBlock, UNTRUSTED_DATA_RULES } from '@/lib/ai/boundary-policy';

export function requiresGrounding(task: ContextTask): boolean { return task !== 'revision-plan'; }

export function prepareGenerationRequest<T extends {
  task: ContextTask; systemPrompt: string; userPrompt: string;
  contextSnippets: ContextSnippet[]; messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}>(options: T): T {
  const inputIssue = inspectAiPayload([options.userPrompt, options.messages ?? []]);
  if (inputIssue) { recordBoundaryBlock('request', inputIssue); throw new Error('AI request rejected by input policy.'); }
  let remaining = Math.max(4000, Math.min(24000, Number(process.env.AI_CONTEXT_CHAR_BUDGET) || 24000));
  const snippets = options.contextSnippets.filter((snippet) => {
    const issue = inspectAiText(`${snippet.sourcePath}\n${snippet.text}`, 'retrieval');
    if (issue) recordBoundaryBlock('retrieval', issue);
    const size = snippet.text.length + snippet.sourcePath.length + 400;
    if (issue || size > remaining) return false;
    remaining -= size;
    return true;
  });
  if (requiresGrounding(options.task) && snippets.length === 0) {
    throw new Error('Grounded generation unavailable: no safe chapter evidence was retrieved.');
  }
  return { ...options, contextSnippets: snippets, systemPrompt: options.systemPrompt.includes(UNTRUSTED_DATA_RULES) ? options.systemPrompt : `${UNTRUSTED_DATA_RULES}\n\n${options.systemPrompt}` };
}

export function assertSafeGeneratedOutput(value: unknown, snippets: ContextSnippet[] = []): void {
  const issue = inspectAiPayload(value, 'output');
  if (issue) { recordBoundaryBlock('output', issue); throw new Error('AI output rejected by safety policy.'); }
  const allowedPaths = new Set(snippets.map((snippet) => snippet.sourcePath));
  const visit = (item: unknown, key = ''): void => {
    if (typeof item === 'string') {
      for (const match of item.matchAll(/\[S(\d+)\]/g)) {
        const index = Number(match[1]);
        if (index < 1 || index > snippets.length) throw new Error('AI output contains an unknown source ID.');
      }
      if ((key === 'chapterId' || key === 'focusChapters' || key === 'recommendedChapters') && !getChapterById(item)) throw new Error('AI output contains an unknown chapter ID.');
      if (key === 'sourcePath' && !allowedPaths.has(item)) throw new Error('AI output contains an unverified source path.');
    } else if (Array.isArray(item)) item.forEach((entry) => visit(entry, key));
    else if (item && typeof item === 'object') Object.entries(item).forEach(([name, entry]) => visit(entry, name));
  };
  visit(value);
}
