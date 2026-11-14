import { BOARD_CHAPTERS, getChapterById } from '@/lib/data';
import { ALL_PAPERS } from '@/lib/papers';
import { getAiToolPolicy } from '@/lib/ai/tool-registry';
import { inspectAiPayload, recordBoundaryBlock } from '@/lib/ai/boundary-policy';

function subjectKey(subject: string, level: number): string {
  const value = subject.toLowerCase().trim();
  if (level === 10 && ['science', 'physics', 'chemistry', 'biology'].includes(value)) return 'science';
  if (value === 'mathematics') return 'math';
  return value;
}

/** Validate authority separately from shape: client titles/topics never become trusted metadata. */
export function applyAiRequestPolicy(pathname: string, value: unknown): { value: unknown; error?: string } {
  if (!getAiToolPolicy(pathname) || !value || typeof value !== 'object') return { value };
  const body = structuredClone(value) as Record<string, unknown>;
  const issue = inspectAiPayload(body);
  if (issue) {
    recordBoundaryBlock('request', issue);
    return { value, error: 'This request contains sensitive information or instructions that cannot be sent to an AI provider. Remove them and ask a curriculum question.' };
  }
  const nested = pathname === '/api/ai-tutor' && body.chapterContext && typeof body.chapterContext === 'object'
    ? body.chapterContext as Record<string, unknown> : body;
  let chapterId = typeof nested.chapterId === 'string' ? nested.chapterId : '';
  if (pathname === '/api/ai-tutor' && body.chapterContext && !chapterId) return { value, error: 'Select a known chapter; client-provided chapter titles and topics are not authoritative.' };
  if (!chapterId && ['/api/generate-quiz', '/api/generate-flashcards'].includes(pathname)) {
    // Legacy title-based clients may resolve a unique server chapter, never arbitrary metadata.
    const matches = BOARD_CHAPTERS.filter((chapter) => chapter.title.toLowerCase() === String(body.chapterTitle || '').toLowerCase()
      && chapter.classLevel === Number(body.classLevel)
      && subjectKey(chapter.subject, chapter.classLevel) === subjectKey(String(body.subject || ''), chapter.classLevel));
    if (matches.length === 1) chapterId = matches[0].id;
    else return { value, error: 'Select a valid chapter before generating study material.' };
  }
  if (chapterId) {
    const chapter = getChapterById(chapterId);
    if (!chapter || ![10, 12].includes(chapter.classLevel)) return { value, error: 'Unknown curriculum chapter. Select a listed Class 10 or Class 12 chapter.' };
    Object.assign(nested, { chapterId: chapter.id, classLevel: chapter.classLevel, subject: chapter.subject });
    if (pathname === '/api/ai-tutor') Object.assign(nested, { title: chapter.title, topics: chapter.topics });
    else Object.assign(body, { chapterTitle: chapter.title, chapterTopics: chapter.topics });
  }
  for (const key of ['chapterIds', 'weakChapterIds']) {
    if (!Array.isArray(body[key])) continue;
    const ids = [...new Set(body[key] as string[])];
    for (const id of ids) {
      const chapter = getChapterById(id);
      if (!chapter || chapter.classLevel !== Number(body.classLevel)
        || (body.subject && subjectKey(chapter.subject, chapter.classLevel) !== subjectKey(String(body.subject), chapter.classLevel))) {
        return { value, error: 'Selected chapters must exist and match the requested class and subject.' };
      }
    }
    body[key] = ids;
  }
  if (body.subject && [10, 12].includes(Number(body.classLevel))) {
    const subjects = BOARD_CHAPTERS.filter((chapter) => chapter.classLevel === Number(body.classLevel)).map((chapter) => subjectKey(chapter.subject, chapter.classLevel));
    if (!subjects.includes(subjectKey(String(body.subject), Number(body.classLevel)))) return { value, error: 'Choose a supported curriculum subject.' };
  }
  if (pathname === '/api/paper-evaluate') {
    const paper = ALL_PAPERS.find((item) => item.id === body.paperId);
    if (!paper) return { value, error: 'Select a known practice paper. Uploaded answer text alone is not an official marking scheme.' };
    Object.assign(body, { classLevel: paper.classLevel, subject: paper.subject });
  }
  if (pathname === '/api/context-pack' && !chapterId) return { value, error: 'A valid chapter ID is required for retrieval preview.' };
  return { value: body };
}
