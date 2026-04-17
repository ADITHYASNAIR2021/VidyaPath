/**
 * Auth route schemas for API boundaries.
 * These schemas intentionally validate only transport-level shape and
 * minimum required credential fields. Domain-specific checks still happen
 * in route handlers.
 */
import { z } from 'zod';
import { nonEmpty } from './base';

const optionalString = z.string().trim().min(1).max(256).optional();
const optionalClassLevel = z.coerce.number().int().optional();
const optionalShortString = z.string().trim().min(1).max(64).optional();

export const studentLoginSchema = z
  .object({
    schoolCode: optionalString,
    classLevel: optionalClassLevel,
    section: optionalShortString,
    batch: optionalShortString,
    roll: optionalShortString,
    rollNo: optionalShortString,
    rollCode: optionalString,
    pin: optionalShortString,
    password: optionalString,
  })
  .refine(
    (value) => !!(value.roll || value.rollNo || value.rollCode),
    { message: 'Provide roll, rollNo, or rollCode.', path: ['roll'] }
  )
  .refine(
    (value) => !!(value.password || value.pin),
    { message: 'Provide password or pin.', path: ['password'] }
  )
  .passthrough();

export const teacherLoginSchema = z
  .object({
    teacherCode: optionalString,
    email: optionalString,
    identifier: optionalString,
    password: optionalString,
    pin: optionalShortString,
    phone: optionalShortString,
    schoolCode: optionalString,
  })
  .refine(
    (value) => !!(value.identifier || value.email || value.phone || value.teacherCode),
    { message: 'Provide identifier, email, phone, or teacherCode.', path: ['identifier'] }
  )
  .refine(
    (value) => !!(value.password || value.pin),
    { message: 'Provide password or pin.', path: ['password'] }
  )
  .passthrough();

export const adminBootstrapSchema = z
  .object({
    schoolCode: optionalString,
    email: optionalString,
    password: optionalString,
    identifier: optionalString,
    key: optionalString,
  })
  .refine(
    (value) => !!value.key || !!(value.password && (value.identifier || value.email)),
    { message: 'Provide bootstrap key OR identifier/email + password.', path: ['key'] }
  )
  .passthrough();

export const developerLoginSchema = z
  .object({
    username: optionalString,
    email: optionalString,
    password: z.string().trim().min(1).max(256),
  })
  .refine(
    (value) => !!(value.username || value.email),
    { message: 'Provide username or email.', path: ['username'] }
  )
  .passthrough();

export const parentLoginSchema = z
  .object({
    parentCode: optionalShortString,
    phone: z.string().trim().min(4).max(32),
    pin: z.string().trim().min(4).max(32),
    schoolCode: optionalString,
    schoolId: optionalString,
    studentId: optionalString,
  })
  .passthrough();

export const passwordChangeSchema = z
  .object({
    currentPassword: optionalString,
    newPassword: nonEmpty,
    confirmPassword: optionalString,
  })
  .passthrough();
