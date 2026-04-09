import { NextResponse } from 'next/server';
import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import {
  canTeacherAccessAssignmentPack,
  getAssignmentPack,
  upsertAssignmentPack,
  updateAssignmentPackStatus,
} from '@/lib/teacher-admin-db';
import { buildTeacherAssignmentPackDraft, buildTeacherPackUrls, toAnswerKey } from '@/lib/teacher-assignment';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export const dynamic = 'force-dynamic';

interface RegenerateBody {
  packId: string;
  feedback?: string;
  questionCount?: number;
  difficultyMix?: string;
}

export async function POST(req: Request) {
  try {
    const teacherSession = await getTeacherSessionFromRequestCookies();
    if (!teacherSession) {
      return NextResponse.json({ error: 'Unauthorized teacher access.' }, { status: 401 });
    }
    await assertTeacherStorageWritable();

    const body = (await req.json().catch(() => null)) as RegenerateBody | null;
    const packId = typeof body?.packId === 'string' ? body.packId.trim() : '';
    const feedback = typeof body?.feedback === 'string' ? body.feedback.trim() : '';
    if (!packId) return NextResponse.json({ error: 'packId is required.' }, { status: 400 });

    const pack = await getAssignmentPack(packId);
    if (!pack) return NextResponse.json({ error: 'Assignment pack not found.' }, { status: 404 });

    const canAccess = await canTeacherAccessAssignmentPack(teacherSession.teacher.id, packId);
    if (!canAccess) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    const draft = await buildTeacherAssignmentPackDraft({
      chapterId: pack.chapterId,
      classLevel: pack.classLevel,
      subject: pack.subject,
      questionCount: Number.isFinite(Number(body?.questionCount)) ? Number(body?.questionCount) : pack.questionCount,
      difficultyMix:
        typeof body?.difficultyMix === 'string' && body.difficultyMix.trim().length > 0
          ? body.difficultyMix.trim()
          : pack.difficultyMix,
      includeShortAnswers: pack.includeShortAnswers,
      includeFormulaDrill: pack.includeFormulaDrill,
      dueDate: pack.dueDate,
    });
    const urls = buildTeacherPackUrls(packId);

    await upsertAssignmentPack(teacherSession.teacher.id, {
      ...pack,
      ...draft,
      packId,
      shareUrl: urls.shareUrl,
      printUrl: urls.printUrl,
      answerKey: toAnswerKey(draft.mcqs),
      section: pack.section,
      status: 'review',
      questionMeta: pack.questionMeta,
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
    return NextResponse.json({ pack: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to regenerate assignment pack.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
