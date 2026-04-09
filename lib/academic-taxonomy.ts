export const CORE_SUBJECTS = ['Physics', 'Chemistry', 'Biology', 'Math'] as const;
export const COMMERCE_SUBJECTS = ['Accountancy', 'Business Studies', 'Economics', 'English Core'] as const;
export const SUPPORTED_SUBJECTS = [...CORE_SUBJECTS, ...COMMERCE_SUBJECTS] as const;

export type CoreSubject = (typeof CORE_SUBJECTS)[number];
export type CommerceSubject = (typeof COMMERCE_SUBJECTS)[number];
export type SupportedSubject = (typeof SUPPORTED_SUBJECTS)[number];

export type HelperClassLevel = 10 | 12;

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
