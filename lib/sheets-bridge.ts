import { readStateFromSupabase, writeStateToSupabase } from '@/lib/persistence/supabase-state';
import type { SheetsIntegrationSettings, SheetsSyncStatus } from '@/lib/teacher-types';

const SETTINGS_KEY = 'sheets_integration_settings_v1';
const STATUS_KEY = 'sheets_sync_status_v1';

function nowIso(): string {
  return new Date().toISOString();
}

function fromEnvSettings(): SheetsIntegrationSettings {
  const endpointUrl =
    process.env.SHEETS_APPS_SCRIPT_URL?.trim() ||
    process.env.GOOGLE_APPS_SCRIPT_URL?.trim() ||
    '';
  const secret =
    process.env.SHEETS_SHARED_SECRET?.trim() ||
    process.env.GOOGLE_APPS_SCRIPT_SECRET?.trim() ||
    '';
  const enabled = (process.env.SHEETS_ENABLED || 'true').toLowerCase() !== 'false';
  return {
    endpointUrl,
    secret,
    enabled: Boolean(enabled && endpointUrl && secret),
    updatedAt: nowIso(),
  };
}

export async function getSheetsSettings(): Promise<SheetsIntegrationSettings> {
  const fromState = await readStateFromSupabase<SheetsIntegrationSettings>(SETTINGS_KEY).catch(() => null);
  const env = fromEnvSettings();
  if (!fromState) return env;
  return {
    endpointUrl: fromState.endpointUrl || env.endpointUrl,
    secret: fromState.secret || env.secret,
    enabled: Boolean((fromState.enabled ?? env.enabled) && (fromState.endpointUrl || env.endpointUrl) && (fromState.secret || env.secret)),
    updatedAt: fromState.updatedAt || env.updatedAt,
  };
}

export async function getSheetsStatus(): Promise<SheetsSyncStatus> {
  const settings = await getSheetsSettings();
  const status = await readStateFromSupabase<SheetsSyncStatus>(STATUS_KEY).catch(() => null);
  return {
    configured: Boolean(settings.endpointUrl && settings.secret),
    enabled: settings.enabled,
    lastExportAt: status?.lastExportAt,
    lastImportAt: status?.lastImportAt,
    message: status?.message,
  };
}

async function setSheetsStatus(patch: Partial<SheetsSyncStatus>): Promise<void> {
  const current = await getSheetsStatus();
  const next: SheetsSyncStatus = {
    ...current,
    ...patch,
  };
  await writeStateToSupabase(STATUS_KEY, next).catch(() => false);
}

export async function exportToSheets(payload: Record<string, unknown>): Promise<unknown> {
  const settings = await getSheetsSettings();
  if (!settings.enabled || !settings.endpointUrl || !settings.secret) {
    throw new Error('Sheets integration is not configured.');
  }
  const response = await fetch(settings.endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'export',
      secret: settings.secret,
      payload,
    }),
    cache: 'no-store',
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((json as { error?: string } | null)?.error || `Sheets export failed (${response.status}).`);
  }
  await setSheetsStatus({ lastExportAt: nowIso(), message: 'Last export succeeded.' });
  return json;
}

export async function importFromSheets(payload: Record<string, unknown>): Promise<unknown> {
  const settings = await getSheetsSettings();
  if (!settings.enabled || !settings.endpointUrl || !settings.secret) {
    throw new Error('Sheets integration is not configured.');
  }
  const response = await fetch(settings.endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'import',
      secret: settings.secret,
      payload,
    }),
    cache: 'no-store',
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((json as { error?: string } | null)?.error || `Sheets import failed (${response.status}).`);
  }
  await setSheetsStatus({ lastImportAt: nowIso(), message: 'Last import succeeded.' });
  return json;
}
