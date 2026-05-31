import { NextRequest } from 'next/server';
import { getChapterById } from '@/lib/data';
import { getContextPack } from '@/lib/ai/context-retriever';
import { generateTaskText } from '@/lib/ai/generator';
import { checkAiTokenBudget } from '@/lib/ai/token-budget';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { listTeacherGradebook } from '@/lib/school-ops-db';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { teacherAiRequestSchema } from '@/lib/schemas/ai';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { logServerEvent } from '@/lib/observability';

type ToolType =
  | 'worksheet'
  | 'lesson-plan'
  | 'question-paper'
  | 'weak-students'
  | 'remedial-set'
  | 'next-day-recap'
  | 'revision-sheet';

const TOOL_LABELS: Record<ToolType, string> = {
  worksheet: 'Practice Worksheet',
  'lesson-plan': 'Lesson Plan',
  'question-paper': 'Question Paper',
  'weak-students': 'Weak Student Snapshot',
  'remedial-set': 'Targeted Remedial Set',
  'next-day-recap': '15-Minute Recap',
  'revision-sheet': 'Mistake-to-Revision Sheet',
};

interface ClassroomSignalStudent {
  studentId: string | undefined;
  studentName: string;
  submissionCode: string;
  chapterAverage: number;
  attempts: number;
  releasedCount: number;
}

interface ClassroomSignals {
  weakStudents: ClassroomSignalStudent[];
  relevantPackCount: number;
  relevantStudentCount: number;
  averageScore: number;
  lowScoreCount: number;
  packTitles: string[];
  summary: string;
}

