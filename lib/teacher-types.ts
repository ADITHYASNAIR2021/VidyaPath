import type { MCQItem, RevisionWeek } from '@/lib/ai/validators';
import type { Subject } from '@/lib/data';

export type TeacherSectionCode = string;
export type TeacherStatus = 'active' | 'inactive';

export interface TeacherScope {
  id: string;
  teacherId: string;
  classLevel: 10 | 12;
  subject: Subject;
  section?: TeacherSectionCode;
  isActive: boolean;
  createdAt: string;
}

export interface TeacherProfile {
  id: string;
  phone: string;
  name: string;
  staffCode?: string;
  status: TeacherStatus;
  createdAt: string;
  updatedAt: string;
  scopes: TeacherScope[];
}

export interface TeacherSession {
  teacher: TeacherProfile;
  effectiveScopes: TeacherScope[];
}

export interface AdminSession {
  role: 'admin';
  issuedAt: number;
  expiresAt: number;
}

export type TeacherClassPreset = 'class10-science' | 'class12-pcm' | 'class12-pcb' | 'custom';

export interface TeacherAnnouncement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface TeacherFormulaDrillItem {
  name: string;
  latex?: string;
}

export interface TeacherQuestionMeta {
  maxMarks: number;
  rubric?: string;
  imageUrl?: string;
}

export interface TeacherRegenerationFeedback {
  id: string;
  feedback: string;
  createdAt: string;
  createdByTeacherId: string;
}

export type TeacherPackStatus = 'draft' | 'review' | 'published' | 'archived';

export interface TeacherAssignmentPack {
  packId: string;
  title: string;
  chapterId: string;
  classLevel: 10 | 12;
  subject: string;
  section?: string;
  portion?: string;
  questionCount: number;
  difficultyMix: string;
  dueDate?: string;
  includeShortAnswers: boolean;
  includeFormulaDrill: boolean;
  mcqs: MCQItem[];
  shortAnswers: string[];
  longAnswers: string[];
  formulaDrill: TeacherFormulaDrillItem[];
  commonMistakes: string[];
  answerKey: number[];
  questionMeta?: Record<string, TeacherQuestionMeta>;
  estimatedTimeMinutes: number;
  shareUrl: string;
  printUrl: string;
  createdAt: string;
  updatedAt: string;
  createdByKeyId: string;
  status: TeacherPackStatus;
  feedbackHistory?: TeacherRegenerationFeedback[];
  approvedByTeacherId?: string;
  approvedAt?: string;
  publishedAt?: string;
}

export interface TeacherSubmissionAnswer {
  questionNo: string;
  answerText: string;
}

export type TeacherQuestionKind = 'mcq' | 'short' | 'long';
export type TeacherQuestionVerdict = 'correct' | 'partial' | 'wrong' | 'unanswered';

export interface TeacherQuestionResult {
  questionNo: string;
  kind: TeacherQuestionKind;
  prompt: string;
  studentAnswer: string;
  expectedAnswer?: string;
  verdict: TeacherQuestionVerdict;
  scoreAwarded: number;
  maxScore: number;
  feedback: string;
}

export interface TeacherSubmissionAttemptDetail {
  questionResults: TeacherQuestionResult[];
  correctCount: number;
  wrongCount: number;
  partialCount: number;
  unansweredCount: number;
  attemptNo: number;
  submittedAt: string;
}

export interface TeacherQuestionGrade {
  questionNo: string;
  scoreAwarded: number;
  maxScore: number;
  feedback?: string;
}

export interface TeacherSubmissionGrading {
  gradedByTeacherId: string;
  gradedAt: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  questionGrades: TeacherQuestionGrade[];
}

export type TeacherSubmissionStatus = 'pending_review' | 'graded' | 'released';

export interface ExamIntegritySummary {
  riskLevel: 'low' | 'medium' | 'high';
  totalViolations: number;
  violationCounts: Record<string, number>;
  lastViolationAt?: string;
}

export interface TeacherSubmissionResult {
  scoreEstimate: number;
  mistakes: string[];
  weakTopics: string[];
  nextActions: string[];
  attemptDetail?: TeacherSubmissionAttemptDetail;
  integritySummary?: ExamIntegritySummary;
}

export interface TeacherSubmission extends TeacherSubmissionResult {
  submissionId: string;
  packId: string;
  studentName: string;
  studentId?: string;
  submissionCode: string;
  attemptNo: number;
  answers: TeacherSubmissionAnswer[];
  createdAt: string;
  status: TeacherSubmissionStatus;
  grading?: TeacherSubmissionGrading;
  releasedAt?: string;
}

export interface TeacherQuestionStat {
  questionNo: string;
  prompt: string;
  kind: TeacherQuestionKind;
  attempts: number;
  correct: number;
  partial: number;
  wrong: number;
  unanswered: number;
  accuracyPercent: number;
}

export interface TeacherSubmissionTrendPoint {
  label: string;
  score: number;
  submittedAt: string;
}

export interface TeacherSubmissionAttemptRow {
  submissionId: string;
  studentName: string;
  studentId?: string;
  submissionCode: string;
  scoreEstimate: number;
  attemptNo: number;
  correctCount: number;
  wrongCount: number;
  partialCount: number;
  unansweredCount: number;
  submittedAt: string;
  weakTopics: string[];
  mistakes: string[];
  integritySummary?: ExamIntegritySummary;
  wrongQuestionNos: string[];
  partialQuestionNos: string[];
  unansweredQuestionNos: string[];
  status: TeacherSubmissionStatus;
  grading?: TeacherSubmissionGrading;
  releasedAt?: string;
}

