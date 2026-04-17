import { randomBytes } from 'node:crypto';

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 18;

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SPECIALS = '!@#$%^&*()_-+=[]{}:;,.?';

export function validatePasswordPolicy(password: string): { ok: true } | { ok: false; message: string } {
  if (typeof password !== 'string') {
    return { ok: false, message: 'Password is required.' };
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      message: `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters long.`,
    };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: 'Password must include at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: 'Password must include at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: 'Password must include at least one number.' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { ok: false, message: 'Password must include at least one special symbol.' };
  }
  return { ok: true };
}

export function assertPasswordPolicy(password: string): void {
  const verdict = validatePasswordPolicy(password);
  if (!verdict.ok) {
    throw new Error(verdict.message);
  }
}

function pick(pool: string, byte: number): string {
  return pool[byte % pool.length];
}

export function generateStrongPassword(length = 12): string {
  const targetLength = Math.max(PASSWORD_MIN_LENGTH, Math.min(PASSWORD_MAX_LENGTH, Math.floor(length)));
  const all = `${UPPER}${LOWER}${DIGITS}${SPECIALS}`;
  const bytes = randomBytes(Math.max(32, targetLength * 2));
  const chars = [
    pick(UPPER, bytes[0]),
    pick(LOWER, bytes[1]),
    pick(DIGITS, bytes[2]),
    pick(SPECIALS, bytes[3]),
  ];
  for (let i = chars.length; i < targetLength; i += 1) {
    chars.push(pick(all, bytes[i % bytes.length]));
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = bytes[(i + 7) % bytes.length] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const generated = chars.join('');
  assertPasswordPolicy(generated);
  return generated;
}

export function generateLegacyPin(seed: string, digits = 6): string {
  const width = Math.max(4, Math.min(8, Math.floor(digits)));
  const extracted = (seed || '').replace(/\D/g, '').slice(-width);
  if (extracted.length === width) return extracted;
  const min = 10 ** (width - 1);
  const max = 10 ** width - 1;
  const random = Math.floor(min + Math.random() * (max - min + 1));
  return String(random);
}

export function buildInitialStudentPasswordFromLoginId(loginId: string): string {
  return (loginId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
