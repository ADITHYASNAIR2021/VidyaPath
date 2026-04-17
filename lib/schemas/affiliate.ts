/**
 * Typed Zod schemas for affiliate request route.
 * Route: /api/affiliate/requests
 */
import { z } from 'zod';

export const createAffiliateRequestSchema = z.object({
  schoolName: z.string().trim().min(1).max(200),
  schoolCodeHint: z.string().trim().max(20).optional(),
  board: z.string().trim().max(40).optional(),
  state: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  affiliateNo: z.string().trim().max(40).optional(),
  websiteUrl: z.string().trim().url().max(300).optional().or(z.literal('')),
  contactName: z.string().trim().min(1).max(120),
  contactPhone: z.string().trim().min(1).max(20),
  contactEmail: z.string().trim().email().max(200).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateAffiliateRequestInput = z.infer<typeof createAffiliateRequestSchema>;
