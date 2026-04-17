import { describe, it, expect } from 'vitest';
import { trackEventSchema } from '@/lib/schemas/analytics';
import { saveNoteSchema } from '@/lib/schemas/student-notes';
import { startExamSessionSchema, submitExamSchema, examHeartbeatSchema } from '@/lib/schemas/exam-session';
import { createAssignmentPackSchema, packIdOnlySchema } from '@/lib/schemas/teacher-pack';
import { createAffiliateRequestSchema } from '@/lib/schemas/affiliate';
import { markAttendanceSchema } from '@/lib/schemas/teacher-attendance';

// ── analytics/track schema ────────────────────────────────────────────────

describe('trackEventSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = trackEventSchema.safeParse({ eventName: 'chapter_view', chapterId: 'ch-001' });
    expect(result.success).toBe(true);
  });

  it('rejects empty eventName', () => {
    const result = trackEventSchema.safeParse({ eventName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing eventName', () => {
    const result = trackEventSchema.safeParse({ chapterId: 'ch-001' });
    expect(result.success).toBe(false);
  });

  it('strips extra fields (passthrough=false)', () => {
    const result = trackEventSchema.safeParse({
      eventName: 'search_no_result',
      query: 'newton',
      injectedField: 'evil',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).injectedField).toBeUndefined();
    }
  });
});

// ── student/notes schema ──────────────────────────────────────────────────

describe('saveNoteSchema', () => {
  it('accepts valid save note input', () => {
    const result = saveNoteSchema.safeParse({ chapterId: 'physics-ch1', content: 'My notes' });
    expect(result.success).toBe(true);
  });

  it('defaults content to empty string when omitted', () => {
    const result = saveNoteSchema.safeParse({ chapterId: 'ch-1' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.content).toBe('');
  });

  it('rejects empty chapterId', () => {
    const result = saveNoteSchema.safeParse({ chapterId: '', content: 'Text' });
    expect(result.success).toBe(false);
  });
});

// ── exam session schemas ──────────────────────────────────────────────────

describe('startExamSessionSchema', () => {
  it('accepts a valid packId', () => {
    const r = startExamSessionSchema.safeParse({ packId: 'pack-abc-123' });
    expect(r.success).toBe(true);
  });

  it('rejects missing packId', () => {
    const r = startExamSessionSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe('submitExamSchema', () => {
  it('accepts valid submit payload', () => {
    const r = submitExamSchema.safeParse({
      sessionId: 'sess-001',
      answers: [{ questionNo: 'Q1', answerText: 'Newton' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty answers array', () => {
    const r = submitExamSchema.safeParse({ sessionId: 'sess-001', answers: [] });
    expect(r.success).toBe(false);
  });

  it('rejects answer with empty questionNo', () => {
    const r = submitExamSchema.safeParse({
      sessionId: 'sess-001',
      answers: [{ questionNo: '', answerText: 'text' }],
    });
    expect(r.success).toBe(false);
  });
});

describe('examHeartbeatSchema', () => {
  it('accepts sessionId with no violations', () => {
    const r = examHeartbeatSchema.safeParse({ sessionId: 'sess-001' });
    expect(r.success).toBe(true);
  });

  it('accepts violations array', () => {
    const r = examHeartbeatSchema.safeParse({
      sessionId: 'sess-001',
      violations: [{ eventType: 'tab-switch', detail: 'switched to Chrome' }],
    });
    expect(r.success).toBe(true);
  });
});

// ── teacher-pack schemas ──────────────────────────────────────────────────

describe('createAssignmentPackSchema', () => {
  const base = {
    chapterId: 'physics-ch-3',
    classLevel: 10 as const,
    subject: 'Physics',
  };

  it('accepts a complete valid payload', () => {
    const r = createAssignmentPackSchema.safeParse({ ...base, questionCount: 15 });
    expect(r.success).toBe(true);
  });

  it('defaults questionCount to 10', () => {
    const r = createAssignmentPackSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.questionCount).toBe(10);
  });

  it('coerces numeric string classLevel', () => {
    const r = createAssignmentPackSchema.safeParse({ ...base, classLevel: '12' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.classLevel).toBe(12);
  });

  it('rejects classLevel 11', () => {
    const r = createAssignmentPackSchema.safeParse({ ...base, classLevel: 11 });
    expect(r.success).toBe(false);
  });

  it('rejects missing chapterId', () => {
    const r = createAssignmentPackSchema.safeParse({ classLevel: 10, subject: 'Physics' });
    expect(r.success).toBe(false);
  });
});

describe('packIdOnlySchema', () => {
  it('accepts packId only', () => {
    const r = packIdOnlySchema.safeParse({ packId: 'pk-001' });
    expect(r.success).toBe(true);
  });

  it('accepts packId with optional feedback', () => {
    const r = packIdOnlySchema.safeParse({ packId: 'pk-001', feedback: 'Looks good!' });
    expect(r.success).toBe(true);
  });

  it('rejects missing packId', () => {
    const r = packIdOnlySchema.safeParse({ feedback: 'note' });
    expect(r.success).toBe(false);
  });
});

// ── affiliate schema ──────────────────────────────────────────────────────

describe('createAffiliateRequestSchema', () => {
  const valid = {
    schoolName: 'DPS School',
    contactName: 'Principal Ram',
    contactPhone: '9876543210',
  };

  it('accepts minimal valid payload', () => {
    const r = createAffiliateRequestSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('rejects missing contactPhone', () => {
    const r = createAffiliateRequestSchema.safeParse({ ...valid, contactPhone: undefined });
    expect(r.success).toBe(false);
  });

  it('rejects invalid contactEmail', () => {
    const r = createAffiliateRequestSchema.safeParse({ ...valid, contactEmail: 'not-an-email' });
    expect(r.success).toBe(false);
  });

  it('accepts empty string contactEmail (omitted)', () => {
    const r = createAffiliateRequestSchema.safeParse({ ...valid, contactEmail: '' });
    expect(r.success).toBe(true);
  });
});

// ── attendance schema ─────────────────────────────────────────────────────

describe('markAttendanceSchema', () => {
  const base = {
    classLevel: 10 as const,
    section: 'A',
    records: [{ studentId: 'stu-001', status: 'present' }],
  };

  it('accepts a valid payload', () => {
    const r = markAttendanceSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('accepts date in YYYY-MM-DD format', () => {
    const r = markAttendanceSchema.safeParse({ ...base, date: '2025-04-17' });
    expect(r.success).toBe(true);
  });

  it('rejects invalid date format', () => {
    const r = markAttendanceSchema.safeParse({ ...base, date: '17-04-2025' });
    expect(r.success).toBe(false);
  });

  it('rejects empty records array', () => {
    const r = markAttendanceSchema.safeParse({ ...base, records: [] });
    expect(r.success).toBe(false);
  });

  it('rejects invalid attendance status', () => {
    const r = markAttendanceSchema.safeParse({
      ...base,
      records: [{ studentId: 'stu-001', status: 'asleep' }],
    });
    expect(r.success).toBe(false);
  });
});
