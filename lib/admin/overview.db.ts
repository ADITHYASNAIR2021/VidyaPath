/**
 * Admin overview domain — thin re-export barrel.
 *
 * Source of truth: lib/teacher-admin-db.ts (pending full DDD extract).
 * New callers should import from this path.
 *
 * Functions covered:
 *   getAdminOverview
 */
export { getAdminOverview } from '@/lib/teacher-admin-db';
