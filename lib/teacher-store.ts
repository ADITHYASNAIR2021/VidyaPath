import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getAnalyticsSummary } from '@/lib/analytics-store';

interface TeacherAnnouncement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

interface TeacherStoreState {
  updatedAt: string;
  importantTopics: Record<string, string[]>;
  quizLinks: Record<string, string>;
  announcements: TeacherAnnouncement[];
}

export interface PublicTeacherConfig {
  updatedAt: string;
  importantTopics: Record<string, string[]>;
  quizLinks: Record<string, string>;
  announcements: TeacherAnnouncement[];
}

const RUNTIME_DIR = path.join(process.cwd(), 'lib', 'runtime');
const TEACHER_STORE_PATH = path.join(RUNTIME_DIR, 'teacher-config.json');

let memoryState: TeacherStoreState = {
  updatedAt: new Date().toISOString(),
  importantTopics: {},
  quizLinks: {},
  announcements: [],
};

function sanitizeText(value: string, max = 220): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeTopicList(items: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const clean = sanitizeText(item, 120);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= 12) break;
  }
  return output;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function readState(): Promise<TeacherStoreState> {
  try {
    const raw = await fs.readFile(TEACHER_STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as TeacherStoreState;
    return {
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      importantTopics: parsed.importantTopics ?? {},
      quizLinks: parsed.quizLinks ?? {},
      announcements: Array.isArray(parsed.announcements) ? parsed.announcements : [],
    };
  } catch {
    return memoryState;
  }
}

async function writeState(state: TeacherStoreState): Promise<void> {
  memoryState = state;
  try {
    await fs.mkdir(RUNTIME_DIR, { recursive: true });
    await fs.writeFile(TEACHER_STORE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // ignore write issues in locked environments; memory fallback remains active
  }
}

function toPublicConfig(state: TeacherStoreState): PublicTeacherConfig {
  return {
    updatedAt: state.updatedAt,
    importantTopics: state.importantTopics,
    quizLinks: state.quizLinks,
    announcements: state.announcements.slice(0, 12),
  };
}

export async function getPublicTeacherConfig(): Promise<PublicTeacherConfig> {
  const state = await readState();
  return toPublicConfig(state);
}

export async function getPrivateTeacherConfig(): Promise<PublicTeacherConfig & { analytics: Awaited<ReturnType<typeof getAnalyticsSummary>> }> {
  const state = await readState();
  const analytics = await getAnalyticsSummary(12);
  return {
    ...toPublicConfig(state),
    analytics,
  };
}

export async function setImportantTopics(chapterId: string, topics: string[]): Promise<PublicTeacherConfig> {
  const state = await readState();
  const cleanTopics = sanitizeTopicList(topics);
  const nextImportantTopics = { ...state.importantTopics };
  if (cleanTopics.length === 0) {
    delete nextImportantTopics[chapterId];
  } else {
    nextImportantTopics[chapterId] = cleanTopics;
  }
  const nextState: TeacherStoreState = {
    ...state,
    importantTopics: nextImportantTopics,
    updatedAt: new Date().toISOString(),
  };
  await writeState(nextState);
  return toPublicConfig(nextState);
}

export async function setQuizLink(chapterId: string, url: string): Promise<PublicTeacherConfig> {
  const cleanUrl = sanitizeText(url, 500);
  if (cleanUrl && !isValidHttpUrl(cleanUrl)) {
    throw new Error('Quiz link must be a valid http/https URL.');
  }

  const state = await readState();
  const nextQuizLinks = { ...state.quizLinks };
  if (!cleanUrl) {
    delete nextQuizLinks[chapterId];
  } else {
    nextQuizLinks[chapterId] = cleanUrl;
  }

  const nextState: TeacherStoreState = {
    ...state,
    quizLinks: nextQuizLinks,
    updatedAt: new Date().toISOString(),
  };
  await writeState(nextState);
  return toPublicConfig(nextState);
}

export async function addAnnouncement(title: string, body: string): Promise<PublicTeacherConfig> {
  const cleanTitle = sanitizeText(title, 120);
  const cleanBody = sanitizeText(body, 700);
  if (!cleanTitle || !cleanBody) {
    throw new Error('Announcement title and body are required.');
  }
  const state = await readState();
  const announcement: TeacherAnnouncement = {
    id: `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: cleanTitle,
    body: cleanBody,
    createdAt: new Date().toISOString(),
  };
  const nextState: TeacherStoreState = {
    ...state,
    announcements: [announcement, ...state.announcements].slice(0, 30),
    updatedAt: new Date().toISOString(),
  };
  await writeState(nextState);
  return toPublicConfig(nextState);
}

export async function removeAnnouncement(id: string): Promise<PublicTeacherConfig> {
  const state = await readState();
  const nextState: TeacherStoreState = {
    ...state,
    announcements: state.announcements.filter((item) => item.id !== id),
    updatedAt: new Date().toISOString(),
  };
  await writeState(nextState);
  return toPublicConfig(nextState);
}

export function isValidTeacherKey(key?: string): boolean {
  if (!key) return false;
  const configuredKey = process.env.TEACHER_PORTAL_KEY?.trim();
  if (!configuredKey) return false;
  return key.trim() === configuredKey;
}
