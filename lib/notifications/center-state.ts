import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readStateFromSupabase, writeStateToSupabase } from '@/lib/persistence/supabase-state';

export interface NotificationChannelPreferences {
  dashboard: boolean;
  webPush: boolean;
  email: boolean;
}

export interface NotificationCenterState {
  updatedAt: string;
  readIds: string[];
  channelPreferences: NotificationChannelPreferences;
}

export interface NotificationActor {
  role: 'student' | 'teacher' | 'admin' | 'developer' | 'parent';
  scopeId: string;
  schoolId?: string;
}

const DEFAULT_PREFERENCES: NotificationChannelPreferences = {
  dashboard: true,
  webPush: true,
  email: true,
};

const DEFAULT_STATE: NotificationCenterState = {
  updatedAt: new Date().toISOString(),
  readIds: [],
  channelPreferences: DEFAULT_PREFERENCES,
};

const RUNTIME_DIR = path.join(process.cwd(), 'lib', 'runtime');
const STATE_PATH = path.join(RUNTIME_DIR, 'notification-center-state.json');
const STATE_PREFIX = 'notification_center_v1';
const MAX_READ_IDS = 600;

type RuntimeStateMap = Record<string, NotificationCenterState>;

let memoryState: RuntimeStateMap = {};

function sanitizeText(value: string, max = 140): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function makeKey(actor: NotificationActor): string {
  const role = sanitizeText(actor.role, 20).toLowerCase();
  const scopeId = sanitizeText(actor.scopeId, 140).toLowerCase();
  const schoolId = sanitizeText(actor.schoolId || '', 120).toLowerCase();
  return schoolId ? `${STATE_PREFIX}:${role}:${schoolId}:${scopeId}` : `${STATE_PREFIX}:${role}:${scopeId}`;
}

function normalizeState(value: unknown): NotificationCenterState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_STATE, channelPreferences: { ...DEFAULT_PREFERENCES } };
  const state = value as Partial<NotificationCenterState>;
  const readIds = Array.isArray(state.readIds)
    ? state.readIds
      .map((entry) => sanitizeText(String(entry), 200))
      .filter((entry) => entry.length > 0)
      .slice(0, MAX_READ_IDS)
    : [];
  const prefs: Partial<NotificationChannelPreferences> = state.channelPreferences ?? {};
  return {
    updatedAt: typeof state.updatedAt === 'string' && state.updatedAt.trim() ? state.updatedAt : new Date().toISOString(),
    readIds,
    channelPreferences: {
      dashboard: prefs.dashboard ?? DEFAULT_PREFERENCES.dashboard,
      webPush: prefs.webPush ?? DEFAULT_PREFERENCES.webPush,
      email: prefs.email ?? DEFAULT_PREFERENCES.email,
    },
  };
}

async function readLocalMap(): Promise<RuntimeStateMap> {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as RuntimeStateMap;
    if (!parsed || typeof parsed !== 'object') return {};
    const normalized: RuntimeStateMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      normalized[key] = normalizeState(value);
    }
    return normalized;
  } catch {
    return memoryState;
  }
}

async function writeLocalMap(state: RuntimeStateMap): Promise<void> {
  memoryState = state;
  try {
    await fs.mkdir(RUNTIME_DIR, { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // ignore local write errors in restricted environments
  }
}

export async function getNotificationCenterState(actor: NotificationActor): Promise<NotificationCenterState> {
  const stateKey = makeKey(actor);
  const remote = await readStateFromSupabase<NotificationCenterState>(stateKey);
  if (remote) return normalizeState(remote);

  const localMap = await readLocalMap();
  const current = localMap[stateKey];
  return current ? normalizeState(current) : { ...DEFAULT_STATE, channelPreferences: { ...DEFAULT_PREFERENCES } };
}

export async function patchNotificationCenterState(
  actor: NotificationActor,
  patch: {
    markReadIds?: string[];
    markUnreadIds?: string[];
    setAllReadIds?: string[];
    channelPreferences?: Partial<NotificationChannelPreferences>;
  }
): Promise<NotificationCenterState> {
  const stateKey = makeKey(actor);
  const current = await getNotificationCenterState(actor);
  const nextReadSet = new Set(current.readIds);

  if (Array.isArray(patch.setAllReadIds)) {
    nextReadSet.clear();
    for (const item of patch.setAllReadIds) {
      const clean = sanitizeText(String(item), 200);
      if (clean) nextReadSet.add(clean);
    }
  }

  if (Array.isArray(patch.markReadIds)) {
    for (const item of patch.markReadIds) {
      const clean = sanitizeText(String(item), 200);
      if (clean) nextReadSet.add(clean);
    }
  }

  if (Array.isArray(patch.markUnreadIds)) {
    for (const item of patch.markUnreadIds) {
      const clean = sanitizeText(String(item), 200);
      if (clean) nextReadSet.delete(clean);
    }
  }

  const next: NotificationCenterState = {
    updatedAt: new Date().toISOString(),
    readIds: [...nextReadSet].slice(0, MAX_READ_IDS),
    channelPreferences: {
      dashboard: patch.channelPreferences?.dashboard ?? current.channelPreferences.dashboard,
      webPush: patch.channelPreferences?.webPush ?? current.channelPreferences.webPush,
      email: patch.channelPreferences?.email ?? current.channelPreferences.email,
    },
  };

  const remoteOk = await writeStateToSupabase(stateKey, next);
  if (!remoteOk) {
    const localMap = await readLocalMap();
    localMap[stateKey] = next;
    await writeLocalMap(localMap);
  }

  return next;
}
