import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

function normalizePin(pin: string): string {
  return pin.replace(/\s+/g, '').trim();
}

export function isValidPin(pin: string): boolean {
  const normalized = normalizePin(pin);
  return /^[0-9]{4,8}$/.test(normalized);
}

export function hashPin(pin: string): string {
  const normalized = normalizePin(pin);
  if (!isValidPin(normalized)) {
    throw new Error('PIN must be 4 to 8 digits.');
  }
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(normalized, salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const normalized = normalizePin(pin);
  const [algo, salt, hash] = storedHash.split(':');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(normalized, salt, 32);
  const stored = Buffer.from(hash, 'hex');
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

