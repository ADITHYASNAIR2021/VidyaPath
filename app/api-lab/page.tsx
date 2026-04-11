'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Play, RefreshCcw, Search, ShieldAlert, Terminal } from 'lucide-react';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type AuthScope = 'none' | 'student' | 'teacher' | 'admin' | 'developer' | 'mixed';

interface EndpointPreset {
  id: string;
  group: string;
  name: string;
  description: string;
  method: HttpMethod;
  path: string;
  auth: AuthScope;
  sampleBody?: unknown;
}

interface RunnerState {
  path: string;
  body: string;
  running: boolean;
  status: number | null;
  durationMs: number | null;
  responseText: string;
  error: string;
  executedAt: string;
}

const METHOD_CLASS: Record<HttpMethod, string> = {
  GET: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  POST: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PATCH: 'bg-amber-50 text-amber-700 border-amber-200',
  DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
};

const AUTH_LABEL: Record<AuthScope, string> = {
  none: 'Public',
  student: 'Student session',
  teacher: 'Teacher session',
  admin: 'Admin session',
  developer: 'Developer session',
  mixed: 'Role-dependent',
};

const ENDPOINTS: EndpointPreset[] = [
  {
    id: 'ai-tutor',
    group: 'Student AI',
    name: 'AI Tutor',
    description: 'Chapter-aware tutor response.',
    method: 'POST',
    path: '/api/ai-tutor',
    auth: 'student',
    sampleBody: {
      messages: [{ role: 'user', content: 'Explain Nernst equation with one solved example.' }],
      chapterContext: {
        chapterId: 'c12-chem-2',
        title: 'Electrochemistry',
        subject: 'Chemistry',
        classLevel: 12,
        topics: ['Nernst Equation', 'Cell Potential'],
      },
    },
  },
  {
    id: 'generate-quiz',
    group: 'Student AI',
    name: 'Generate Quiz',
    description: 'Chapter MCQ generation.',
    method: 'POST',
    path: '/api/generate-quiz',
    auth: 'student',
    sampleBody: { chapterId: 'c12-chem-2', questionCount: 10, difficulty: 'mixed' },
  },
  {
    id: 'generate-flashcards',
    group: 'Student AI',
    name: 'Generate Flashcards',
    description: 'Chapter flashcard generation.',
    method: 'POST',
    path: '/api/generate-flashcards',
    auth: 'student',
    sampleBody: { chapterId: 'c12-chem-2', subject: 'Chemistry', chapterTitle: 'Electrochemistry' },
  },
  {
    id: 'image-solve',
    group: 'Student AI',
    name: 'Image Solve',
    description: 'Gemini vision question solver.',
    method: 'POST',
    path: '/api/image-solve',
    auth: 'student',
    sampleBody: {
      imageBase64: '<paste-base64-here>',
      mimeType: 'image/jpeg',
      prompt: 'Solve step by step for Class 12 boards.',
      classLevel: 12,
      subject: 'Chemistry',
    },
  },
  {
    id: 'chapter-pack',
    group: 'Chapter Intelligence',
    name: 'Chapter Pack',
    description: 'High-yield chapter analysis.',
    method: 'POST',
    path: '/api/chapter-pack',
    auth: 'student',
    sampleBody: { chapterId: 'c12-chem-2' },
  },
  {
    id: 'chapter-drill',
    group: 'Chapter Intelligence',
    name: 'Chapter Drill',
    description: 'Question drill generation.',
    method: 'POST',
    path: '/api/chapter-drill',
    auth: 'student',
    sampleBody: { chapterId: 'c12-chem-2', questionCount: 12, difficulty: 'hard-heavy' },
  },
  {
    id: 'chapter-diagnose',
    group: 'Chapter Intelligence',
    name: 'Chapter Diagnose',
    description: 'Weakness diagnosis.',
    method: 'POST',
    path: '/api/chapter-diagnose',
    auth: 'student',
    sampleBody: {
      chapterId: 'c12-chem-2',
      quizScore: 58,
      flashcardsDue: 6,
      studied: true,
      bookmarked: true,
      recentMistakes: ['Used wrong sign in Nernst equation'],
    },
  },
  {
    id: 'chapter-remediate',
    group: 'Chapter Intelligence',
    name: 'Chapter Remediate',
    description: '7-day corrective plan.',
    method: 'POST',
    path: '/api/chapter-remediate',
    auth: 'student',
    sampleBody: {
      chapterId: 'c12-chem-2',
      weakTags: ['Low Quiz Accuracy', 'High Recall Debt'],
      availableDays: 7,
      dailyMinutes: 45,
    },
  },
  {
    id: 'context-pack',
    group: 'Chapter Intelligence',
    name: 'Context Pack',
    description: 'Context retriever debug endpoint.',
    method: 'POST',
    path: '/api/context-pack',
    auth: 'student',
    sampleBody: {
      classLevel: 12,
      subject: 'Chemistry',
      chapterId: 'c12-chem-2',
      chapterTopics: ['Nernst equation', 'Cell potential'],
      query: 'high yield electrochemistry revision',
      task: 'chapter-pack',
    },
  },
  {
    id: 'adaptive-test',
    group: 'Assessment AI',
    name: 'Adaptive Test',
    description: 'Weak-area mixed test generation.',
    method: 'POST',
    path: '/api/adaptive-test',
    auth: 'student',
    sampleBody: {
      classLevel: 12,
      subject: 'Chemistry',
      chapterIds: ['c12-chem-2', 'c12-chem-12'],
      difficultyMix: '40% easy, 40% medium, 20% hard',
      questionCount: 10,
      mode: 'board-practice',
    },
  },
  {
    id: 'revision-plan',
    group: 'Assessment AI',
    name: 'Revision Plan',
    description: 'Exam-date aware revision planner.',
    method: 'POST',
    path: '/api/revision-plan',
    auth: 'student',
    sampleBody: {
      classLevel: 12,
      subject: 'Chemistry',
      weeklyHours: 8,
      examDate: '2026-03-15',
      weakChapterIds: ['c12-chem-2', 'c12-chem-12'],
      targetScore: 85,
    },
  },
  {
    id: 'paper-evaluate',
    group: 'Assessment AI',
    name: 'Paper Evaluate',
    description: 'Answer quality estimate from submitted text.',
    method: 'POST',
    path: '/api/paper-evaluate',
    auth: 'student',
    sampleBody: {
      paperId: 'b12-chem-2024-d',
      classLevel: 12,
      subject: 'Chemistry',
      answers: [
        { questionNo: 'Q1', answerText: 'Defined galvanic cell and electron flow.' },
        { questionNo: 'Q2', answerText: 'Applied Nernst equation.' },
      ],
    },
  },
  {
    id: 'teacher-feed-get',
    group: 'Teacher Core',
    name: 'Teacher Feed (Chapter)',
    description: 'Public chapter-level teacher feed with scope merge.',
    method: 'GET',
    path: '/api/teacher?chapterId=c12-chem-2&classLevel=12&subject=Chemistry',
    auth: 'mixed',
  },
  {
    id: 'teacher-feed-post',
    group: 'Teacher Core',
    name: 'Teacher Feed Mutation',
    description: 'Create teacher updates for chapter feed.',
    method: 'POST',
    path: '/api/teacher',
    auth: 'teacher',
    sampleBody: {
      chapterId: 'c12-chem-2',
      action: 'set-important-topics',
      section: 'A',
      topics: ['Nernst equation', 'Electrolysis'],
    },
  },
  {
    id: 'teacher-assignment-create',
    group: 'Teacher Core',
    name: 'Assignment Pack Draft',
    description: 'Generate or update draft assignment.',
    method: 'POST',
    path: '/api/teacher/assignment-pack',
    auth: 'teacher',
    sampleBody: {
      chapterId: 'c12-chem-2',
      classLevel: 12,
      subject: 'Chemistry',
      questionCount: 12,
      difficultyMix: '40% easy, 40% medium, 20% hard',
      includeShortAnswers: true,
      includeFormulaDrill: true,
      section: 'A',
      dueDate: '2026-04-20',
    },
  },
  {
    id: 'teacher-assignment-get',
    group: 'Teacher Core',
    name: 'Assignment Pack Read',
    description: 'Read assignment by id (teacher/student scoped).',
    method: 'GET',
    path: '/api/teacher/assignment-pack?id=<packId>',
    auth: 'mixed',
  },
  {
    id: 'teacher-assignment-regenerate',
    group: 'Teacher Core',
    name: 'Assignment Regenerate',
    description: 'Regenerate draft using teacher feedback.',
    method: 'POST',
    path: '/api/teacher/assignment-pack/regenerate',
    auth: 'teacher',
    sampleBody: { packId: '<packId>', feedback: 'Increase numericals, reduce ambiguous wording.' },
  },
  {
    id: 'teacher-assignment-approve',
    group: 'Teacher Core',
    name: 'Assignment Approve',
    description: 'Approve draft before publish.',
    method: 'POST',
    path: '/api/teacher/assignment-pack/approve',
    auth: 'teacher',
    sampleBody: { packId: '<packId>' },
  },
  {
    id: 'teacher-assignment-publish',
    group: 'Teacher Core',
    name: 'Assignment Publish',
    description: 'Publish approved pack to students.',
    method: 'POST',
    path: '/api/teacher/assignment-pack/publish',
    auth: 'teacher',
    sampleBody: { packId: '<packId>' },
  },
  {
    id: 'teacher-assignment-archive',
    group: 'Teacher Core',
    name: 'Assignment Archive',
    description: 'Archive existing pack.',
    method: 'POST',
    path: '/api/teacher/assignment-pack/archive',
    auth: 'teacher',
    sampleBody: { packId: '<packId>' },
  },
  {
    id: 'teacher-question-item-create',
    group: 'Teacher Core',
    name: 'Question Builder Create',
    description: 'Create manual question-bank item.',
    method: 'POST',
    path: '/api/teacher/question-bank/item',
    auth: 'teacher',
    sampleBody: {
      chapterId: 'c12-chem-2',
      kind: 'mcq',
      prompt: 'Which equation is used to compute cell potential under non-standard conditions?',
      options: ['Arrhenius equation', 'Nernst equation', 'Van der Waals equation', 'Clausius equation'],
      answerIndex: 1,
      maxMarks: 1,
      rubric: 'Full marks only for correct option.',
      imageUrl: '',
    },
  },
  {
    id: 'teacher-question-item-list',
    group: 'Teacher Core',
    name: 'Question Builder List',
    description: 'List manual question-bank items.',
    method: 'GET',
    path: '/api/teacher/question-bank/item?chapterId=c12-chem-2',
    auth: 'teacher',
  },
  {
    id: 'teacher-question-item-patch',
    group: 'Teacher Core',
    name: 'Question Builder Update',
    description: 'Update manual question-bank item.',
    method: 'PATCH',
    path: '/api/teacher/question-bank/item/<itemId>',
    auth: 'teacher',
    sampleBody: { prompt: 'Updated question text', maxMarks: 2 },
  },
  {
    id: 'teacher-question-item-delete',
    group: 'Teacher Core',
    name: 'Question Builder Delete',
    description: 'Delete manual question-bank item.',
    method: 'DELETE',
    path: '/api/teacher/question-bank/item/<itemId>',
    auth: 'teacher',
  },
  {
    id: 'teacher-submission',
    group: 'Teacher Evaluation',
    name: 'Student Submission',
    description: 'Submit student attempt for a pack.',
    method: 'POST',
    path: '/api/teacher/submission',
    auth: 'student',
    sampleBody: {
      packId: '<packId>',
      answers: [
        { questionNo: 'Q1', answerText: 'My answer 1' },
        { questionNo: 'Q2', answerText: 'My answer 2' },
      ],
    },
  },
  {
    id: 'teacher-submission-grade',
    group: 'Teacher Evaluation',
    name: 'Submission Grade',
    description: 'Teacher manual grading per question.',
    method: 'POST',
    path: '/api/teacher/submission/grade',
    auth: 'teacher',
    sampleBody: {
      submissionId: '<submissionId>',
      questionGrades: [
        { questionNo: 'Q1', scoreAwarded: 1, maxScore: 1, feedback: 'Good' },
        { questionNo: 'Q2', scoreAwarded: 3, maxScore: 5, feedback: 'Need clearer final step' },
      ],
    },
  },
  {
    id: 'teacher-submission-release',
    group: 'Teacher Evaluation',
    name: 'Release Results',
    description: 'Publish graded results for a pack.',
    method: 'POST',
    path: '/api/teacher/submission/release-results',
    auth: 'teacher',
    sampleBody: { packId: '<packId>' },
  },
  {
    id: 'teacher-summary',
    group: 'Teacher Evaluation',
    name: 'Submission Summary',
    description: 'Teacher performance dashboard for a pack.',
    method: 'GET',
    path: '/api/teacher/submission-summary?packId=<packId>',
    auth: 'teacher',
  },
  {
    id: 'exam-start',
    group: 'Exam Mode',
    name: 'Exam Session Start',
    description: 'Begin proctored-lite exam session.',
    method: 'POST',
    path: '/api/exam/session/start',
    auth: 'student',
    sampleBody: { packId: '<packId>' },
  },
  {
    id: 'exam-heartbeat',
    group: 'Exam Mode',
    name: 'Exam Session Heartbeat',
    description: 'Send integrity events during exam.',
    method: 'POST',
    path: '/api/exam/session/heartbeat',
    auth: 'student',
    sampleBody: {
      sessionId: '<sessionId>',
      events: [{ type: 'tab-hidden', occurredAt: '2026-04-09T10:00:00.000Z', detail: 'Visibility changed' }],
    },
  },
  {
    id: 'exam-submit',
    group: 'Exam Mode',
    name: 'Exam Session Submit',
    description: 'Submit answers and end exam session.',
    method: 'POST',
    path: '/api/exam/session/submit',
    auth: 'student',
    sampleBody: {
      sessionId: '<sessionId>',
      answers: [{ questionNo: 'Q1', answerText: 'Answer here' }],
    },
  },
  {
    id: 'student-login',
    group: 'Student Session',
    name: 'Student Login',
    description: 'Roster-based student login.',
    method: 'POST',
    path: '/api/student/session/login',
    auth: 'none',
    sampleBody: {
      schoolCode: 'VIDYAPATH-001',
      classLevel: 12,
      section: 'A',
      batch: '2026',
      rollNo: '23',
      password: 'Student@123',
    },
  },
  {
    id: 'student-me',
    group: 'Student Session',
    name: 'Student Session Me',
    description: 'Current student session details.',
    method: 'GET',
    path: '/api/student/session/me',
    auth: 'student',
  },
  {
    id: 'student-logout',
    group: 'Student Session',
    name: 'Student Logout',
    description: 'End student session.',
    method: 'POST',
    path: '/api/student/session/logout',
    auth: 'student',
  },
  {
    id: 'student-results',
    group: 'Student Session',
    name: 'Student Submission Results',
    description: 'Read released results for own attempts.',
    method: 'GET',
    path: '/api/student/submission-results?packId=<packId>',
    auth: 'student',
  },
  {
    id: 'teacher-login',
    group: 'Teacher Session',
    name: 'Teacher Login',
    description: 'School scoped teacher login.',
    method: 'POST',
    path: '/api/teacher/session/login',
    auth: 'none',
    sampleBody: { schoolCode: 'VIDYAPATH-001', identifier: '9876543210', password: 'Teacher@123' },
  },
  {
    id: 'teacher-me',
    group: 'Teacher Session',
    name: 'Teacher Session Me',
    description: 'Current teacher profile + scopes.',
    method: 'GET',
    path: '/api/teacher/session/me',
    auth: 'teacher',
  },
  {
    id: 'teacher-logout',
    group: 'Teacher Session',
    name: 'Teacher Logout',
    description: 'End teacher session.',
    method: 'POST',
    path: '/api/teacher/session/logout',
    auth: 'teacher',
  },
  {
    id: 'admin-bootstrap',
    group: 'Admin Session',
    name: 'Admin Bootstrap',
    description: 'Admin login using school credentials (key fallback supported).',
    method: 'POST',
    path: '/api/admin/session/bootstrap',
    auth: 'none',
      sampleBody: { schoolCode: 'SPS', identifier: 'SPS8136800901', password: 'A01#B1' },
  },
  {
    id: 'admin-me',
    group: 'Admin Session',
    name: 'Admin Session Me',
    description: 'Current admin session details.',
    method: 'GET',
    path: '/api/admin/session/me',
    auth: 'admin',
  },
  {
    id: 'admin-logout',
    group: 'Admin Session',
    name: 'Admin Logout',
    description: 'End admin session.',
    method: 'POST',
    path: '/api/admin/session/logout',
    auth: 'admin',
  },
  {
    id: 'admin-overview',
    group: 'Admin Control',
    name: 'Admin Overview',
    description: 'Global platform analytics overview.',
    method: 'GET',
    path: '/api/admin/overview',
    auth: 'admin',
  },
  {
    id: 'admin-teachers-list',
    group: 'Admin Control',
    name: 'Teachers List',
    description: 'List all teachers.',
    method: 'GET',
    path: '/api/admin/teachers',
    auth: 'admin',
  },
  {
    id: 'admin-teachers-create',
    group: 'Admin Control',
    name: 'Teacher Create',
    description: 'Create teacher + scopes.',
    method: 'POST',
    path: '/api/admin/teachers',
    auth: 'admin',
    sampleBody: {
      phone: '9876543210',
      name: 'Physics Teacher',
      pin: '1234',
      scopes: [
        { classLevel: 10, subject: 'Physics', section: 'A' },
        { classLevel: 12, subject: 'Physics', section: 'B' },
      ],
    },
  },
  {
    id: 'admin-teacher-patch',
    group: 'Admin Control',
    name: 'Teacher Update',
    description: 'Update teacher profile/status.',
    method: 'PATCH',
    path: '/api/admin/teachers/<teacherId>',
    auth: 'admin',
    sampleBody: { name: 'Updated Teacher Name', status: 'active' },
  },
  {
    id: 'admin-teacher-reset-pin',
    group: 'Admin Control',
    name: 'Teacher Reset PIN',
    description: 'Reset teacher login PIN.',
    method: 'POST',
    path: '/api/admin/teachers/<teacherId>/reset-pin',
    auth: 'admin',
    sampleBody: { pin: '5678' },
  },
  {
    id: 'admin-teacher-scope-add',
    group: 'Admin Control',
    name: 'Teacher Scope Add',
    description: 'Assign new scope to teacher.',
    method: 'POST',
    path: '/api/admin/teachers/<teacherId>/scopes',
    auth: 'admin',
    sampleBody: { classLevel: 12, subject: 'Chemistry', section: 'A' },
  },
  {
    id: 'admin-teacher-scope-delete',
    group: 'Admin Control',
    name: 'Teacher Scope Delete',
    description: 'Remove teacher scope.',
    method: 'DELETE',
    path: '/api/admin/teachers/<teacherId>/scopes/<scopeId>',
    auth: 'admin',
  },
  {
    id: 'admin-students-list',
    group: 'Admin Control',
    name: 'Students List',
    description: 'List enrolled students.',
    method: 'GET',
    path: '/api/admin/students',
    auth: 'admin',
  },
  {
    id: 'admin-students-create',
    group: 'Admin Control',
    name: 'Student Create',
    description: 'Create roster student.',
    method: 'POST',
    path: '/api/admin/students',
    auth: 'admin',
    sampleBody: { name: 'Adithya', rollCode: 'A1201', classLevel: 12, section: 'A', pin: '1234' },
  },
  {
    id: 'admin-student-patch',
    group: 'Admin Control',
    name: 'Student Update',
    description: 'Update enrolled student.',
    method: 'PATCH',
    path: '/api/admin/students/<studentId>',
    auth: 'admin',
    sampleBody: { section: 'B', status: 'active' },
  },
  {
    id: 'sheets-status',
    group: 'Integrations',
    name: 'Sheets Status',
    description: 'Bridge health and connectivity.',
    method: 'GET',
    path: '/api/integrations/sheets/status',
    auth: 'admin',
  },
  {
    id: 'sheets-export',
    group: 'Integrations',
    name: 'Sheets Export',
    description: 'Export tests/submissions/grades to master sheet.',
    method: 'POST',
    path: '/api/integrations/sheets/export',
    auth: 'admin',
    sampleBody: { mode: 'grades', packId: '<packId>' },
  },
  {
    id: 'sheets-import',
    group: 'Integrations',
    name: 'Sheets Import',
    description: 'Import grades from master sheet.',
    method: 'POST',
    path: '/api/integrations/sheets/import',
    auth: 'teacher',
    sampleBody: {
      rows: [
        {
          submissionId: '<submissionId>',
          packId: '<packId>',
          release: false,
          questionGrades: [
            { questionNo: 'Q1', scoreAwarded: 1, maxScore: 1, feedback: 'Good' },
            { questionNo: 'Q2', scoreAwarded: 3, maxScore: 5, feedback: 'Add final step' },
          ],
        },
      ],
    },
  },
  {
    id: 'developer-schools',
    group: 'Developer',
    name: 'Schools List',
    description: 'Platform-wide school registry.',
    method: 'GET',
    path: '/api/developer/schools',
    auth: 'developer',
  },
  {
    id: 'developer-usage',
    group: 'Developer',
    name: 'Token Usage Rollup',
    description: 'Cross-school token consumption details.',
    method: 'GET',
    path: '/api/developer/usage/tokens?limit=100',
    auth: 'developer',
  },
  {
    id: 'developer-audit',
    group: 'Developer',
    name: 'Audit Feed',
    description: 'Platform audit stream for role/activity/token events.',
    method: 'GET',
    path: '/api/developer/audit?limit=100',
    auth: 'developer',
  },
  {
    id: 'developer-school-create',
    group: 'Developer',
    name: 'Create School',
    description: 'Provision a new school tenant.',
    method: 'POST',
    path: '/api/developer/schools',
    auth: 'developer',
    sampleBody: {
      schoolName: 'VidyaPath Public School',
      schoolCode: 'VIDYAPATH-001',
      board: 'CBSE',
      city: 'Kochi',
      state: 'Kerala',
    },
  },
  {
    id: 'analytics-track',
    group: 'Platform',
    name: 'Analytics Track',
    description: 'Client event tracking endpoint.',
    method: 'POST',
    path: '/api/analytics/track',
    auth: 'none',
    sampleBody: { eventName: 'chapter_view', chapterId: 'c12-chem-2' },
  },
];

