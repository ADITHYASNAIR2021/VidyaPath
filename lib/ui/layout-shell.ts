const PORTAL_PREFIXES = ['/teacher', '/admin', '/developer'];

const STUDENT_SHELL_PREFIXES = [
  '/dashboard',
  '/bookmarks',
  '/chapters',
  '/formulas',
  '/equations',
  '/papers',
  '/student/attendance',
  '/student/calendar',
  '/student/certificate',
  '/student/grades',
  '/student/resources',
  '/student/srs',
  '/student/timetable',
  '/student/achievements',
  '/student/ai-tools',
  '/student/notes',
  '/student/questions',
];

const EXCLUDED_STUDENT_SHELL_PREFIXES = [
  '/student/login',
  '/exam/assignment',
  '/practice/assignment',
];

const SHARED_ROLE_SHELL_PREFIXES = [
  '/chapters',
  '/formulas',
  '/equations',
  '/papers',
  '/career',
  '/cbse-notes',
  '/concept-web',
  '/helper',
];

export function isPortalPath(pathname: string): boolean {
  return PORTAL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isStudentShellPath(pathname: string): boolean {
  if (EXCLUDED_STUDENT_SHELL_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
  return STUDENT_SHELL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isSharedRoleShellPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return SHARED_ROLE_SHELL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isExamLikePath(pathname: string): boolean {
  return pathname.startsWith('/exam/');
}
