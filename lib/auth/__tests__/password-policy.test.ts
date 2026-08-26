import { describe, expect, it } from 'vitest';
import { generateSecureNumericPin, generateStrongPassword, validatePasswordPolicy } from '@/lib/auth/password-policy';

describe('provisioned credentials', () => {
  it('generates passwords that satisfy the platform policy', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(validatePasswordPolicy(generateStrongPassword(12))).toEqual({ ok: true });
    }
  });

  it('generates fixed-width numeric parent portal pins', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(generateSecureNumericPin(6)).toMatch(/^\d{6}$/);
    }
  });
});
