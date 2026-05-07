import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readStateFromSupabase, writeStateToSupabase } from '@/lib/persistence/supabase-state';

type InterventionPriority = 'high' | 'medium';
type InterventionStatus = 'open' | 'resolved' | 'snoozed';

export interface AdminInterventionItem {
  id: string;
  schoolId: string;
  queueId: string;
  priority: InterventionPriority;
  title: string;
  description: string;
  riskReason: string;
  href: string;
  owner?: string;
  note?: string;
  status: InterventionStatus;
  snoozeUntil?: string;
  createdAt: string;
  updatedAt: string;
}

interface InterventionState {
  updatedAt: string;
  interventions: AdminInterventionItem[];
}

const STATE_KEY = 'admin_interventions_v1';
const RUNTIME_DIR = path.join(process.cwd(), 'lib', 'runtime');
const STATE_PATH = path.join(RUNTIME_DIR, 'admin-interventions.json');
const MAX_ITEMS = 5000;

let memoryState: InterventionState = {
  updatedAt: new Date().toISOString(),
  interventions: [],
};

function sanitizeText(value: string, max = 240): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

async function readState(): Promise<InterventionState> {
  const remote = await readStateFromSupabase<InterventionState>(STATE_KEY);
  if (remote) {
    const normalized: InterventionState = {
      updatedAt: remote.updatedAt ?? new Date().toISOString(),
      interventions: Array.isArray(remote.interventions) ? remote.interventions : [],
    };
    memoryState = normalized;
    return normalized;
  }
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as InterventionState;
    const normalized: InterventionState = {
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      interventions: Array.isArray(parsed.interventions) ? parsed.interventions : [],
    };
    memoryState = normalized;
    return normalized;
  } catch {
    return memoryState;
  }
}

async function writeState(state: InterventionState): Promise<void> {
  memoryState = state;
  const remoteOk = await writeStateToSupabase(STATE_KEY, state);
  if (remoteOk) return;
  try {
    await fs.mkdir(RUNTIME_DIR, { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Ignore local write failures in restricted environments.
  }
}

export async function listAdminInterventions(schoolId: string): Promise<AdminInterventionItem[]> {
  const cleanSchoolId = sanitizeText(schoolId, 120);
  if (!cleanSchoolId) return [];
  const state = await readState();
  const nowMs = Date.now();
  return state.interventions
    .filter((item) => item.schoolId === cleanSchoolId)
    .filter((item) => {
      if (item.status !== 'snoozed') return true;
      const snoozeUntilMs = Date.parse(item.snoozeUntil || '');
      return !Number.isFinite(snoozeUntilMs) || snoozeUntilMs <= nowMs;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function syncAdminQueueInterventions(
  schoolId: string,
  queue: Array<{
    id: string;
    priority: InterventionPriority;
    title: string;
    description: string;
    href: string;
    riskReason?: string;
  }>
): Promise<AdminInterventionItem[]> {
  const cleanSchoolId = sanitizeText(schoolId, 120);
  if (!cleanSchoolId) return [];
  const state = await readState();
  const now = new Date().toISOString();
  const interventions = [...state.interventions];

  for (const queueItem of queue) {
    const queueId = sanitizeText(queueItem.id, 120);
    if (!queueId) continue;
    const existingIdx = interventions.findIndex((item) => item.schoolId === cleanSchoolId && item.queueId === queueId);
    if (existingIdx >= 0) {
      const existing = interventions[existingIdx];
      if (existing.status === 'resolved') continue;
      interventions[existingIdx] = {
        ...existing,
        priority: queueItem.priority,
        title: sanitizeText(queueItem.title, 140),
        description: sanitizeText(queueItem.description, 320),
        href: sanitizeText(queueItem.href, 240) || '/admin/analytics',
        riskReason: sanitizeText(queueItem.riskReason || existing.riskReason || queueItem.description, 400),
        updatedAt: now,
      };
      continue;
    }
    interventions.push({
      id: randomUUID(),
      schoolId: cleanSchoolId,
      queueId,
      priority: queueItem.priority,
      title: sanitizeText(queueItem.title, 140),
      description: sanitizeText(queueItem.description, 320),
      riskReason: sanitizeText(queueItem.riskReason || queueItem.description, 400),
      href: sanitizeText(queueItem.href, 240) || '/admin/analytics',
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });
  }

  const trimmed = interventions.slice(-MAX_ITEMS);
  await writeState({
    updatedAt: now,
    interventions: trimmed,
  });
  return listAdminInterventions(cleanSchoolId);
}

export async function updateAdminIntervention(
  schoolId: string,
  interventionId: string,
  patch: Partial<Pick<AdminInterventionItem, 'owner' | 'note' | 'status' | 'snoozeUntil'>>
): Promise<AdminInterventionItem | null> {
  const cleanSchoolId = sanitizeText(schoolId, 120);
  const cleanId = sanitizeText(interventionId, 120);
  if (!cleanSchoolId || !cleanId) return null;
  const state = await readState();
  const idx = state.interventions.findIndex((item) => item.schoolId === cleanSchoolId && item.id === cleanId);
  if (idx < 0) return null;

  const next: AdminInterventionItem = {
    ...state.interventions[idx],
    owner: patch.owner ? sanitizeText(patch.owner, 120) : state.interventions[idx].owner,
    note: patch.note ? sanitizeText(patch.note, 1000) : state.interventions[idx].note,
    status: patch.status ?? state.interventions[idx].status,
    snoozeUntil: patch.snoozeUntil ? sanitizeText(patch.snoozeUntil, 40) : state.interventions[idx].snoozeUntil,
    updatedAt: new Date().toISOString(),
  };
  const interventions = [...state.interventions];
  interventions[idx] = next;
  await writeState({
    updatedAt: new Date().toISOString(),
    interventions,
  });
  return next;
}
