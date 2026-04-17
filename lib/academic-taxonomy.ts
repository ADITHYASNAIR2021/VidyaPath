export const CORE_SUBJECTS = ['Physics', 'Chemistry', 'Biology', 'Math'] as const;
export const COMMERCE_SUBJECTS = ['Accountancy', 'Business Studies', 'Economics', 'English Core'] as const;
export const SUPPORTED_SUBJECTS = [...CORE_SUBJECTS, ...COMMERCE_SUBJECTS] as const;

export type CoreSubject = (typeof CORE_SUBJECTS)[number];
export type CommerceSubject = (typeof COMMERCE_SUBJECTS)[number];
export type SupportedSubject = (typeof SUPPORTED_SUBJECTS)[number];

export type HelperClassLevel = 10 | 12;
export type AcademicStream = 'foundation' | 'pcm' | 'pcb' | 'commerce' | 'interdisciplinary';
export type SeniorSecondaryStream = Exclude<AcademicStream, 'foundation'>;

export const CLASS_10_STREAM: AcademicStream = 'foundation';
export const CLASS_12_STREAMS: SeniorSecondaryStream[] = ['pcm', 'pcb', 'commerce', 'interdisciplinary'];

export const STREAM_LABELS: Record<AcademicStream, string> = {
  foundation: 'Foundation',
  pcm: 'PCM',
  pcb: 'PCB',
  commerce: 'Commerce',
  interdisciplinary: 'Interdisciplinary',
};

const STREAM_SUBJECT_MAP: Record<AcademicStream, SupportedSubject[]> = {
  foundation: ['Physics', 'Chemistry', 'Biology', 'Math', 'English Core'],
  pcm: ['Physics', 'Chemistry', 'Math', 'English Core'],
  pcb: ['Physics', 'Chemistry', 'Biology', 'English Core'],
  commerce: ['Accountancy', 'Business Studies', 'Economics', 'English Core'],
  interdisciplinary: [
    'Physics',
    'Chemistry',
    'Biology',
    'Math',
    'Accountancy',
    'Business Studies',
    'Economics',
    'English Core',
  ],
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
    subjects: ['Physics', 'Chemistry', 'Biology', 'Math', 'English Core'],
  },
  12: {
    classLevel: 12,
    title: 'Class 12 Helper',
    description: 'Board + entrance aligned support across science, math, and commerce-ready subjects.',
    subjects: [
      'Physics',
      'Chemistry',
      'Biology',
      'Math',
      'Accountancy',
      'Business Studies',
      'Economics',
      'English Core',
    ],
  },
};

export function isSupportedSubject(value: string): value is SupportedSubject {
  return SUPPORTED_SUBJECTS.includes(value as SupportedSubject);
}

export function isAcademicStream(value: string): value is AcademicStream {
  return value === 'foundation' || value === 'pcm' || value === 'pcb' || value === 'commerce' || value === 'interdisciplinary';
}

export function normalizeAcademicStream(value: unknown): AcademicStream | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (isAcademicStream(normalized)) return normalized;

  // Legacy aliases from older sessions / payloads.
  if (normalized === 'science') return 'pcm';
  if (normalized === 'humanities' || normalized === 'arts') return 'interdisciplinary';
  if (normalized === 'class10' || normalized === 'class-10') return 'foundation';
  return undefined;
}

export function getDefaultAcademicStream(classLevel: HelperClassLevel): AcademicStream {
  return classLevel === 10 ? 'foundation' : 'pcm';
}

export function enforceAcademicStreamForClass(
  classLevel: HelperClassLevel,
  stream?: AcademicStream
): AcademicStream {
  if (classLevel === 10) return 'foundation';
  if (!stream || stream === 'foundation') {
    throw new Error('Class 12 stream is required: pcm, pcb, commerce, or interdisciplinary.');
  }
  return stream;
}

export function getSubjectsForAcademicTrack(
  classLevel: HelperClassLevel,
  stream?: AcademicStream
): SupportedSubject[] {
  if (classLevel === 10) {
    return [...STREAM_SUBJECT_MAP.foundation];
  }
  if (!stream || stream === 'foundation') {
    return [...STREAM_SUBJECT_MAP.interdisciplinary];
  }
  return [...STREAM_SUBJECT_MAP[stream]];
}
