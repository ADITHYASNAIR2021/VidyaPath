/**
 * Typed Zod schemas for developer-ops admin routes.
 * Routes: /api/developer/schools, /api/developer/schools/[id],
 *         /api/developer/schools/[id]/admins,
 *         /api/developer/affiliate-requests/[id],
 *         /api/developer/data-quality/verify-career-sources
 */
import { z } from 'zod';

// ── Create school ─────────────────────────────────────────────────────────

export const createSchoolSchema = z.object({
  schoolName: z.string().trim().min(1).max(200),
  schoolCode: z.string().trim().max(10).optional(),
  board: z.string().trim().max(40).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  contactPhone: z.string().trim().max(20).optional(),
  contactEmail: z.string().trim().email().max(200).optional().or(z.literal('')),
});
export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;

// ── Update school ─────────────────────────────────────────────────────────

export const updateSchoolSchema = createSchoolSchema.partial().extend({
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;

// ── Create school admin ───────────────────────────────────────────────────

export const createSchoolAdminSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(20).optional(),
  adminIdentifier: z.string().trim().max(60).optional(),
  password: z.string().min(6).max(128).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  authEmail: z.string().trim().email().max(200).optional().or(z.literal('')),
});
export type CreateSchoolAdminInput = z.infer<typeof createSchoolAdminSchema>;

// ── Approve / reject affiliate request ───────────────────────────────────

export const updateAffiliateRequestSchema = z.object({
  status: z.enum(['approved', 'rejected', 'pending', 'archived']),
  notes: z.string().trim().max(1000).optional(),
  rejectionReason: z.string().trim().max(500).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  decision: z.string().trim().max(40).optional(),
  reviewNotes: z.string().trim().max(1000).optional(),
  schoolCode: z.string().trim().max(20).optional(),
  board: z.string().trim().max(60).optional(),
});
export type UpdateAffiliateRequestInput = z.infer<typeof updateAffiliateRequestSchema>;

// ── Verify career sources ─────────────────────────────────────────────────

export const verifyCareerSourcesSchema = z.object({
  careerId: z.string().trim().max(120).optional(),
  maxToCheck: z.number().int().min(1).max(500).optional(),
  fixBroken: z.boolean().optional(),
  persistIssues: z.boolean().optional(),
});
export type VerifyCareerSourcesInput = z.infer<typeof verifyCareerSourcesSchema>;
