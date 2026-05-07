import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { readStateFromSupabase, writeStateToSupabase } from '@/lib/persistence/supabase-state';

export interface RecoveryCheckpoint {
  id: string;
  createdAt: string;
  createdBy?: string;
  note?: string;
  summary?: Record<string, unknown>;
}

export interface DataCorrectionItem {
  id: string;
  createdAt: string;
  status: 'open' | 'in_progress' | 'resolved';
  title: string;
  description: string;
  owner?: string;
  note?: string;
  updatedAt: string;
}

export interface SchoolRecoveryState {
  updatedAt: string;
  checkpoints: RecoveryCheckpoint[];
  corrections: DataCorrectionItem[];
}

const STATE_PREFIX = 'admin_recovery_v1';
const RUNTIME_DIR = path.join(process.cwd(), 'lib', 'runtime');
const STATE_PATH = path.join(RUNTIME_DIR, 'admin-recovery-state.json');
const MAX_CHECKPOINTS = 80;
const MAX_CORRECTIONS = 300;

let memoryState: Record<string, SchoolRecoveryState> = {};

function sanitizeText(value: string, max = 280): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function stateKey(schoolId: string): string {
  return `${STATE_PREFIX}:${sanitizeText(schoolId, 120)}`;
}

function normalizeCorrection(value: unknown): DataCorrectionItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<DataCorrectionItem>;
  const id = typeof item.id === 'string' ? sanitizeText(item.id, 120) : '';
  const title = typeof item.title === 'string' ? sanitizeText(item.title, 140) : '';
  const description = typeof item.description === 'string' ? sanitizeText(item.description, 1000) : '';
  const status = item.status === 'in_progress' || item.status === 'resolved' ? item.status : 'open';
  if (!id || !title || !description) return null;
  return {
    id,
    title,
    description,
    status,
    owner: typeof item.owner === 'string' ? sanitizeText(item.owner, 120) : undefined,
    note: typeof item.note === 'string' ? sanitizeText(item.note, 1000) : undefined,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
  };
}

function normalizeCheckpoint(value: unknown): RecoveryCheckpoint | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<RecoveryCheckpoint>;
  const id = typeof item.id === 'string' ? sanitizeText(item.id, 120) : '';
  if (!id) return null;
  return {
    id,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    createdBy: typeof item.createdBy === 'string' ? sanitizeText(item.createdBy, 120) : undefined,
    note: typeof item.note === 'string' ? sanitizeText(item.note, 500) : undefined,
    summary: item.summary && typeof item.summary === 'object' ? item.summary as Record<string, unknown> : undefined,
  };
}

function normalizeState(value: unknown): SchoolRecoveryState {
  if (!value || typeof value !== 'object') {
    return {
      updatedAt: new Date().toISOString(),
      checkpoints: [],
      corrections: [],
    };
  }
  const state = value as Partial<SchoolRecoveryState>;
  return {
    updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : new Date().toISOString(),
    checkpoints: Array.isArray(state.checkpoints)
      ? state.checkpoints.map((item) => normalizeCheckpoint(item)).filter((item): item is RecoveryCheckpoint => item !== null).slice(0, MAX_CHECKPOINTS)
      : [],
    corrections: Array.isArray(state.corrections)
      ? state.corrections.map((item) => normalizeCorrection(item)).filter((item): item is DataCorrectionItem => item !== null).slice(0, MAX_CORRECTIONS)
      : [],
  };
}

async function readLocalMap(): Promise<Record<string, SchoolRecoveryState>> {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, SchoolRecoveryState>;
    if (!parsed || typeof parsed !== 'object') return {};
    const normalized: Record<string, SchoolRecoveryState> = {};
    for (const [key, value] of Object.entries(parsed)) {
      normalized[key] = normalizeState(value);
    }
    return normalized;
  } catch {
    return memoryState;
  }
}

async function writeLocalMap(state: Record<string, SchoolRecoveryState>): Promise<void> {
  memoryState = state;
  try {
    await fs.mkdir(RUNTIME_DIR, { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // ignore local write failures
  }
}

export async function getRecoveryState(schoolId: string): Promise<SchoolRecoveryState> {
  const key = stateKey(schoolId);
  const remote = await readStateFromSupabase<SchoolRecoveryState>(key);
  if (remote) return normalizeState(remote);
  const localMap = await readLocalMap();
  return localMap[key] ? normalizeState(localMap[key]) : { updatedAt: new Date().toISOString(), checkpoints: [], corrections: [] };
}

async function saveRecoveryState(schoolId: string, state: SchoolRecoveryState): Promise<SchoolRecoveryState> {
  const key = stateKey(schoolId);
  const nextState = normalizeState(state);
  const remoteOk = await writeStateToSupabase(key, nextState);
  if (!remoteOk) {
    const localMap = await readLocalMap();
    localMap[key] = nextState;
    await writeLocalMap(localMap);
  }
  return nextState;
}

export async function createRecoveryCheckpoint(input: {
  schoolId: string;
  createdBy?: string;
  note?: string;
  summary?: Record<string, unknown>;
}): Promise<SchoolRecoveryState> {
  const current = await getRecoveryState(input.schoolId);
  const checkpoint: RecoveryCheckpoint = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ? sanitizeText(input.createdBy, 120) : undefined,
    note: input.note ? sanitizeText(input.note, 500) : undefined,
    summary: input.summary,
  };

  const next: SchoolRecoveryState = {
    updatedAt: new Date().toISOString(),
    checkpoints: [checkpoint, ...current.checkpoints].slice(0, MAX_CHECKPOINTS),
    corrections: current.corrections,
  };

  return saveRecoveryState(input.schoolId, next);
}

export async function createDataCorrection(input: {
  schoolId: string;
  title: string;
  description: string;
  owner?: string;
  note?: string;
}): Promise<SchoolRecoveryState> {
  const current = await getRecoveryState(input.schoolId);
  const correction: DataCorrectionItem = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'open',
    title: sanitizeText(input.title, 140),
    description: sanitizeText(input.description, 1000),
    owner: input.owner ? sanitizeText(input.owner, 120) : undefined,
    note: input.note ? sanitizeText(input.note, 1000) : undefined,
  };

  const next: SchoolRecoveryState = {
    updatedAt: new Date().toISOString(),
    checkpoints: current.checkpoints,
    corrections: [correction, ...current.corrections].slice(0, MAX_CORRECTIONS),
  };

  return saveRecoveryState(input.schoolId, next);
}

export async function updateDataCorrection(input: {
  schoolId: string;
  correctionId: string;
  status?: DataCorrectionItem['status'];
  owner?: string;
  note?: string;
}): Promise<DataCorrectionItem | null> {
  const current = await getRecoveryState(input.schoolId);
  const targetId = sanitizeText(input.correctionId, 120);
  const index = current.corrections.findIndex((item) => item.id === targetId);
  if (index < 0) return null;

  const existing = current.corrections[index];
  const nextItem: DataCorrectionItem = {
    ...existing,
    status: input.status ?? existing.status,
    owner: typeof input.owner === 'string' ? sanitizeText(input.owner, 120) : existing.owner,
    note: typeof input.note === 'string' ? sanitizeText(input.note, 1000) : existing.note,
    updatedAt: new Date().toISOString(),
  };

  const nextCorrections = [...current.corrections];
  nextCorrections[index] = nextItem;
  await saveRecoveryState(input.schoolId, {
    updatedAt: new Date().toISOString(),
    checkpoints: current.checkpoints,
    corrections: nextCorrections,
  });

  return nextItem;
}
