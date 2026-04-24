import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { getSubjectsForAcademicTrack, type AcademicStream } from '@/lib/academic-taxonomy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listSchoolAnnouncements } from '@/lib/school-ops-db';
import { getPublicTeacherConfig } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

interface StudentAnnouncementItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  source: 'school' | 'teacher';
  subject?: string;
  classLevel?: 10 | 12;
  section?: string;
  chapterId?: string;
  audience?: 'all' | 'teachers' | 'students' | 'class10' | 'class12';
  deliveryScope?: 'class' | 'section' | 'batch' | 'chapter';
}

function normalizeText(value: string, max = 220): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function toLimit(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 120;
  return Math.max(1, Math.min(250, Math.trunc(value)));
}

function toStudentSection(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = normalizeText(value, 40).toUpperCase();
  return clean || undefined;
}

function buildAllowedSubjectSet(session: {
  classLevel: 10 | 12;
  stream?: AcademicStream;
  enrolledSubjects?: string[];
}): Set<string> {
  const enrolled = (session.enrolledSubjects ?? [])
    .map((item) => normalizeText(String(item), 80).toLowerCase())
    .filter(Boolean);
  const fallback = getSubjectsForAcademicTrack(session.classLevel, session.stream)
    .map((item) => normalizeText(String(item), 80).toLowerCase())
    .filter(Boolean);
  const source = enrolled.length > 0 ? enrolled : fallback;
  return new Set(source);
}

function teacherAnnouncementsFromConfig(
  config: unknown,
  allowedSubjects: Set<string>
): StudentAnnouncementItem[] {
  if (!config || typeof config !== 'object') return [];
  const scopeFeed = (config as Record<string, unknown>).scopeFeed;
  if (!scopeFeed || typeof scopeFeed !== 'object') return [];
  const announcements = (scopeFeed as Record<string, unknown>).announcements;
  if (!Array.isArray(announcements)) return [];

  const mapped: Array<StudentAnnouncementItem | null> = announcements.map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as Record<string, unknown>;
      const subject = typeof item.subject === 'string' ? normalizeText(item.subject, 80) : '';
      if (!subject) return null;
      const subjectKey = subject.toLowerCase();
      if (allowedSubjects.size > 0 && !allowedSubjects.has(subjectKey)) return null;
      const id = typeof item.id === 'string' ? normalizeText(item.id, 80) : '';
      const title = typeof item.title === 'string' ? normalizeText(item.title, 180) : '';
      const body = typeof item.body === 'string' ? normalizeText(item.body, 3000) : '';
      const createdAt = typeof item.updatedAt === 'string' ? item.updatedAt : '';
      if (!id || !title || !createdAt) return null;
      return {
        id,
        title,
        body,
        createdAt,
        source: 'teacher' as const,
        subject,
        classLevel: Number(item.classLevel) === 10 ? 10 : 12,
        section: typeof item.section === 'string' ? normalizeText(item.section, 40) : undefined,
        chapterId: typeof item.chapterId === 'string' ? normalizeText(item.chapterId, 80) : undefined,
      } satisfies StudentAnnouncementItem;
    });
  return mapped.filter((item): item is StudentAnnouncementItem => item !== null);
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);
  if (!studentSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'student-school-missing',
      message: 'Student school scope is required.',
      status: 403,
    });
  }
  const url = new URL(req.url);
  const limit = toLimit(url.searchParams.get('limit'));
  const studentSection = toStudentSection(studentSession.section);
  const allowedSubjects = buildAllowedSubjectSet(studentSession);

  try {
    const [allSchoolAnnouncements, teacherConfig] = await Promise.all([
      listSchoolAnnouncements({
        schoolId: studentSession.schoolId,
        limit: Math.max(120, limit),
      }),
      getPublicTeacherConfig({
        classLevel: studentSession.classLevel,
        section: studentSection,
        schoolId: studentSession.schoolId,
      }),
    ]);

    const schoolAnnouncements: StudentAnnouncementItem[] = allSchoolAnnouncements
      .filter((item) => {
        if (item.audience === 'all' || item.audience === 'students') return true;
        if (item.audience === 'class10') return studentSession.classLevel === 10;
        if (item.audience === 'class12') return studentSession.classLevel === 12;
        return false;
      })
      .map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        createdAt: item.createdAt,
        source: 'school' as const,
        audience: item.audience,
      }));
    const teacherAnnouncements = teacherAnnouncementsFromConfig(teacherConfig, allowedSubjects);

    const announcements = [...schoolAnnouncements, ...teacherAnnouncements]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);

    return dataJson({
      requestId,
      data: { announcements },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load student announcements.';
    return errorJson({
      requestId,
      errorCode: 'student-announcements-read-failed',
      message,
      status: 500,
    });
  }
}