export interface TeacherSubmissionSummary {
  attempts: number;
  averageScore: number;
  topMistakes: Array<{ item: string; count: number }>;
  weakTopics: Array<{ topic: string; count: number }>;
  recommendedNextChapterIds: string[];
  attemptsByStudent: TeacherSubmissionAttemptRow[];
  questionStats: TeacherQuestionStat[];
  scoreTrend: TeacherSubmissionTrendPoint[];
  pendingReviewCount: number;
  gradedCount: number;
  releasedCount: number;
}

export interface TeacherWeeklyPlan {
  planId: string;
  title: string;
  classPreset: TeacherClassPreset;
  classLevel: 10 | 12;
  subject?: string;
  focusChapterIds: string[];
  planWeeks: RevisionWeek[];
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  createdByKeyId: string;
  status: 'active' | 'archived';
}

export interface TeacherActionHistoryEntry {
  id: string;
  action:
    | 'create-teacher'
    | 'update-teacher'
    | 'add-scope'
    | 'remove-scope'
    | 'reset-pin'
    | 'create-student'
    | 'update-student'
    | 'set-important-topics'
    | 'set-quiz-link'
    | 'add-announcement'
    | 'remove-announcement'
    | 'create-assignment-pack'
    | 'regenerate-assignment-pack'
    | 'approve-assignment-pack'
    | 'publish-assignment-pack'
    | 'archive-assignment-pack'
    | 'add-submission'
    | 'grade-submission'
    | 'release-submission';
  chapterId?: string;
  packId?: string;
  planId?: string;
  keyId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface TeacherPackPerformance {
  packId: string;
  title: string;
  attempts: number;
  averageScore: number;
  lastSubmissionAt?: string;
}

export interface TeacherAssignmentAnalytics {
  updatedAt: string;
  totalPacks: number;
  activePacks: number;
  submissionsThisWeek: number;
  assignmentsCompletedThisWeek: number;
  topWeakTopics: Array<{ topic: string; count: number }>;
  weakTopicHeatmap: Array<{ topic: string; count: number }>;
  packPerformance: TeacherPackPerformance[];
}

export interface TeacherScopeFeedItemBase {
  chapterId?: string;
  classLevel: 10 | 12;
  subject: Subject;
  section?: string;
  updatedAt: string;
}

export interface TeacherScopeQuizLink extends TeacherScopeFeedItemBase {
  chapterId: string;
  url: string;
}

export interface TeacherScopeImportantTopics extends TeacherScopeFeedItemBase {
  chapterId: string;
  topics: string[];
}

export interface TeacherScopeAnnouncement extends TeacherScopeFeedItemBase {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface TeacherScopeAssignmentPack extends TeacherScopeFeedItemBase {
  chapterId: string;
  packId: string;
  title: string;
  portion?: string;
  dueDate?: string;
  questionCount: number;
  estimatedTimeMinutes: number;
  teacherName?: string;
  status: TeacherPackStatus;
  shareUrl: string;
}

export interface TeacherScopeFeed {
  quizLinks: TeacherScopeQuizLink[];
  importantTopics: TeacherScopeImportantTopics[];
  announcements: TeacherScopeAnnouncement[];
  assignmentPacks: TeacherScopeAssignmentPack[];
}

export interface TeacherStorageStatus {
  mode: 'connected' | 'degraded';
  canWrite: boolean;
  message: string;
  checkedAt: string;
}

export interface PublicTeacherConfig {
  updatedAt: string;
  importantTopics: Record<string, string[]>;
  quizLinks: Record<string, string>;
  announcements: TeacherAnnouncement[];
  weeklyPlans?: TeacherWeeklyPlan[];
  scopeFeed?: TeacherScopeFeed;
  storageStatus?: TeacherStorageStatus;
}

export interface ExamSession {
  sessionId: string;
  packId: string;
  studentName: string;
  submissionCode: string;
  studentId?: string;
  status: 'active' | 'submitted' | 'abandoned';
  startedAt: string;
  lastHeartbeatAt?: string;
}

export interface ExamViolationEvent {
  type:
    | 'fullscreen-exit'
    | 'tab-hidden'
    | 'window-blur'
    | 'copy-attempt'
    | 'paste-attempt'
    | 'context-menu'
    | 'key-shortcut';
  occurredAt: string;
  detail?: string;
}

export interface StudentProfile {
  id: string;
  schoolId?: string;
  name: string;
  rollNo?: string;
  batch?: string;
  rollCode: string;
  classLevel: 10 | 12;
  section?: string;
  status: 'active' | 'inactive';
  hasPin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudentSession {
  studentId: string;
  studentName: string;
  rollCode: string;
  classLevel: 10 | 12;
  section?: string;
}

export interface SheetsIntegrationSettings {
  endpointUrl: string;
  secret: string;
  enabled: boolean;
  updatedAt: string;
}

export interface SheetsSyncStatus {
  configured: boolean;
  enabled: boolean;
  lastExportAt?: string;
  lastImportAt?: string;
  message?: string;
}

export interface TeacherQuestionBankItem {
  id: string;
  teacherId: string;
  chapterId: string;
  classLevel: 10 | 12;
  subject: Subject;
  section?: string;
  kind: TeacherQuestionKind;
  prompt: string;
  options?: string[];
  answerIndex?: number;
  rubric?: string;
  maxMarks: number;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}
