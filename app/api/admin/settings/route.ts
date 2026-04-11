import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { getSchoolById, updateSchool } from '@/lib/platform-rbac-db';
import { recordAuditEvent } from '@/lib/security/audit';
import { supabaseInsert, supabaseSelect, supabaseUpdate } from '@/lib/supabase-rest';

export const dynamic = 'force-dynamic';

type AdminSettingsState = {
  pinPolicy: {
    expiryDays: number;
  };
  notifications: {
    emailAnnouncements: boolean;
    pushAlerts: boolean;
    weeklyDigest: boolean;
  };
};

type AppStateRow = {
  state_key: string;
  state_json: AdminSettingsState;
  updated_at?: string;
};

const SETTINGS_KEY_PREFIX = 'admin_settings_v1';

const DEFAULT_SETTINGS: AdminSettingsState = {
  pinPolicy: {
    expiryDays: 90,
  },
  notifications: {
    emailAnnouncements: true,
    pushAlerts: true,
    weeklyDigest: false,
  },
};

function readText(value: unknown, max = 140): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return cleaned || undefined;
}

function sanitizeSettingsState(value: unknown): AdminSettingsState {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS;
  const state = value as Partial<AdminSettingsState>;
  const expiryDaysRaw = Number(state?.pinPolicy?.expiryDays);
  const expiryDays = Number.isFinite(expiryDaysRaw)
    ? Math.max(30, Math.min(365, Math.round(expiryDaysRaw)))
    : DEFAULT_SETTINGS.pinPolicy.expiryDays;
  const notifications: Partial<AdminSettingsState['notifications']> = state.notifications ?? {};
  return {
    pinPolicy: { expiryDays },
    notifications: {
      emailAnnouncements: notifications.emailAnnouncements ?? DEFAULT_SETTINGS.notifications.emailAnnouncements,
      pushAlerts: notifications.pushAlerts ?? DEFAULT_SETTINGS.notifications.pushAlerts,
      weeklyDigest: notifications.weeklyDigest ?? DEFAULT_SETTINGS.notifications.weeklyDigest,
    },
  };
}

function settingsStateKey(schoolId: string): string {
  return `${SETTINGS_KEY_PREFIX}:${schoolId}`;
}

async function loadAdminSettings(schoolId: string): Promise<AdminSettingsState> {
  const key = settingsStateKey(schoolId);
  const rows = await supabaseSelect<AppStateRow>('app_state', {
    select: 'state_key,state_json,updated_at',
    filters: [{ column: 'state_key', value: key }],
    limit: 1,
  }).catch(() => []);
  return sanitizeSettingsState(rows[0]?.state_json);
}

async function saveAdminSettings(schoolId: string, state: AdminSettingsState): Promise<void> {
  const key = settingsStateKey(schoolId);
  const existing = await supabaseSelect<AppStateRow>('app_state', {
    select: 'state_key',
    filters: [{ column: 'state_key', value: key }],
    limit: 1,
  }).catch(() => []);
  if (existing[0]?.state_key) {
    await supabaseUpdate<AppStateRow>(
      'app_state',
      {
        state_json: state,
        updated_at: new Date().toISOString(),
      },
      [{ column: 'state_key', value: key }]
    );
    return;
  }
  await supabaseInsert<AppStateRow>('app_state', {
    state_key: key,
    state_json: state,
    updated_at: new Date().toISOString(),
  });
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  if (!adminSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-scope',
      message: 'Admin school context is required.',
      status: 403,
    });
  }
  try {
    const [school, settings] = await Promise.all([
      getSchoolById(adminSession.schoolId),
      loadAdminSettings(adminSession.schoolId),
    ]);
    if (!school) {
      return errorJson({
        requestId,
        errorCode: 'school-not-found',
        message: 'School profile not found for this admin.',
        status: 404,
      });
    }
    return dataJson({
      requestId,
      data: { school, settings },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load admin settings.';
    return errorJson({
      requestId,
      errorCode: 'admin-settings-read-failed',
      message,
      status: 500,
    });
  }
}

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  if (!adminSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-scope',
      message: 'Admin school context is required.',
      status: 403,
    });
  }
  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 64 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }
  const body = bodyResult.value;
  try {
    const schoolPatch = {
      schoolName: readText(body.schoolName, 140),
      board: readText(body.board, 40),
      city: readText(body.city, 80),
      state: readText(body.state, 80),
      contactPhone: readText(body.contactPhone, 30),
      contactEmail: readText(body.contactEmail, 120),
    };
    const updatedSchool = await updateSchool(adminSession.schoolId, schoolPatch);
    if (!updatedSchool) {
      return errorJson({
        requestId,
        errorCode: 'school-not-found',
        message: 'School profile not found for this admin.',
        status: 404,
      });
    }
    const currentSettings = await loadAdminSettings(adminSession.schoolId);
    const nextSettings = sanitizeSettingsState({
      pinPolicy: {
        expiryDays:
          Number(body.pinExpiryDays) ||
          Number((body.pinPolicy as Record<string, unknown> | undefined)?.expiryDays) ||
          currentSettings.pinPolicy.expiryDays,
      },
      notifications: {
        emailAnnouncements:
          typeof body.emailAnnouncements === 'boolean'
            ? body.emailAnnouncements
            : (typeof (body.notifications as Record<string, unknown> | undefined)?.emailAnnouncements === 'boolean'
              ? Boolean((body.notifications as Record<string, unknown>).emailAnnouncements)
              : currentSettings.notifications.emailAnnouncements),
        pushAlerts:
          typeof body.pushAlerts === 'boolean'
            ? body.pushAlerts
            : (typeof (body.notifications as Record<string, unknown> | undefined)?.pushAlerts === 'boolean'
              ? Boolean((body.notifications as Record<string, unknown>).pushAlerts)
              : currentSettings.notifications.pushAlerts),
        weeklyDigest:
          typeof body.weeklyDigest === 'boolean'
            ? body.weeklyDigest
            : (typeof (body.notifications as Record<string, unknown> | undefined)?.weeklyDigest === 'boolean'
              ? Boolean((body.notifications as Record<string, unknown>).weeklyDigest)
              : currentSettings.notifications.weeklyDigest),
      },
    });
    await saveAdminSettings(adminSession.schoolId, nextSettings);
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/settings',
      action: 'admin-settings-updated',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId: adminSession.schoolId,
      metadata: {
        committedAt,
        fields: ['schoolName', 'board', 'city', 'state', 'contactPhone', 'contactEmail', 'pinExpiryDays', 'notifications'],
      },
    });
    return dataJson({
      requestId,
      data: {
        school: updatedSchool,
        settings: nextSettings,
      },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update admin settings.';
    return errorJson({
      requestId,
      errorCode: 'admin-settings-update-failed',
      message,
      status: 500,
    });
  }
}
