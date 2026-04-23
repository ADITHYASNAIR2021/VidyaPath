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

interface CachedStudentSession {
  value: ClientStudentSession | null;
  expiresAt: number;
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
  'Social Science',
];

const STUDENT_SESSION_CACHE_TTL_MS = 45_000;
let cachedStudentSession: CachedStudentSession | null = null;
let inFlightStudentSession: Promise<ClientStudentSession | null> | null = null;

function isSupportedSubject(value: string): value is Subject {
  return SUPPORTED_SUBJECTS.includes(value as Subject);
}

async function readStudentSession(): Promise<ClientStudentSession | null> {
  const response = await fetch('/api/student/session/me', { cache: 'no-store', credentials: 'include' }).catch(() => null);
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

export async function fetchClientStudentSession(options?: { forceRefresh?: boolean }): Promise<ClientStudentSession | null> {
  const forceRefresh = options?.forceRefresh === true;
  const now = Date.now();

  if (!forceRefresh && cachedStudentSession && cachedStudentSession.expiresAt > now) {
    return cachedStudentSession.value;
  }
  if (!forceRefresh && inFlightStudentSession) return inFlightStudentSession;

  inFlightStudentSession = readStudentSession().finally(() => {
    inFlightStudentSession = null;
  });
  const value = await inFlightStudentSession;

  cachedStudentSession = {
    value,
    expiresAt: now + STUDENT_SESSION_CACHE_TTL_MS,
  };
  return value;
}

export function clearClientStudentSessionCache(): void {
  cachedStudentSession = null;
}
