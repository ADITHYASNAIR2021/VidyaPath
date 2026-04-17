/**
 * Typed Zod schemas for Google Sheets integration routes.
 * Routes: /api/integrations/sheets/import
 *         /api/integrations/sheets/export
 */
import { z } from 'zod';

// ── Import from Sheets ────────────────────────────────────────────────────

export const sheetsImportSchema = z.object({
  spreadsheetId: z.string().trim().min(1).max(200),
  sheetName: z.string().trim().max(100).optional(),
  range: z.string().trim().max(100).optional(),
  classLevel: z.union([z.literal(10), z.literal(12)]).optional(),
  section: z.string().trim().max(40).optional(),
  batch: z.string().trim().max(40).optional(),
  dryRun: z.boolean().optional(),
  updateExisting: z.boolean().optional(),
});
export type SheetsImportInput = z.infer<typeof sheetsImportSchema>;

// ── Export to Sheets ──────────────────────────────────────────────────────

export const sheetsExportSchema = z.object({
  spreadsheetId: z.string().trim().min(1).max(200).optional(),
  sheetName: z.string().trim().max(100).optional(),
  exportType: z.enum(['students', 'attendance', 'results', 'analytics']).optional(),
  classLevel: z.union([z.literal(10), z.literal(12)]).optional(),
  section: z.string().trim().max(40).optional(),
  packId: z.string().trim().max(120).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createNew: z.boolean().optional(),
});
export type SheetsExportInput = z.infer<typeof sheetsExportSchema>;
