import { z } from 'zod';

const compactString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value.replace(/\s+/g, ' ').trim());

const optionalCompact = (max: number) => compactString(max).optional();
const pinExpiryDays = z.coerce.number().int().min(30).max(365);

export const adminSettingsPatchSchema = z
  .object({
    schoolName: optionalCompact(140),
    board: optionalCompact(40),
    city: optionalCompact(80),
    state: optionalCompact(80),
    contactPhone: optionalCompact(30),
    contactEmail: optionalCompact(120),
    pinExpiryDays: pinExpiryDays.optional(),
    pinPolicy: z
      .object({
        expiryDays: pinExpiryDays.optional(),
      })
      .optional(),
    emailAnnouncements: z.boolean().optional(),
    pushAlerts: z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
    notifications: z
      .object({
        emailAnnouncements: z.boolean().optional(),
        pushAlerts: z.boolean().optional(),
        weeklyDigest: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();
