import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readStateFromSupabase, writeStateToSupabase } from '@/lib/persistence/supabase-state';

export interface OnboardingStepState {
  id: string;
  completed: boolean;
  completedAt?: string;
  note?: string;
}

export interface SchoolOnboardingState {
  updatedAt: string;
  steps: OnboardingStepState[];
}

const STATE_PREFIX = 'admin_onboarding_v1';
const RUNTIME_DIR = path.join(process.cwd(), 'lib', 'runtime');
const STATE_PATH = path.join(RUNTIME_DIR, 'admin-onboarding-state.json');

let memoryState: Record<string, SchoolOnboardingState> = {};

function sanitizeText(value: string, max = 180): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function stateKey(schoolId: string): string {
  return `${STATE_PREFIX}:${sanitizeText(schoolId, 120)}`;
}

function normalizeStep(entry: unknown): OnboardingStepState | null {
  if (!entry || typeof entry !== 'object') return null;
  const step = entry as Partial<OnboardingStepState>;
  const id = typeof step.id === 'string' ? sanitizeText(step.id, 80) : '';
  if (!id) return null;
  return {
    id,
    completed: step.completed === true,
    completedAt: typeof step.completedAt === 'string' ? step.completedAt : undefined,
    note: typeof step.note === 'string' ? sanitizeText(step.note, 500) : undefined,
  };
}

function normalizeState(value: unknown): SchoolOnboardingState {
  if (!value || typeof value !== 'object') {
    return {
      updatedAt: new Date().toISOString(),
      steps: [],
    };
  }
  const state = value as Partial<SchoolOnboardingState>;
  const steps = Array.isArray(state.steps)
    ? state.steps.map((item) => normalizeStep(item)).filter((item): item is OnboardingStepState => item !== null)
    : [];
  return {
    updatedAt: typeof state.updatedAt === 'string' && state.updatedAt ? state.updatedAt : new Date().toISOString(),
    steps,
  };
}

async function readLocalMap(): Promise<Record<string, SchoolOnboardingState>> {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, SchoolOnboardingState>;
    if (!parsed || typeof parsed !== 'object') return {};
    const normalized: Record<string, SchoolOnboardingState> = {};
    for (const [key, value] of Object.entries(parsed)) {
      normalized[key] = normalizeState(value);
    }
    return normalized;
  } catch {
    return memoryState;
  }
}

async function writeLocalMap(state: Record<string, SchoolOnboardingState>): Promise<void> {
  memoryState = state;
  try {
    await fs.mkdir(RUNTIME_DIR, { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // ignore local write failures
  }
}

export async function getOnboardingState(schoolId: string): Promise<SchoolOnboardingState> {
  const key = stateKey(schoolId);
  const remote = await readStateFromSupabase<SchoolOnboardingState>(key);
  if (remote) return normalizeState(remote);
  const localMap = await readLocalMap();
  return localMap[key] ? normalizeState(localMap[key]) : { updatedAt: new Date().toISOString(), steps: [] };
}

export async function upsertOnboardingStep(
  schoolId: string,
  stepId: string,
  patch: { completed?: boolean; note?: string }
): Promise<SchoolOnboardingState> {
  const key = stateKey(schoolId);
  const current = await getOnboardingState(schoolId);
  const cleanStepId = sanitizeText(stepId, 80);
  if (!cleanStepId) return current;

  const existingIndex = current.steps.findIndex((step) => step.id === cleanStepId);
  const existing = existingIndex >= 0 ? current.steps[existingIndex] : null;
  const completed = patch.completed ?? existing?.completed ?? false;

  const nextStep: OnboardingStepState = {
    id: cleanStepId,
    completed,
    completedAt: completed ? (existing?.completedAt || new Date().toISOString()) : undefined,
    note: typeof patch.note === 'string' ? sanitizeText(patch.note, 500) : existing?.note,
  };

  const nextSteps = [...current.steps];
  if (existingIndex >= 0) nextSteps[existingIndex] = nextStep;
  else nextSteps.push(nextStep);

  const nextState: SchoolOnboardingState = {
    updatedAt: new Date().toISOString(),
    steps: nextSteps,
  };

  const remoteOk = await writeStateToSupabase(key, nextState);
  if (!remoteOk) {
    const localMap = await readLocalMap();
    localMap[key] = nextState;
    await writeLocalMap(localMap);
  }

  return nextState;
}
