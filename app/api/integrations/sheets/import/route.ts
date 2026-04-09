import { NextResponse } from 'next/server';
import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { gradeSubmission, releaseSubmissionResults } from '@/lib/teacher-admin-db';
import { importFromSheets } from '@/lib/sheets-bridge';

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
  try {
    const teacher = await getTeacherSessionFromRequestCookies();
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher session required for grade import.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
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

    return NextResponse.json({
      ok: true,
      gradedCount,
      releasedCount,
      processedRows: rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sheets import failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
