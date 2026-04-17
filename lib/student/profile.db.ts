/**
 * Student profile domain — thin re-export barrel.
 *
 * Source of truth: lib/teacher-admin-db.ts (pending full DDD extract).
 * New callers should import from this path.
 *
 * Functions covered:
 *   listStudents, getStudentById, getStudentByRollCode,
 *   findStudentsByRollNo, createStudent, updateStudent,
 *   authenticateStudent, authenticateStudentByRollNo,
 *   markStudentPasswordChangeCompleted
 */
export {
  listStudents,
  getStudentById,
  getStudentByRollCode,
  findStudentsByRollNo,
  createStudent,
  updateStudent,
  authenticateStudent,
  authenticateStudentByRollNo,
  markStudentPasswordChangeCompleted,
} from '@/lib/teacher-admin-db';
