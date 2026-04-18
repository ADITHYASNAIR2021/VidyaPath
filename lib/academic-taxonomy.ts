export const CLASS_10_SUBJECTS = [
  'Physics',
  'Chemistry',
  'Biology',
  'Math',
  'English Core',
  'Social Science',
] as const;
export const PCM_SUBJECTS = ['Physics', 'Chemistry', 'Math', 'English Core'] as const;
export const PCB_SUBJECTS = ['Physics', 'Chemistry', 'Biology', 'English Core'] as const;
export const COMMERCE_SUBJECTS = ['Accountancy', 'Business Studies', 'Economics', 'English Core'] as const;
export const CLASS_12_SUBJECTS = [
  'Physics',
  'Chemistry',
  'Biology',
  'Math',
  'Accountancy',
  'Business Studies',
  'Economics',
  'English Core',
  'Social Science',
] as const;
export const SUPPORTED_SUBJECTS = [
  'Physics',
  'Chemistry',
  'Biology',
  'Math',
  'English Core',
  'Social Science',
  'Accountancy',
  'Business Studies',
  'Economics',
] as const;

export type SupportedSubject = (typeof SUPPORTED_SUBJECTS)[number];

export type HelperClassLevel = 10 | 12;
export type AcademicStream = 'pcm' | 'pcb' | 'commerce';
export type SeniorSecondaryStream = AcademicStream;

export const CLASS_12_STREAMS: SeniorSecondaryStream[] = ['pcm', 'pcb', 'commerce'];

export const STREAM_LABELS: Record<AcademicStream, string> = {
  pcm: 'PCM',
  pcb: 'PCB',
  commerce: 'Commerce',
};

const STREAM_SUBJECT_MAP: Record<AcademicStream, SupportedSubject[]> = {
  pcm: [...PCM_SUBJECTS],
  pcb: [...PCB_SUBJECTS],
  commerce: [...COMMERCE_SUBJECTS],
};

export interface ClassBranchConfig {
  classLevel: HelperClassLevel;
  title: string;
  description: string;
  subjects: SupportedSubject[];
}

export const CLASS_BRANCH_CONFIG: Record<HelperClassLevel, ClassBranchConfig> = {
  10: {
    classLevel: 10,
    title: 'Class 10 Helper',
    description: 'Board-first chapter practice with chapter intelligence, PYQs, and revision support.',
    subjects: [...CLASS_10_SUBJECTS],
  },
  12: {
    classLevel: 12,
    title: 'Class 12 Helper',
    description: 'Board + entrance aligned support across science, math, and commerce-ready subjects.',
    subjects: [...CLASS_12_SUBJECTS],
  },
};

export function isSupportedSubject(value: string): value is SupportedSubject {
  return SUPPORTED_SUBJECTS.includes(value as SupportedSubject);
}

export function isAcademicStream(value: string): value is AcademicStream {
  return value === 'pcm' || value === 'pcb' || value === 'commerce';
}

export function normalizeAcademicStream(value: unknown): AcademicStream | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (isAcademicStream(normalized)) return normalized;

  // Legacy aliases from older sessions / payloads.
  if (normalized === 'science') return 'pcm';
  if (normalized === 'class10' || normalized === 'class-10') return undefined;
  if (normalized === 'foundation' || normalized === 'interdisciplinary') return undefined;
  return undefined;
}

export function getDefaultAcademicStream(classLevel: HelperClassLevel): AcademicStream | undefined {
  return classLevel === 12 ? 'pcm' : undefined;
}

export function enforceAcademicStreamForClass(
  classLevel: HelperClassLevel,
  stream?: AcademicStream
): AcademicStream | undefined {
  if (classLevel === 10) return undefined;
  if (!stream) return undefined;
  if (!isAcademicStream(stream)) {
    throw new Error('Class 12 stream must be one of: pcm, pcb, commerce.');
  }
  return stream;
}

export function getSubjectsForAcademicTrack(
  classLevel: HelperClassLevel,
  stream?: AcademicStream
): SupportedSubject[] {
  if (classLevel === 10) {
    return [...CLASS_10_SUBJECTS];
  }
  if (!stream) {
    return [...CLASS_12_SUBJECTS];
  }
  return [...STREAM_SUBJECT_MAP[stream]];
}
