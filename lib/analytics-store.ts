import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ALL_CHAPTERS } from '@/lib/data';
import { readStateFromSupabase, writeStateToSupabase } from '@/lib/persistence/supabase-state';

type CounterMap = Record<string, number>;

interface AnalyticsState {
  updatedAt: string;
  chapterViews: CounterMap;
  aiQuestionsByChapter: CounterMap;
  searchNoResults: CounterMap;
}

const RUNTIME_DIR = path.join(process.cwd(), 'lib', 'runtime');
const ANALYTICS_PATH = path.join(RUNTIME_DIR, 'analytics.json');
const ANALYTICS_STATE_KEY = 'analytics_store_v1';

let memoryState: AnalyticsState = {
  updatedAt: new Date().toISOString(),
  chapterViews: {},
  aiQuestionsByChapter: {},
  searchNoResults: {},
};

function sanitizeKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\-_. ]/g, '').trim().slice(0, 120);
}

async function readState(): Promise<AnalyticsState> {
  const remoteState = await readStateFromSupabase<AnalyticsState>(ANALYTICS_STATE_KEY);
  if (remoteState) {
    const normalized: AnalyticsState = {
      updatedAt: remoteState.updatedAt ?? new Date().toISOString(),
      chapterViews: remoteState.chapterViews ?? {},
      aiQuestionsByChapter: remoteState.aiQuestionsByChapter ?? {},
      searchNoResults: remoteState.searchNoResults ?? {},
    };
    memoryState = normalized;
    return normalized;
  }

  try {
    const raw = await fs.readFile(ANALYTICS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as AnalyticsState;
    return {
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      chapterViews: parsed.chapterViews ?? {},
      aiQuestionsByChapter: parsed.aiQuestionsByChapter ?? {},
      searchNoResults: parsed.searchNoResults ?? {},
    };
  } catch {
    return memoryState;
  }
}

async function writeState(state: AnalyticsState): Promise<void> {
  memoryState = state;
  const remoteOk = await writeStateToSupabase(ANALYTICS_STATE_KEY, state);
  if (remoteOk) return;

  try {
    await fs.mkdir(RUNTIME_DIR, { recursive: true });
    await fs.writeFile(ANALYTICS_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Ignore write failures in restricted environments; memory fallback is retained.
  }
}

async function increment(mapName: keyof Omit<AnalyticsState, 'updatedAt'>, key: string): Promise<void> {
  const cleanKey = sanitizeKey(key);
  if (!cleanKey) return;
  const state = await readState();
  const nextMap = { ...state[mapName] };
  nextMap[cleanKey] = (nextMap[cleanKey] ?? 0) + 1;
  await writeState({
    ...state,
    [mapName]: nextMap,
    updatedAt: new Date().toISOString(),
  });
}

export async function trackChapterView(chapterId: string): Promise<void> {
  await increment('chapterViews', chapterId);
}

export async function trackAiQuestion(chapterId?: string): Promise<void> {
  if (!chapterId) return;
  await increment('aiQuestionsByChapter', chapterId);
}

export async function trackSearchNoResult(query: string): Promise<void> {
  if (!query.trim()) return;
  await increment('searchNoResults', query);
}

function topEntries(map: CounterMap, limit = 10): Array<{ key: string; count: number }> {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function getAnalyticsSummary(limit = 10): Promise<{
  updatedAt: string;
  topChapterViews: Array<{ chapterId: string; chapterTitle: string; count: number }>;
  topAiChapters: Array<{ chapterId: string; chapterTitle: string; count: number }>;
  topSearchNoResults: Array<{ query: string; count: number }>;
}> {
  const state = await readState();
  const chapterLookup = new Map(ALL_CHAPTERS.map((chapter) => [chapter.id, chapter.title]));

  return {
    updatedAt: state.updatedAt,
    topChapterViews: topEntries(state.chapterViews, limit).map((item) => ({
      chapterId: item.key,
      chapterTitle: chapterLookup.get(item.key) ?? item.key,
      count: item.count,
    })),
    topAiChapters: topEntries(state.aiQuestionsByChapter, limit).map((item) => ({
      chapterId: item.key,
      chapterTitle: chapterLookup.get(item.key) ?? item.key,
      count: item.count,
    })),
    topSearchNoResults: topEntries(state.searchNoResults, limit).map((item) => ({
      query: item.key,
      count: item.count,
    })),
  };
}
