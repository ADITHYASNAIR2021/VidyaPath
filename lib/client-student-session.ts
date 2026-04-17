'use client';

import type { Subject } from '@/lib/data';
import { normalizeAcademicStream, type AcademicStream } from '@/lib/academic-taxonomy';

export interface ClientStudentSession {
  studentId?: string;
  studentName?: string;
  classLevel?: 10 | 12;
  section?: string;
  batch?: string;
  mustChangePassword?: boolean;
  stream?: AcademicStream;
  enrolledSubjects: Subject[];
}

const SUPPORTED_SUBJECTS: Subject[] = [
  'Physics',
  'Chemistry',
  'Biology',
  'Math',
  'Accountancy',
  'Business Studies',
  'Economics',
  'English Core',
];

function isSupportedSubject(value: string): value is Subject {
  return SUPPORTED_SUBJECTS.includes(value as Subject);
}

export async function fetchClientStudentSession(): Promise<ClientStudentSession | null> {
  const response = await fetch('/api/student/session/me', { cache: 'no-store' }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object') return null;
  const data = payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : payload as Record<string, unknown>;

  const classLevelRaw = Number(data.classLevel);
  const classLevel = classLevelRaw === 10 || classLevelRaw === 12 ? classLevelRaw : undefined;
  const studentId = typeof data.studentId === 'string' ? data.studentId.trim() : '';
  const enrolledSubjects = Array.isArray(data.enrolledSubjects)
    ? data.enrolledSubjects
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(isSupportedSubject)
    : [];

  return {
    studentId: studentId || undefined,
    studentName: typeof data.studentName === 'string' ? data.studentName.trim() || undefined : undefined,
    classLevel,
    section: typeof data.section === 'string' ? data.section.trim() || undefined : undefined,
    batch: typeof data.batch === 'string' ? data.batch.trim() || undefined : undefined,
    mustChangePassword: data.mustChangePassword === true,
    stream: normalizeAcademicStream(data.stream),
    enrolledSubjects,
  };
}
