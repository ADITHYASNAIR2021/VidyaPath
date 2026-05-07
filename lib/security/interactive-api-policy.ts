const INTERACTIVE_API_EXACT_PATHS = new Set([
  '/api/adaptive-test',
  '/api/ai-tutor',
  '/api/chapter-diagnose',
  '/api/chapter-drill',
  '/api/chapter-pack',
  '/api/chapter-remediate',
  '/api/context-pack',
  '/api/generate-flashcards',
  '/api/generate-quiz',
  '/api/image-solve',
  '/api/paper-evaluate',
  '/api/revision-plan',
  '/api/student/announcements/read',
  '/api/teacher/announcement-reads',
]);

const INTERACTIVE_API_PREFIXES = [
  '/api/ai/',
  '/api/push/',
  '/api/student/push/',
] as const;

export function isInteractiveApiRoute(pathname: string): boolean {
  if (!pathname) return false;
  if (INTERACTIVE_API_EXACT_PATHS.has(pathname)) return true;
  return INTERACTIVE_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export const INTERACTIVE_API_POLICY_SNAPSHOT = {
  exact: [...INTERACTIVE_API_EXACT_PATHS].sort(),
  prefixes: [...INTERACTIVE_API_PREFIXES],
} as const;
