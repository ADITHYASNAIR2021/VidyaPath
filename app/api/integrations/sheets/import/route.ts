import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { gradeSubmission, releaseSubmissionResults } from '@/lib/teacher-admin-db';
import { importFromSheets } from '@/lib/sheets-bridge';

export const dynamic = 'force-dynamic';

interface ImportGradeRow {
  submissionId: string;
  packId?: string;
  release?: boolean;
  questionGrades: Array<{ questionNo: string; scoreAwarded: number; maxScore: number; feedback?: string }>;
}

function normalizeQuestionGrades(value: unknown): ImportGradeRow['questionGrades'] {
  if (!Array.isArray(value)) return [];
  const grades: ImportGradeRow['questionGrades'] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const grade = item as Record<string, unknown>;
    const questionNo = typeof grade.questionNo === 'string' ? grade.questionNo.trim() : '';
    const scoreAwarded = Number(grade.scoreAwarded);
    const maxScore = Number(grade.maxScore);
    const feedback = typeof grade.feedback === 'string' ? grade.feedback.trim() : undefined;
    if (!questionNo || !Number.isFinite(scoreAwarded) || !Number.isFinite(maxScore)) continue;
    grades.push({ questionNo, scoreAwarded, maxScore, feedback });
  }
  return grades;
}

function normalizeRows(value: unknown): ImportGradeRow[] {
  if (!Array.isArray(value)) return [];
  const rows: ImportGradeRow[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const submissionId = typeof record.submissionId === 'string' ? record.submissionId.trim() : '';
    if (!submissionId) continue;
    const questionGrades = normalizeQuestionGrades(record.questionGrades);
    if (questionGrades.length === 0) continue;
    const packId = typeof record.packId === 'string' ? record.packId.trim() : undefined;
    const release = record.release === true;
    rows.push({ submissionId, packId, release, questionGrades });
  }
  return rows;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const teacher = await getTeacherSessionFromRequestCookies();
    if (!teacher) {
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Teacher session required for grade import.',
        status: 401,
      });
    }

    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 256 * 1024);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
      });
    }
    const body = bodyResult.value;
    let rows = normalizeRows((body as { rows?: unknown } | null)?.rows);

    if (rows.length === 0) {
      const pulled = await importFromSheets({
        mode: 'grades',
        teacherId: teacher.teacher.id,
      });
      rows = normalizeRows((pulled as { rows?: unknown } | null)?.rows);
    }

    let gradedCount = 0;
    const packIdsToRelease = new Set<string>();

    for (const row of rows) {
      const graded = await gradeSubmission({
        teacherId: teacher.teacher.id,
        submissionId: row.submissionId,
        questionGrades: row.questionGrades,
      });
      if (!graded) continue;
      gradedCount += 1;
      if (row.release && row.packId) packIdsToRelease.add(row.packId);
    }

    let releasedCount = 0;
    for (const packId of packIdsToRelease) {
      const result = await releaseSubmissionResults({
        teacherId: teacher.teacher.id,
        packId,
      });
      releasedCount += result.releasedCount;
    }

    return dataJson({
      requestId,
      data: {
        ok: true,
        gradedCount,
        releasedCount,
        processedRows: rows.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sheets import failed.';
    return errorJson({
      requestId,
      errorCode: 'sheets-import-failed',
      message,
      status: 500,
    });
  }
}
