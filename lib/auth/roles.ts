export type PlatformRole = 'anonymous' | 'student' | 'teacher' | 'admin' | 'developer';

export const PLATFORM_ROLE_PRIORITY: Record<Exclude<PlatformRole, 'anonymous'>, number> = {
  developer: 400,
  admin: 300,
  teacher: 200,
  student: 100,
};

export function isPlatformRole(value: unknown): value is Exclude<PlatformRole, 'anonymous'> {
  return value === 'student' || value === 'teacher' || value === 'admin' || value === 'developer';
}

export function chooseHighestRole(
  roles: Array<Exclude<PlatformRole, 'anonymous'>>
): Exclude<PlatformRole, 'anonymous'> | null {
  if (roles.length === 0) return null;
  const sorted = [...roles].sort((a, b) => PLATFORM_ROLE_PRIORITY[b] - PLATFORM_ROLE_PRIORITY[a]);
  return sorted[0] ?? null;
}
