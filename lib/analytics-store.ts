import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ALL_CHAPTERS } from '@/lib/data';
import { readStateFromSupabase, writeStateToSupabase } from '@/lib/persistence/supabase-state';

type CounterMap = Record<string, number>;
type CounterMapField =
  | 'chapterViews'
  | 'aiQuestionsByChapter'
  | 'searchNoResults'
  | 'uxPageLoadsByRoute'
  | 'uxPageLoadBuckets'
  | 'uxApiRequestsByEndpoint'
  | 'uxApiErrorsByEndpoint'
  | 'uxRouteDropoffsByRoute';

interface AnalyticsState {
  updatedAt: string;
  chapterViews: CounterMap;
  aiQuestionsByChapter: CounterMap;
  searchNoResults: CounterMap;
  uxPageLoadsByRoute: CounterMap;
  uxPageLoadBuckets: CounterMap;
  uxApiRequestsByEndpoint: CounterMap;
  uxApiErrorsByEndpoint: CounterMap;
  uxRouteDropoffsByRoute: CounterMap;
  uxPageLoadSamples: number;
  uxPageLoadTotalMs: number;
  uxSlowPageLoads: number;
}

const RUNTIME_DIR = path.join(process.cwd(), 'lib', 'runtime');
const ANALYTICS_PATH = path.join(RUNTIME_DIR, 'analytics.json');
const ANALYTICS_STATE_KEY = 'analytics_store_v1';

let memoryState: AnalyticsState = {
  updatedAt: new Date().toISOString(),
  chapterViews: {},
  aiQuestionsByChapter: {},
  searchNoResults: {},
  uxPageLoadsByRoute: {},
  uxPageLoadBuckets: {},
  uxApiRequestsByEndpoint: {},
  uxApiErrorsByEndpoint: {},
  uxRouteDropoffsByRoute: {},
  uxPageLoadSamples: 0,
  uxPageLoadTotalMs: 0,
  uxSlowPageLoads: 0,
};

function sanitizeKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\-_. /:]/g, '').trim().slice(0, 120);
}

async function readState(): Promise<AnalyticsState> {
  const remoteState = await readStateFromSupabase<AnalyticsState>(ANALYTICS_STATE_KEY);
  if (remoteState) {
    const normalized: AnalyticsState = {
      updatedAt: remoteState.updatedAt ?? new Date().toISOString(),
      chapterViews: remoteState.chapterViews ?? {},
      aiQuestionsByChapter: remoteState.aiQuestionsByChapter ?? {},
      searchNoResults: remoteState.searchNoResults ?? {},
      uxPageLoadsByRoute: remoteState.uxPageLoadsByRoute ?? {},
      uxPageLoadBuckets: remoteState.uxPageLoadBuckets ?? {},
      uxApiRequestsByEndpoint: remoteState.uxApiRequestsByEndpoint ?? {},
      uxApiErrorsByEndpoint: remoteState.uxApiErrorsByEndpoint ?? {},
      uxRouteDropoffsByRoute: remoteState.uxRouteDropoffsByRoute ?? {},
      uxPageLoadSamples: Number(remoteState.uxPageLoadSamples) || 0,
      uxPageLoadTotalMs: Number(remoteState.uxPageLoadTotalMs) || 0,
      uxSlowPageLoads: Number(remoteState.uxSlowPageLoads) || 0,
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
      uxPageLoadsByRoute: parsed.uxPageLoadsByRoute ?? {},
      uxPageLoadBuckets: parsed.uxPageLoadBuckets ?? {},
      uxApiRequestsByEndpoint: parsed.uxApiRequestsByEndpoint ?? {},
      uxApiErrorsByEndpoint: parsed.uxApiErrorsByEndpoint ?? {},
      uxRouteDropoffsByRoute: parsed.uxRouteDropoffsByRoute ?? {},
      uxPageLoadSamples: Number(parsed.uxPageLoadSamples) || 0,
      uxPageLoadTotalMs: Number(parsed.uxPageLoadTotalMs) || 0,
      uxSlowPageLoads: Number(parsed.uxSlowPageLoads) || 0,
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

async function increment(mapName: CounterMapField, key: string): Promise<void> {
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

export async function trackUxEvent(
  type: 'ux_api_request' | 'ux_api_error' | 'ux_route_dropoff',
  key: string
): Promise<void> {
  if (!key.trim()) return;
  if (type === 'ux_api_request') {
    await increment('uxApiRequestsByEndpoint', key);
    return;
  }
  if (type === 'ux_api_error') {
    await increment('uxApiErrorsByEndpoint', key);
    return;
  }
  await increment('uxRouteDropoffsByRoute', key);
}

export async function trackUxPageLoad(route: string, renderMs?: number, renderBucket?: string): Promise<void> {
  const cleanRoute = sanitizeKey(route);
  if (!cleanRoute) return;

  const normalizedMs = Number.isFinite(renderMs) ? Math.max(0, Math.round(renderMs as number)) : null;
  const cleanBucket = renderBucket ? sanitizeKey(renderBucket) : '';

  const state = await readState();
  const nextRoutes = { ...state.uxPageLoadsByRoute };
  nextRoutes[cleanRoute] = (nextRoutes[cleanRoute] ?? 0) + 1;

  const nextBuckets = { ...state.uxPageLoadBuckets };
  if (cleanBucket) {
    nextBuckets[cleanBucket] = (nextBuckets[cleanBucket] ?? 0) + 1;
  }

  await writeState({
    ...state,
    uxPageLoadsByRoute: nextRoutes,
    uxPageLoadBuckets: nextBuckets,
    uxPageLoadSamples: state.uxPageLoadSamples + (normalizedMs === null ? 0 : 1),
    uxPageLoadTotalMs: state.uxPageLoadTotalMs + (normalizedMs ?? 0),
    uxSlowPageLoads: state.uxSlowPageLoads + (normalizedMs !== null && normalizedMs >= 3000 ? 1 : 0),
    updatedAt: new Date().toISOString(),
  });
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
  topUxPageLoads: Array<{ route: string; count: number }>;
  topUxPageLoadBuckets: Array<{ bucket: string; count: number }>;
  topUxApiRequests: Array<{ endpoint: string; count: number }>;
  topUxApiErrors: Array<{ endpoint: string; count: number }>;
  topUxRouteDropoffs: Array<{ route: string; count: number }>;
  pageLoadSamples: number;
  avgUxPageLoadMs: number;
  slowUxPageLoads: number;
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
    topUxPageLoads: topEntries(state.uxPageLoadsByRoute, limit).map((item) => ({
      route: item.key,
      count: item.count,
    })),
    topUxPageLoadBuckets: topEntries(state.uxPageLoadBuckets, limit).map((item) => ({
      bucket: item.key,
      count: item.count,
    })),
    topUxApiRequests: topEntries(state.uxApiRequestsByEndpoint, limit).map((item) => ({
      endpoint: item.key,
      count: item.count,
    })),
    topUxApiErrors: topEntries(state.uxApiErrorsByEndpoint, limit).map((item) => ({
      endpoint: item.key,
      count: item.count,
    })),
    topUxRouteDropoffs: topEntries(state.uxRouteDropoffsByRoute, limit).map((item) => ({
      route: item.key,
      count: item.count,
    })),
    pageLoadSamples: state.uxPageLoadSamples,
    avgUxPageLoadMs:
      state.uxPageLoadSamples > 0 ? Math.round((state.uxPageLoadTotalMs / state.uxPageLoadSamples) * 100) / 100 : 0,
    slowUxPageLoads: state.uxSlowPageLoads,
  };
}
