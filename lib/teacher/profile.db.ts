/**
 * Teacher profile domain — thin re-export barrel.
 *
 * Source of truth: lib/teacher-admin-db.ts (pending full DDD extract).
 * New callers should import from this path; migrated callers can update
 * imports incrementally without requiring a flag day.
 *
 * Functions covered:
 *   listTeachers, getTeacherById, getTeacherSessionById,
 *   authenticateTeacher, authenticateTeacherByIdentifier,
 *   createTeacher, updateTeacher,
 *   addTeacherScope, deleteTeacherScope, resetTeacherPin,
 *   resolveTeacherScopeForChapter,
 *   logTeacherActivity
 */
export {
  logTeacherActivity,
  listTeachers,
  getTeacherById,
  getTeacherSessionById,
  authenticateTeacher,
  authenticateTeacherByIdentifier,
  createTeacher,
  updateTeacher,
  addTeacherScope,
  deleteTeacherScope,
  resetTeacherPin,
  resolveTeacherScopeForChapter,
} from '@/lib/teacher-admin-db';
