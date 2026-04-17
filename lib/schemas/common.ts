/**
 * Catch-all permissive schema for route bodies whose shape is dynamic or too
 * complex for a tight zod definition. Guarantees:
 *
 * 1. Body is a JSON object (not array/primitive/null).
 * 2. Passes through all keys so downstream normalization continues.
 *
 * Prefer a tight schema whenever the route body is well-known — this is a
 * migration fallback, not a blessing for permissive input at the boundary.
 */
import { z } from 'zod';

export const permissiveObjectSchema = z.object({}).passthrough();
export type PermissiveObject = z.infer<typeof permissiveObjectSchema>;
