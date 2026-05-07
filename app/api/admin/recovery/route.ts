import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { resolveRequestSupabaseClient } from '@/lib/supabase/request-client';
import { isSupabaseServiceConfigured } from '@/lib/supabase-rest';
import { isSupabaseStateEnabled } from '@/lib/persistence/supabase-state';
import {
  createDataCorrection,
  createRecoveryCheckpoint,
  getRecoveryState,
  updateDataCorrection,
} from '@/lib/admin/recovery';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

interface RecoveryPatchBody {
  action?: unknown;
  note?: unknown;
  summary?: unknown;
  title?: unknown;
  description?: unknown;
  owner?: unknown;
  correctionId?: unknown;
  status?: unknown;
}

function sanitizeText(value: unknown, max = 500): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

async function getServiceWorkerFreshness(): Promise<{ exists: boolean; updatedAt: string | null; ageMinutes: number | null }> {
  try {
    const swPath = path.join(process.cwd(), 'public', 'sw.js');
    const stat = await fs.stat(swPath);
    const updatedAt = stat.mtime.toISOString();
    const ageMinutes = Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 60000));
    return { exists: true, updatedAt, ageMinutes };
  } catch {
    return { exists: false, updatedAt: null, ageMinutes: null };
  }
}

async function getAuditTimeline(req: Request, schoolId: string): Promise<Array<{ id: string; action: string; endpoint: string; createdAt: string; statusCode: number }>> {
  const resolved = resolveRequestSupabaseClient(req, 'service-first');
  if (!resolved) return [];
  const { data, error } = await resolved.client
    .from('audit_events')
    .select('id,action,endpoint,created_at,status_code')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !Array.isArray(data)) return [];
  return data.map((row) => ({
    id: String((row as Record<string, unknown>).id || ''),
    action: String((row as Record<string, unknown>).action || ''),
    endpoint: String((row as Record<string, unknown>).endpoint || ''),
    createdAt: String((row as Record<string, unknown>).created_at || ''),
    statusCode: Number((row as Record<string, unknown>).status_code || 0),
  }));
}