function buildTeacherAIPrompt(input: {
  type: ToolType;
  chapterTitle: string;
  subject: string;
  classLevel: number;
  topics: string[];
  questionCount: number;
  difficulty: string;
  customContext: string;
  classroomSignals?: ClassroomSignals;
}): { system: string; user: string } {
  const { type, chapterTitle, subject, classLevel, topics, questionCount, difficulty, customContext, classroomSignals } = input;
  const topicList = topics.slice(0, 10).join(', ');
  const ctxLine = customContext ? `\nAdditional teacher instructions: ${customContext}` : '';
  const diffLabel =
    difficulty === 'easy'
      ? 'foundation-level'
      : difficulty === 'hard'
        ? 'advanced HOTS-level'
        : difficulty === 'medium'
          ? 'standard CBSE-level'
          : 'mixed difficulty';
  const classroomLine = classroomSignals
    ? `\nCLASSROOM PERFORMANCE SIGNALS
${classroomSignals.summary}
Weak students: ${classroomSignals.weakStudents.map((student) => `${student.studentName} (${student.chapterAverage}%)`).join(', ') || 'none'}
Relevant packs: ${classroomSignals.packTitles.join(' | ') || 'none'}`
    : '';

  const system = `You are a senior CBSE curriculum expert and instructional coach for Class ${classLevel} ${subject}.
STRICT RULES:
1. Never use Markdown syntax. No asterisks, hashes, backticks, or underscores.
2. Use plain text only. Use ALL CAPS for section headers.
3. Use numbered lists and lettered sub-items for structure.
4. Stay tightly aligned to NCERT and board-exam expectations.
5. When classroom signals are provided, use them explicitly and do not invent extra student-performance facts.`;

  if (type === 'worksheet') {
    const mcqCount = Math.max(2, Math.round(questionCount * 0.4));
    const shortCount = Math.max(2, Math.round(questionCount * 0.4));
    const longCount = Math.max(1, questionCount - mcqCount - shortCount);
    return {
      system,
      user: `Create a ${diffLabel} CBSE practice worksheet for Class ${classLevel} ${subject}.
Chapter: ${chapterTitle}
Key Topics: ${topicList}${ctxLine}${classroomLine}

Use this exact structure:

PRACTICE WORKSHEET
Class ${classLevel} | ${subject} | ${chapterTitle}

LEARNING OBJECTIVES
Write 3 clear objectives.

SECTION A - MULTIPLE CHOICE QUESTIONS (1 mark each)
Write ${mcqCount} MCQs with four options each.

SECTION B - SHORT ANSWER QUESTIONS (2-3 marks each)
Write ${shortCount} questions.

SECTION C - LONG ANSWER QUESTIONS (5 marks each)
Write ${longCount} questions with sub-parts where useful.

ANSWER KEY
SECTION B and SECTION C should include concise model points.

KEY FORMULAS AND POINTS TO REMEMBER
List 4-6 chapter essentials.`,
    };
  }

  if (type === 'lesson-plan') {
    return {
      system,
      user: `Create a structured 45-minute lesson plan for Class ${classLevel} ${subject}.
Chapter: ${chapterTitle}
Key Topics: ${topicList}${ctxLine}${classroomLine}

Use this exact structure:

LESSON PLAN
Class ${classLevel} | ${subject} | ${chapterTitle}
Duration: 45 minutes | Difficulty: ${diffLabel}

LEARNING OBJECTIVES
1. [Objective]
2. [Objective]
3. [Objective]

PRIOR KNOWLEDGE REQUIRED
List 2-3 concepts students should already know.

MATERIALS AND RESOURCES
Textbook pages, diagrams, and equipment if needed.

LESSON FLOW
HOOK AND WARM-UP (5 minutes)
DIRECT INSTRUCTION (15 minutes)
GUIDED PRACTICE (10 minutes)
INDEPENDENT PRACTICE (10 minutes)
EXIT TICKET ASSESSMENT (5 minutes)

HOMEWORK ASSIGNMENT
DIFFERENTIATION TIPS
CBSE BOARD EXAM RELEVANCE`,
    };
  }

  if (type === 'question-paper') {
    const totalMarks = Math.max(20, questionCount);
    const secA = Math.floor(totalMarks * 0.2);
    const secB = Math.floor(totalMarks * 0.3);
    const secC = Math.floor(totalMarks * 0.3);
    const secD = totalMarks - secA - secB - secC;
    return {
      system,
      user: `Create a ${diffLabel} CBSE-format question paper for Class ${classLevel} ${subject}.
Chapter: ${chapterTitle}
Key Topics: ${topicList}${ctxLine}${classroomLine}
Total Marks: ${totalMarks}

Use this exact structure:

QUESTION PAPER
Class ${classLevel} | ${subject}
Chapter: ${chapterTitle}
Time Allowed: ${Math.round(totalMarks * 1.2)} minutes | Maximum Marks: ${totalMarks}

GENERAL INSTRUCTIONS
1. All questions are compulsory.
2. Internal choices are given where indicated.

SECTION A - OBJECTIVE TYPE (${secA} marks)
SECTION B - SHORT ANSWER I (${secB} marks)
SECTION C - SHORT ANSWER II (${secC} marks)
SECTION D - LONG ANSWER (${secD} marks)`,
    };
  }

  if (type === 'weak-students') {
    return {
      system,
      user: `Create a teacher-facing performance brief for Class ${classLevel} ${subject}.
Chapter: ${chapterTitle}
Key Topics: ${topicList}${ctxLine}${classroomLine}

Use this exact structure:

WEAK STUDENT SNAPSHOT
CHAPTER CONTEXT
AT-RISK STUDENTS
For each weak student, state the score signal and likely concept risk.
COMMON CLASS PATTERNS
NEXT ACTIONS FOR TOMORROW
PARENT OR FOLLOW-UP NOTE

Keep it specific, practical, and tied to the provided classroom signals.`,
    };
  }

  if (type === 'remedial-set') {
    return {
      system,
      user: `Create a tightly targeted remedial set for the weak-student cluster in Class ${classLevel} ${subject}.
Chapter: ${chapterTitle}
Key Topics: ${topicList}${ctxLine}${classroomLine}

Use this exact structure:

TARGETED REMEDIAL SET
WHO THIS IS FOR
FOCUS CONCEPTS
EASIER REBUILD QUESTIONS
Write 3-4 short scaffolded questions.
SIMILAR PRACTICE QUESTIONS
Write 3-4 same-concept questions.
BOARD-STYLE CHECK
Write 2 exam-style questions.
TEACHER NOTES
Include common slips to watch for and expected correction moves.`,
    };
  }

  if (type === 'next-day-recap') {
    return {
      system,
      user: `Create a 15-minute teacher recap for tomorrow's class.
Class ${classLevel} | Subject ${subject}
Chapter: ${chapterTitle}
Key Topics: ${topicList}${ctxLine}${classroomLine}

Use this exact structure:

15-MINUTE RECAP
MINUTE-BY-MINUTE FLOW
MISCONCEPTIONS TO FIX
BOARD EXAMPLES TO SHOW
QUICK CHECK QUESTIONS
EXIT QUESTION
HOME PRACTICE

Assume the goal is to fix recent mistakes fast.`,
    };
  }

  return {
    system,
    user: `Create a revision sheet from recent mistakes for Class ${classLevel} ${subject}.
Chapter: ${chapterTitle}
Key Topics: ${topicList}${ctxLine}${classroomLine}

Use this exact structure:

REVISION SHEET
MOST COMMON MISTAKES
CORRECTED CONCEPT NOTES
FORMULA OR FACT CHECKLIST
DO THIS / DO NOT DO THIS
PRACTICE QUESTIONS
FINAL 5-MARK CHECK

Make it feel like a handout the class can revise from directly.`,
  };
}

