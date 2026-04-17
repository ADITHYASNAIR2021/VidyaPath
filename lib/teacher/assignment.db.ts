/**
 * Teacher assignment & submission domain — thin re-export barrel.
 *
 * Source of truth: lib/teacher-admin-db.ts (pending full DDD extract).
 * New callers should import from this path.
 *
 * Functions covered:
 *   upsertAssignmentPack, getAssignmentPack, getTeacherPackOwnerId,
 *   getAssignmentPackSchoolId, canTeacherAccessAssignmentPack,
 *   updateAssignmentPackStatus, updateAssignmentPackLifecycle,
 *   listTeacherQuestionBank, createTeacherQuestionBankItem,
 *   updateTeacherQuestionBankItem, deleteTeacherQuestionBankItem,
 *   publishWeeklyPlan, archiveWeeklyPlan,
 *   addSubmission, getSubmissionSummary, getTeacherSubmissionSummary,
 *   getStudentSubmissionResults, gradeSubmission, releaseSubmissionResults,
 *   setImportantTopics, setQuizLink, addAnnouncement, removeAnnouncement,
 *   getPublicTeacherConfig, getPrivateTeacherConfig, PrivateTeacherConfig
 */
export {
  // Config / scope feed
  getPublicTeacherConfig,
  getPrivateTeacherConfig,
  type PrivateTeacherConfig,
  setImportantTopics,
  setQuizLink,
  addAnnouncement,
  removeAnnouncement,
  // Packs
  upsertAssignmentPack,
  getAssignmentPack,
  getTeacherPackOwnerId,
  getAssignmentPackSchoolId,
  canTeacherAccessAssignmentPack,
  updateAssignmentPackStatus,
  updateAssignmentPackLifecycle,
  // Question bank
  listTeacherQuestionBank,
  createTeacherQuestionBankItem,
  updateTeacherQuestionBankItem,
  deleteTeacherQuestionBankItem,
  // Weekly plans
  publishWeeklyPlan,
  archiveWeeklyPlan,
  // Submissions
  addSubmission,
  getSubmissionSummary,
  getTeacherSubmissionSummary,
  getStudentSubmissionResults,
  gradeSubmission,
  releaseSubmissionResults,
} from '@/lib/teacher-admin-db';
