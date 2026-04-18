import { describe, expect, it } from 'vitest';
import { resolveTeacherScopeMatch, teacherHasScopeForTarget } from '@/lib/teacher/scope-guards';

const BASE_SCOPE = {
  id: 'scope-1',
  teacherId: 'teacher-1',
  classLevel: 10 as const,
  subject: 'Physics',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('teacher scope guards', () => {
  it('matches class/subject/section targets', () => {
    const session = {
      effectiveScopes: [{ ...BASE_SCOPE, section: 'A' }],
    };
    const match = resolveTeacherScopeMatch(session, {
      classLevel: 10,
      subject: 'Physics',
      section: 'A',
    });
    expect(match?.id).toBe('scope-1');
    expect(teacherHasScopeForTarget(session, { classLevel: 10, subject: 'Physics', section: 'A' })).toBe(true);
  });

  it('rejects out-of-scope subjects', () => {
    const session = {
      effectiveScopes: [{ ...BASE_SCOPE, section: undefined }],
    };
    expect(teacherHasScopeForTarget(session, { classLevel: 10, subject: 'Chemistry' })).toBe(false);
  });

  it('allows any section when scope has no section restriction', () => {
    const session = {
      effectiveScopes: [{ ...BASE_SCOPE, section: undefined }],
    };
    expect(teacherHasScopeForTarget(session, { classLevel: 10, subject: 'Physics', section: 'B' })).toBe(true);
  });

  it('returns false when no active scope exists', () => {
    const session = {
      effectiveScopes: [{ ...BASE_SCOPE, isActive: false }],
    };
    expect(teacherHasScopeForTarget(session, { classLevel: 10, subject: 'Physics' })).toBe(false);
  });
});