function buildClassroomSignals(input: {
  gradebook: Awaited<ReturnType<typeof listTeacherGradebook>>;
  chapterId?: string;
  subject: string;
  classLevel: number;
}): ClassroomSignals | undefined {
  const relevantPacks = input.gradebook.packs.filter((pack) => {
    if (input.chapterId) return pack.chapterId === input.chapterId;
    return pack.subject === input.subject && pack.classLevel === input.classLevel;
  });
  const relevantPackIds = new Set(relevantPacks.map((pack) => pack.packId));
  if (relevantPackIds.size === 0) return undefined;

  const scoredStudents = input.gradebook.students
    .map((student) => {
      const relevantScores = Object.entries(student.scores)
        .filter(([packId]) => relevantPackIds.has(packId))
        .map(([, score]) => score);
      if (relevantScores.length === 0) return null;
      const chapterAverage = Math.round((relevantScores.reduce((sum, score) => sum + score, 0) / relevantScores.length) * 100) / 100;
      return {
        studentId: student.studentId,
        studentName: student.studentName,
        submissionCode: student.submissionCode,
        chapterAverage,
        attempts: student.attempts,
        releasedCount: student.releasedCount,
      } satisfies ClassroomSignalStudent;
    })
    .filter((student): student is ClassroomSignalStudent => !!student)
    .sort((a, b) => a.chapterAverage - b.chapterAverage);

  if (scoredStudents.length === 0) return undefined;
  const averageScore =
    Math.round((scoredStudents.reduce((sum, student) => sum + student.chapterAverage, 0) / scoredStudents.length) * 100) / 100;
  const weakStudents = scoredStudents.slice(0, Math.min(8, Math.max(3, Math.ceil(scoredStudents.length * 0.35))));
  const lowScoreCount = scoredStudents.filter((student) => student.chapterAverage < 60).length;

  return {
    weakStudents,
    relevantPackCount: relevantPacks.length,
    relevantStudentCount: scoredStudents.length,
    averageScore,
    lowScoreCount,
    packTitles: relevantPacks.slice(0, 6).map((pack) => pack.title),
    summary: `${weakStudents.length} students are showing the strongest need for remediation in this chapter. Class average across ${relevantPacks.length} relevant packs is ${averageScore}%, and ${lowScoreCount} students are below 60%.`,
  };
}

function buildTaskForType(type: ToolType) {
  if (type === 'worksheet' || type === 'question-paper') return 'chapter-drill' as const;
  if (type === 'remedial-set' || type === 'revision-sheet') return 'chapter-remediate' as const;
  if (type === 'weak-students' || type === 'next-day-recap') return 'chapter-diagnose' as const;
  return 'chat' as const;
}