async function getCoreCounts(req: Request, schoolId: string): Promise<{ teachers: number; students: number; parents: number; assignmentPacks: number }> {
  const resolved = resolveRequestSupabaseClient(req, 'service-first');
  if (!resolved) return { teachers: 0, students: 0, parents: 0, assignmentPacks: 0 };

  const [teachers, students, parents, packs] = await Promise.all([
    resolved.client.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    resolved.client.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    resolved.client.from('parent_links').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    resolved.client.from('teacher_assignment_packs').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
  ]);

  return {
    teachers: teachers.count ?? 0,
    students: students.count ?? 0,
    parents: parents.count ?? 0,
    assignmentPacks: packs.count ?? 0,
  };
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getAdminSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Admin session required.', requestId);
  if (!session.schoolId) {
    return errorJson({ requestId, errorCode: 'missing-school-scope', message: 'School scope missing.', status: 403 });
  }

  try {
    const schoolId = session.schoolId;
    const [state, timeline, counts, sw] = await Promise.all([
      getRecoveryState(schoolId),
      getAuditTimeline(req, schoolId),
      getCoreCounts(req, schoolId),
      getServiceWorkerFreshness(),
    ]);

    return dataJson({
      requestId,
      data: {
        generatedAt: new Date().toISOString(),
        schoolId,
        backupStatus: {
          supabaseServiceConfigured: isSupabaseServiceConfigured(),
          supabaseStateEnabled: isSupabaseStateEnabled(),
          checkpoints: state.checkpoints.length,
          latestCheckpointAt: state.checkpoints[0]?.createdAt,
          serviceWorker: sw,
          coreEntityCounts: counts,
        },
        corrections: state.corrections,
        checkpoints: state.checkpoints,
        auditTimeline: timeline,
      },
    });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'admin-recovery-read-failed',
      message: error instanceof Error ? error.message : 'Failed to load recovery status.',
      status: 500,
    });
  }
}

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);
  const session = await getAdminSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Admin session required.', requestId);
  if (!session.schoolId) {
    return errorJson({ requestId, errorCode: 'missing-school-scope', message: 'School scope missing.', status: 403 });
  }

  let body: RecoveryPatchBody | null = null;
  try {
    body = (await req.json()) as RecoveryPatchBody;
  } catch {
    return errorJson({ requestId, errorCode: 'invalid-body', message: 'Invalid JSON body.', status: 400 });
  }

  const action = sanitizeText(body?.action, 50);
  if (!action) {
    return errorJson({ requestId, errorCode: 'missing-action', message: 'action is required.', status: 400 });
  }

  try {
    if (action === 'create-checkpoint') {
      const note = sanitizeText(body?.note, 500) || undefined;
      const summary = body?.summary && typeof body.summary === 'object' ? body.summary as Record<string, unknown> : undefined;
      const state = await createRecoveryCheckpoint({
        schoolId: session.schoolId,
        createdBy: session.authUserId || session.displayName,
        note,
        summary,
      });
      await recordAuditEvent({
        requestId,
        endpoint: '/api/admin/recovery',
        action: 'admin-recovery-create-checkpoint',
        statusCode: 200,
        actorRole: session.role,
        actorAuthUserId: session.authUserId,
        schoolId: session.schoolId,
        metadata: { note },
      });
      return dataJson({ requestId, data: { state } });
    }

    if (action === 'create-correction') {
      const title = sanitizeText(body?.title, 140);
      const description = sanitizeText(body?.description, 1000);
      if (!title || !description) {
        return errorJson({ requestId, errorCode: 'missing-fields', message: 'title and description are required.', status: 400 });
      }
      const state = await createDataCorrection({
        schoolId: session.schoolId,
        title,
        description,
        owner: sanitizeText(body?.owner, 120) || undefined,
        note: sanitizeText(body?.note, 1000) || undefined,
      });
      await recordAuditEvent({
        requestId,
        endpoint: '/api/admin/recovery',
        action: 'admin-recovery-create-correction',
        statusCode: 200,
        actorRole: session.role,
        actorAuthUserId: session.authUserId,
        schoolId: session.schoolId,
        metadata: { title },
      });
      return dataJson({ requestId, data: { state } });
    }

    if (action === 'update-correction') {
      const correctionId = sanitizeText(body?.correctionId, 120);
      if (!correctionId) {
        return errorJson({ requestId, errorCode: 'missing-correction-id', message: 'correctionId is required.', status: 400 });
      }
      const statusValue = sanitizeText(body?.status, 40);
      const status = statusValue === 'open' || statusValue === 'in_progress' || statusValue === 'resolved'
        ? statusValue
        : undefined;
      const updated = await updateDataCorrection({
        schoolId: session.schoolId,
        correctionId,
        status,
        owner: sanitizeText(body?.owner, 120) || undefined,
        note: sanitizeText(body?.note, 1000) || undefined,
      });
      if (!updated) {
        return errorJson({ requestId, errorCode: 'correction-not-found', message: 'Correction item not found.', status: 404 });
      }
      await recordAuditEvent({
        requestId,
        endpoint: '/api/admin/recovery',
        action: 'admin-recovery-update-correction',
        statusCode: 200,
        actorRole: session.role,
        actorAuthUserId: session.authUserId,
        schoolId: session.schoolId,
        metadata: {
          correctionId,
          status: updated.status,
        },
      });
      return dataJson({ requestId, data: { correction: updated } });
    }

    return errorJson({ requestId, errorCode: 'unsupported-action', message: 'Unsupported action.', status: 400 });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'admin-recovery-update-failed',
      message: error instanceof Error ? error.message : 'Failed to update recovery state.',
      status: 500,
    });
  }
}
