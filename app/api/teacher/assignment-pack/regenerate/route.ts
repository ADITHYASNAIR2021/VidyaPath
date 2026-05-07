import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { regeneratePackSchema } from '@/lib/schemas/teacher-pack';
import {
  canTeacherAccessAssignmentPack,
  getAssignmentPack,
  getSubmissionSummary,
  upsertAssignmentPack,
  updateAssignmentPackStatus,
} from '@/lib/teacher-admin-db';
import { buildTeacherAssignmentPackDraft, buildTeacherPackUrls, toAnswerKey } from '@/lib/teacher-assignment';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

function normalizeQuestionNo(value: string): string {
  const clean = String(value || '').trim().toUpperCase();
  if (!clean) return '';
  const numeric = Number(clean.replace(/[^0-9]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return `Q${Math.round(numeric)}`;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const teacherSession = await getTeacherSessionFromRequestCookies();
    if (!teacherSession) {
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Unauthorized teacher access.',
        status: 401,
      });
    }
    const limit = await checkRateLimit({
      key: buildRateLimitKey('teacher:regenerate-pack', [teacherSession.teacher.id, getClientIp(req)]),
      windowSeconds: 60,
      maxRequests: 10,
      blockSeconds: 120,
    });
    if (!limit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many regeneration requests. Please retry shortly.',
        status: 429,
        hint: `Retry after ${limit.retryAfterSeconds}s`,
      });
    }
    await assertTeacherStorageWritable();

    const bodyResult = await parseAndValidateJsonBody(req, 24 * 1024, regeneratePackSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }
    const {
      packId,
      feedback = '',
      difficultyMix: requestedDifficultyMix = '',
      questionCount: requestedQuestionCount,
      onlyWeak = false,
      weakQuestionNos,
      preserveLocked = true,
    } = bodyResult.value;

    const pack = await getAssignmentPack(packId);
    if (!pack) {
      return errorJson({
        requestId,
        errorCode: 'assignment-pack-not-found',
        message: 'Assignment pack not found.',
        status: 404,
      });
    }

    const canAccess = await canTeacherAccessAssignmentPack(teacherSession.teacher.id, packId);
    if (!canAccess) {
      return errorJson({
        requestId,
        errorCode: 'forbidden',
        message: 'Forbidden.',
        status: 403,
      });
    }

    const draft = await buildTeacherAssignmentPackDraft({
      chapterId: pack.chapterId,
      classLevel: pack.classLevel,
      subject: pack.subject,
      questionCount: requestedQuestionCount ?? pack.questionCount,
      paperMode: pack.paperMode,
      shortAnswerCount: Array.isArray(pack.shortAnswers) ? pack.shortAnswers.length : 0,
      longAnswerCount: Array.isArray(pack.longAnswers) ? pack.longAnswers.length : 0,
      formulaDrillCount: Array.isArray(pack.formulaDrill) ? pack.formulaDrill.length : 0,
      difficultyMix:
        requestedDifficultyMix.length > 0
          ? requestedDifficultyMix
          : pack.difficultyMix,
      includeShortAnswers: pack.includeShortAnswers,
      includeLongAnswers: pack.includeLongAnswers !== false,
      includeFormulaDrill: pack.includeFormulaDrill,
      dueDate: pack.dueDate,
    });
    const urls = buildTeacherPackUrls(packId);
    const nowIso = new Date().toISOString();
    const existingMcqs = Array.isArray(pack.mcqs) ? pack.mcqs : [];
    const regeneratedPool = Array.isArray(draft.mcqs) ? draft.mcqs : [];
    const questionMeta = { ...(pack.questionMeta ?? {}) };
    const lockSet = new Set<string>();
    if (preserveLocked) {
      for (const [questionNo, meta] of Object.entries(questionMeta)) {
        if (meta && typeof meta === 'object' && (meta as { locked?: boolean }).locked) {
          lockSet.add(normalizeQuestionNo(questionNo));
        }
      }
    }
    const explicitWeakSet = new Set(
      (Array.isArray(weakQuestionNos) ? weakQuestionNos : [])
        .map((entry) => normalizeQuestionNo(entry))
        .filter(Boolean)
    );
    const metaWeakSet = new Set(
      Object.entries(questionMeta)
        .filter(([, meta]) => !!meta && typeof meta === 'object' && (meta as { weakSignal?: boolean }).weakSignal === true)
        .map(([questionNo]) => normalizeQuestionNo(questionNo))
        .filter(Boolean)
    );
    const autoWeakSet = new Set<string>();
    if (onlyWeak && explicitWeakSet.size === 0 && metaWeakSet.size === 0) {
      const summary = await getSubmissionSummary(packId);
      for (const stat of summary.questionStats) {
        const normalized = normalizeQuestionNo(stat.questionNo);
        if (!normalized) continue;
        if (stat.attempts >= 2 && stat.accuracyPercent <= 55) {
          autoWeakSet.add(normalized);
        }
      }
    }
    const weakSourceSet = explicitWeakSet.size > 0
      ? explicitWeakSet
      : (metaWeakSet.size > 0 ? metaWeakSet : autoWeakSet);
    const targetSet = new Set<string>(
      [...weakSourceSet].filter((questionNo) => !lockSet.has(questionNo))
    );

    let nextMcqs = regeneratedPool;
    if (onlyWeak) {
      if (targetSet.size === 0) {
        return errorJson({
          requestId,
          errorCode: 'no-weak-questions-selected',
          message: lockSet.size > 0
            ? 'No weak questions available to regenerate. Selected weak questions may be locked.'
            : 'No weak questions were identified for regeneration.',
          status: 409,
        });
      }
      let cursor = 0;
      nextMcqs = existingMcqs.map((question, index) => {
        const questionNo = `Q${index + 1}`;
        if (!targetSet.has(questionNo)) return question;
        const replacement = regeneratedPool[cursor] ?? regeneratedPool[index] ?? question;
        cursor += 1;
        return replacement;
      });
      for (const questionNo of targetSet) {
        const prev = questionMeta[questionNo] ?? { maxMarks: 1 };
        questionMeta[questionNo] = {
          ...prev,
          weakSignal: false,
          quality: prev.quality === 'weak' ? 'needs-review' : prev.quality,
          regeneratedCount: Math.max(0, Number(prev.regeneratedCount) || 0) + 1,
          lastRegeneratedAt: nowIso,
        };
      }
    }

    await upsertAssignmentPack(teacherSession.teacher.id, {
      ...pack,
      ...draft,
      mcqs: nextMcqs,
      shortAnswers: onlyWeak ? pack.shortAnswers : draft.shortAnswers,
      longAnswers: onlyWeak ? pack.longAnswers : draft.longAnswers,
      formulaDrill: onlyWeak ? pack.formulaDrill : draft.formulaDrill,
      packId,
      shareUrl: urls.shareUrl,
      printUrl: urls.printUrl,
      answerKey: toAnswerKey(nextMcqs),
      section: pack.section,
      status: 'review',
      questionMeta,
      feedbackHistory: pack.feedbackHistory,
      approvedAt: undefined,
      approvedByTeacherId: undefined,
      publishedAt: undefined,
    });

    if (feedback) {
      await updateAssignmentPackStatus({
        teacherId: teacherSession.teacher.id,
        packId,
        status: 'review',
        feedback,
      });
    }

    const updated = await getAssignmentPack(packId);
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/assignment-pack/regenerate',
      action: 'teacher-regenerated-pack',
      statusCode: 200,
      actorRole: 'teacher',
      metadata: {
        teacherId: teacherSession.teacher.id,
        packId,
        committedAt,
        hasFeedback: !!feedback,
        onlyWeak,
        regeneratedWeakCount: onlyWeak ? targetSet.size : undefined,
      },
    });
    return dataJson({
      requestId,
      data: { pack: updated },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to regenerate assignment pack.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'assignment-pack-regenerate-failed',
      message,
      status,
    });
  }
}