function deriveClassSections(session: Awaited<ReturnType<typeof getTeacherSessionFromRequestCookies>> | null, subject: string, classLevel: number) {
  if (!session) return undefined;
  return session.effectiveScopes
    .filter((scope) => scope.isActive && scope.subject === subject && scope.classLevel === classLevel && scope.section)
    .map((scope) => ({ classLevel: scope.classLevel, section: scope.section as string }));
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth(req);
    if (authResponse) return authResponse;

    if (context?.role === 'student') {
      return errorJson({
        requestId,
        errorCode: 'teacher-role-required',
        message: 'This AI tool is for teachers, admins, and developers.',
        status: 403,
      });
    }

    const limit = await checkRateLimit({
      key: buildRateLimitKey('ai:teacher-tool', [context?.authUserId || getClientIp(req), context?.schoolId]),
      windowSeconds: 60,
      maxRequests: 10,
      blockSeconds: 120,
    });
    if (!limit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many generation requests. Please wait and try again.',
        status: 429,
        hint: `Retry after ${limit.retryAfterSeconds}s`,
      });
    }

    const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, teacherAiRequestSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }

    const body = bodyResult.value as Record<string, unknown>;
    const type = body.type as ToolType;
    if (!(type in TOOL_LABELS)) {
      return errorJson({
        requestId,
        errorCode: 'invalid-tool-type',
        message: 'Unsupported teacher AI tool type.',
        status: 400,
      });
    }

    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
    const chapter = chapterId ? getChapterById(chapterId) : null;
    const chapterTitle = typeof body.chapterTitle === 'string' ? body.chapterTitle.trim() : chapter?.title ?? '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : chapter?.subject ?? '';
    const classLevel = typeof body.classLevel === 'number' ? body.classLevel : chapter?.classLevel ?? 10;
    const topics: string[] = Array.isArray(body.topics)
      ? (body.topics as unknown[]).filter((topic): topic is string => typeof topic === 'string').slice(0, 12)
      : chapter?.topics.slice(0, 8) ?? [];
    const questionCount =
      typeof body.questionCount === 'number' && body.questionCount > 0
        ? Math.min(30, Math.max(3, Math.round(body.questionCount)))
        : 10;
    const difficulty = typeof body.difficulty === 'string' ? body.difficulty : 'mixed';
    const customContext = typeof body.customContext === 'string' ? body.customContext.trim().slice(0, 500) : '';

    if (!chapterTitle || !subject) {
      return errorJson({
        requestId,
        errorCode: 'missing-chapter-info',
        message: 'chapterId or chapterTitle + subject required',
        status: 400,
      });
    }

    const teacherSession = context?.role === 'teacher' ? await getTeacherSessionFromRequestCookies() : null;
    const classSections = deriveClassSections(teacherSession, subject, classLevel);
    const gradebook =
      context?.role === 'teacher' && context.schoolId && teacherSession
        ? await listTeacherGradebook({
            teacherId: teacherSession.teacher.id,
            schoolId: context.schoolId,
            classSections,
          })
        : { packs: [], students: [], summary: { students: 0, packs: 0, overallAverage: 0 } };
    const classroomSignals = buildClassroomSignals({
      gradebook,
      chapterId: chapter?.id ?? (chapterId || undefined),
      subject,
      classLevel,
    });

    const { system, user } = buildTeacherAIPrompt({
      type,
      chapterTitle,
      subject,
      classLevel,
      topics,
      questionCount,
      difficulty,
      customContext,
      classroomSignals,
    });

    const tokenBudget = await checkAiTokenBudget({
      context,
      endpoint: '/api/teacher/ai',
      projectedInputText: user,
      projectedOutputTokens: 3200,
    });
    if (!tokenBudget.allowed) {
      return errorJson({
        requestId,
        errorCode: tokenBudget.reason || 'token-cap-exceeded',
        message: 'AI usage limit reached for teacher tools.',
        status: 429,
        hint: `Retry after ${tokenBudget.retryAfterSeconds ?? 300}s`,
      });
    }

    const task = buildTaskForType(type);
    const contextPack = await getContextPack({
      task,
      classLevel: classLevel === 10 || classLevel === 12 ? classLevel : 12,
      subject,
      chapterId: chapter?.id ?? (chapterId || undefined),
      chapterTopics: topics,
      query: `teacher ${type} ${chapterTitle} ${difficulty} ${topics.join(' ')} ${classroomSignals?.summary ?? ''}`.trim(),
      topK: 8,
    });

    const generated = await generateTaskText({
      task,
      contextHash: contextPack.contextHash || `teacher-${type}-${chapterId || chapterTitle}`,
      contextSnippets: contextPack.snippets,
      chapterId: chapter?.id ?? (chapterId || undefined),
      systemPrompt: system,
      userPrompt: user,
      temperature: 0.45,
      maxOutputTokens: 3200,
      qualityMeta: {
        schoolId: context?.schoolId,
        authUserId: context?.authUserId,
        role: context?.role,
        subject,
        chapterId: chapter?.id ?? (chapterId || undefined),
        endpoint: '/api/teacher/ai',
        requestId,
        responseId: `teacher-ai-${requestId}`,
        promptVersion: 'teacher-copilot-v2',
        routingKey: `teacher-${type}`,
        retrievalConfidence: contextPack.retrievalMeta?.confidence,
        retrievalConfidenceLevel: contextPack.retrievalMeta?.confidenceLevel,
        retrievalAvgRelevance: contextPack.retrievalMeta?.averageRelevance,
      },
    });

    await logAiUsage({
      context,
      endpoint: '/api/teacher/ai',
      provider: generated.provider,
      model: generated.model,
      promptTokens: generated.usage?.promptTokens,
      completionTokens: generated.usage?.completionTokens,
      totalTokens: generated.usage?.totalTokens,
      requestId,
      estimated: !generated.usage,
    });

    logServerEvent({
      event: 'teacher-ai-tool-generated',
      requestId,
      endpoint: '/api/teacher/ai',
      role: context?.role,
      schoolId: context?.schoolId,
      statusCode: 200,
    });

    return dataJson({
      requestId,
      data: {
        type,
        label: TOOL_LABELS[type],
        chapterId: chapterId || null,
        chapterTitle,
        subject,
        result: generated.text.trim(),
        classroomSignals,
        grounding: {
          usedPgvector: contextPack.usedPgvector,
          usedOnDemandFallback: contextPack.usedOnDemandFallback,
          retrieval: contextPack.retrievalMeta,
        },
        quality: {
          provider: generated.provider,
          model: generated.model,
          latencyMs: generated.latencyMs,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI generation failed.';
    logServerEvent({
      level: 'error',
      event: 'teacher-ai-tool-error',
      requestId,
      endpoint: '/api/teacher/ai',
      statusCode: 500,
    });
    if (message.toLowerCase().includes('configured')) {
      return errorJson({
        requestId,
        errorCode: 'ai-provider-not-configured',
        message: 'AI provider not configured.',
        status: 503,
      });
    }
    return errorJson({ requestId, errorCode: 'ai-generation-failed', message, status: 502 });
  }
}
