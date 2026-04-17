import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { z } from 'zod';
const createResourceSchema = z.object({
  title: z.string().trim().min(1).max(180),
  type: z.enum(['pdf', 'link', 'video', 'image']),
  url: z.string().trim().url().max(1500),
  description: z.string().trim().max(1000).optional(),
  classLevel: z.union([z.literal(10), z.literal(12)]).optional(),
  section: z.string().trim().max(40).optional(),
  chapterId: z.string().trim().max(90).optional(),
  subject: z.string().trim().max(80).optional(),
});
import { createResource, deleteResource, listResources } from '@/lib/school-ops-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

type ResourceType = 'pdf' | 'link' | 'video' | 'image';

function toClassLevel(value: unknown): 10 | 12 | undefined {
  const parsed = Number(value);
  if (parsed === 10 || parsed === 12) return parsed;
  return undefined;
}

function toText(value: unknown, max = 220): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function isResourceType(value: string): value is ResourceType {
  return value === 'pdf' || value === 'link' || value === 'video' || value === 'image';
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);
  if (!teacherSession.teacher.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'teacher-school-missing',
      message: 'Teacher school context is required.',
      status: 403,
    });
  }

  const url = new URL(req.url);
  const classLevel = toClassLevel(url.searchParams.get('classLevel'));
  const section = toText(url.searchParams.get('section'), 40).toUpperCase();
  const chapterId = toText(url.searchParams.get('chapterId'), 90);
  const subject = toText(url.searchParams.get('subject'), 80);
  const mine = url.searchParams.get('mine') !== '0';
  const limit = Number(url.searchParams.get('limit') || 200);

  try {
    const resources = await listResources({
      schoolId: teacherSession.teacher.schoolId,
      teacherId: mine ? teacherSession.teacher.id : undefined,
      classLevel,
      section: section || undefined,
      chapterId: chapterId || undefined,
      subject: subject || undefined,
      limit,
    });
    return dataJson({
      requestId,
      data: { resources },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load resources.';
    return errorJson({
      requestId,
      errorCode: 'teacher-resources-read-failed',
      message,
      status: 500,
    });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);
  if (!teacherSession.teacher.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'teacher-school-missing',
      message: 'Teacher school context is required.',
      status: 403,
    });
  }

  const bodyResult = await parseAndValidateJsonBody(req, 128 * 1024, createResourceSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  const { title, type, url, description, classLevel, section: rawSection, chapterId, subject } = bodyResult.value;
  const section = rawSection?.toUpperCase() ?? '';
  if (!title || !url || !type) {
    return errorJson({
      requestId,
      errorCode: 'invalid-resource-payload',
      message: 'title, url, and valid type are required.',
      status: 400,
    });
  }

  try {
    const resource = await createResource({
      schoolId: teacherSession.teacher.schoolId,
      teacherId: teacherSession.teacher.id,
      title,
      type,
      url,
      description: description || undefined,
      classLevel,
      section: section || undefined,
      chapterId: chapterId || undefined,
      subject: subject || undefined,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/resources',
      action: 'teacher-resource-created',
      statusCode: 200,
      actorRole: 'teacher',
      schoolId: teacherSession.teacher.schoolId,
      metadata: {
        resourceId: resource.id,
        classLevel: resource.classLevel,
        section: resource.section,
        chapterId: resource.chapterId,
        committedAt,
      },
    });
    return dataJson({
      requestId,
      data: { resource },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create resource.';
    return errorJson({
      requestId,
      errorCode: 'teacher-resource-create-failed',
      message,
      status: 500,
    });
  }
}

export async function DELETE(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);
  if (!teacherSession.teacher.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'teacher-school-missing',
      message: 'Teacher school context is required.',
      status: 403,
    });
  }
  const url = new URL(req.url);
  const resourceId = toText(url.searchParams.get('id'), 90);
  if (!resourceId) {
    return errorJson({
      requestId,
      errorCode: 'missing-resource-id',
      message: 'Resource id is required.',
      status: 400,
    });
  }

  try {
    const deleted = await deleteResource({
      resourceId,
      schoolId: teacherSession.teacher.schoolId,
      teacherId: teacherSession.teacher.id,
    });
    if (!deleted) {
      return errorJson({
        requestId,
        errorCode: 'resource-not-found',
        message: 'Resource not found or access denied.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/resources',
      action: 'teacher-resource-deleted',
      statusCode: 200,
      actorRole: 'teacher',
      schoolId: teacherSession.teacher.schoolId,
      metadata: { resourceId, committedAt },
    });
    return dataJson({
      requestId,
      data: { deleted: true, resourceId },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete resource.';
    return errorJson({
      requestId,
      errorCode: 'teacher-resource-delete-failed',
      message,
      status: 500,
    });
  }
}