function hasBody(method: HttpMethod): boolean {
  return method === 'POST' || method === 'PATCH';
}

function toPretty(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function initialRunnerState(preset: EndpointPreset): RunnerState {
  return {
    path: preset.path,
    body: toPretty(preset.sampleBody),
    running: false,
    status: null,
    durationMs: null,
    responseText: '',
    error: '',
    executedAt: '',
  };
}

function getStatusClass(status: number | null): string {
  if (status === null) return 'text-[#6B6780]';
  if (status >= 200 && status < 300) return 'text-emerald-700';
  if (status >= 400 && status < 500) return 'text-amber-700';
  return 'text-rose-700';
}

export default function ApiLabPage() {
  const [query, setQuery] = useState('');
  const [stateById, setStateById] = useState<Record<string, RunnerState>>(() =>
    Object.fromEntries(ENDPOINTS.map((preset) => [preset.id, initialRunnerState(preset)]))
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return ENDPOINTS;
    return ENDPOINTS.filter((preset) =>
      [preset.name, preset.path, preset.group, preset.description].join(' ').toLowerCase().includes(term)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, EndpointPreset[]>();
    for (const item of filtered) {
      const bucket = map.get(item.group) ?? [];
      bucket.push(item);
      map.set(item.group, bucket);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function updateState(id: string, partial: Partial<RunnerState>) {
    setStateById((current) => ({
      ...current,
      [id]: { ...current[id], ...partial },
    }));
  }

  function resetPreset(preset: EndpointPreset) {
    updateState(preset.id, initialRunnerState(preset));
  }

  async function runPreset(preset: EndpointPreset) {
    const current = stateById[preset.id];
    if (!current) return;

    updateState(preset.id, { running: true, error: '' });
    const started = Date.now();
    try {
      let requestBody: string | undefined;
      if (hasBody(preset.method)) {
        const raw = current.body.trim();
        if (raw) {
          JSON.parse(raw);
          requestBody = raw;
        }
      }

      const response = await fetch(current.path, {
        method: preset.method,
        headers: requestBody ? { 'Content-Type': 'application/json' } : undefined,
        body: requestBody,
        credentials: 'include',
      });
      const rawText = await response.text();
      let parsed: unknown = rawText;
      if (rawText) {
        try {
          parsed = JSON.parse(rawText);
        } catch {
          parsed = rawText;
        }
      }
      updateState(preset.id, {
        running: false,
        status: response.status,
        durationMs: Date.now() - started,
        responseText: toPretty(parsed),
        executedAt: new Date().toLocaleString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      updateState(preset.id, {
        running: false,
        status: null,
        durationMs: Date.now() - started,
        responseText: '',
        error: message,
        executedAt: new Date().toLocaleString(),
      });
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <section className="rounded-3xl border border-[#E8E4DC] bg-white px-6 py-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-11 h-11 rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-fraunces text-3xl font-bold text-navy-700">API Lab</h1>
              <p className="text-sm text-[#5F5A73] mt-1">
                Run, inspect, and debug every implemented endpoint from one place.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              Requests run in your current browser session with cookies. Endpoints requiring teacher/admin/student auth
              will return `401`/`403` until you login from the matching portal.
            </div>
          </div>
          <div className="mt-4 relative">
            <Search className="w-4 h-4 text-[#8A8AAA] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search endpoint by name, path, or group..."
              className="w-full rounded-xl border border-[#E8E4DC] bg-white py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </section>

        {grouped.map(([group, presets]) => (
          <section key={group} className="space-y-3">
            <h2 className="font-fraunces text-2xl font-bold text-navy-700">{group}</h2>
            <div className="grid lg:grid-cols-2 gap-4">
              {presets.map((preset) => {
                const state = stateById[preset.id] ?? initialRunnerState(preset);
                const showBody = hasBody(preset.method);
                return (
                  <article key={preset.id} className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-navy-700">{preset.name}</h3>
                        <p className="text-xs text-[#6D6884] mt-0.5">{preset.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full border', METHOD_CLASS[preset.method])}>
                          {preset.method}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-1 rounded-full border border-[#DDD6F6] bg-[#F5F1FF] text-[#5B47B8]">
                          {AUTH_LABEL[preset.auth]}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-[#7A748F]">Path</label>
                      <input
                        value={state.path}
                        onChange={(event) => updateState(preset.id, { path: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-[#E8E4DC] px-3 py-2 text-xs font-mono text-[#24213B] focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>

                    {showBody && (
                      <div className="mt-3">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-[#7A748F]">
                          JSON Body
                        </label>
                        <textarea
                          value={state.body}
                          onChange={(event) => updateState(preset.id, { body: event.target.value })}
                          rows={8}
                          className="mt-1 w-full rounded-lg border border-[#E8E4DC] px-3 py-2 text-xs font-mono text-[#24213B] focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => void runPreset(preset)}
                        disabled={state.running}
                        className={clsx(
                          'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors',
                          state.running ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                        )}
                      >
                        <Play className="w-3.5 h-3.5" />
                        {state.running ? 'Running...' : 'Run'}
                      </button>
                      <button
                        onClick={() => resetPreset(preset)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E4DC] bg-white px-3 py-2 text-xs font-semibold text-[#5E5A74] hover:bg-[#F8F6F2]"
                      >
                        <RefreshCcw className="w-3.5 h-3.5" />
                        Reset
                      </button>
                    </div>

                    <div className="mt-3 rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={clsx('font-semibold', getStatusClass(state.status))}>
                          Status: {state.status ?? '-'}
                        </span>
                        <span className="text-[#6B6780]">Duration: {state.durationMs ?? '-'} ms</span>
                        <span className="text-[#6B6780]">Last run: {state.executedAt || '-'}</span>
                      </div>
                      {state.error && <p className="mt-2 text-rose-700 font-medium">Error: {state.error}</p>}
                      <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-[#EEE8DD] bg-white p-2 font-mono text-[11px] text-[#2D2942] whitespace-pre-wrap">
                        {state.responseText || 'No response yet.'}
                      </pre>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
