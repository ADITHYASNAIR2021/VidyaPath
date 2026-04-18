import { getChapterById } from '@/lib/data';
import type { TeacherScope, TeacherSession } from '@/lib/teacher-types';

export interface TeacherScopeTarget {
  chapterId?: string;
  classLevel?: 10 | 12;
  subject?: string;
  section?: string;
}

function normalizeText(value: unknown, max = 120): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeSubject(value: unknown): string {
  return normalizeText(value, 80).toLowerCase();
}

function normalizeSection(value: unknown): string {
  return normalizeText(value, 40).toUpperCase();
}

function isSectionAllowed(scope: TeacherScope, requestedSection?: string): boolean {
  if (!requestedSection) return true;
  const scopeSection = normalizeSection(scope.section);
  if (!scopeSection) return true;
  return scopeSection === requestedSection;
}

function buildResolvedTarget(target: TeacherScopeTarget): {
  classLevel?: 10 | 12;
  subject?: string;
  section?: string;
} | null {
  const chapterId = normalizeText(target.chapterId, 120);
  const requestedSection = normalizeSection(target.section) || undefined;
  if (chapterId) {
    const chapter = getChapterById(chapterId);
    if (!chapter || (chapter.classLevel !== 10 && chapter.classLevel !== 12)) return null;
    const requestedSubject = normalizeSubject(target.subject);
    if (requestedSubject && requestedSubject !== normalizeSubject(chapter.subject)) return null;
    if (target.classLevel && target.classLevel !== chapter.classLevel) return null;
    return {
      classLevel: chapter.classLevel,
      subject: normalizeSubject(chapter.subject),
      section: requestedSection,
    };
  }
  return {
    classLevel: target.classLevel,
    subject: normalizeSubject(target.subject) || undefined,
    section: requestedSection,
  };
}

export function resolveTeacherScopeMatch(
  session: Pick<TeacherSession, 'effectiveScopes'>,
  target: TeacherScopeTarget
): TeacherScope | null {
  const activeScopes = (session.effectiveScopes || []).filter((scope) => scope.isActive);
  if (activeScopes.length === 0) return null;
  const resolved = buildResolvedTarget(target);
  if (!resolved) return null;
  const { classLevel, subject, section } = resolved;

  return (
    activeScopes.find((scope) => {
      if (classLevel && scope.classLevel !== classLevel) return false;
      if (subject && normalizeSubject(scope.subject) !== subject) return false;
      return isSectionAllowed(scope, section);
    }) ?? null
  );
}

export function teacherHasScopeForTarget(
  session: Pick<TeacherSession, 'effectiveScopes'>,
  target: TeacherScopeTarget
): boolean {
  return !!resolveTeacherScopeMatch(session, target);
}

