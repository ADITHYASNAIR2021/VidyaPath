import { NextRequest } from 'next/server';
import { getChapterById } from '@/lib/data';
import { generateTaskText } from '@/lib/ai/generator';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { logServerEvent } from '@/lib/observability';

type ToolType = 'worksheet' | 'lesson-plan' | 'question-paper';

const TOOL_LABELS: Record<ToolType, string> = {
  worksheet:        'Practice Worksheet',
  'lesson-plan':    'Lesson Plan',
  'question-paper': 'Question Paper',
};

function buildTeacherAIPrompt(
  type: ToolType,
  chapterTitle: string,
  subject: string,
  classLevel: number,
  topics: string[],
  questionCount: number,
  difficulty: string,
  customContext: string
): { system: string; user: string } {
  const topicList = topics.join(', ');
  const ctxLine = customContext ? `\nTeacher's additional context: ${customContext}` : '';

  const common = `You are an expert CBSE curriculum designer helping a teacher create high-quality teaching materials.
Chapter: ${chapterTitle} | Subject: ${subject} | Class: ${classLevel}
Key Topics: ${topicList}${ctxLine}`;

  if (type === 'worksheet') {
    return {
      system: common,
      user: `Create a ${difficulty} practice worksheet for the above chapter with exactly ${questionCount} questions.
Use a mix of:
- 1-mark recall questions (fill in the blank or very short answer)
- 2-mark application questions
- 3-mark concept questions

Format each question clearly as:
Q1. [question text] (__ marks)
...

End with a brief "Key Formulas / Points to Remember" section.`,
    };
  }

  if (type === 'lesson-plan') {
    return {
      system: common,
      user: `Create a detailed 45-minute lesson plan for the above chapter.
Structure:
1. Learning Objectives (3–4 bullet points)
2. Prior Knowledge Required
3. Lesson Flow:
   - Opening / Hook (5 min)
   - Core Explanation (20 min) — key concepts, diagrams to draw, examples
   - Guided Practice (10 min) — 2–3 practice questions with expected answers
   - Closure / Recap (5 min)
   - Exit Ticket (5 min) — 1 quick assessment question
4. Homework / Follow-up Assignment (2–3 questions)
5. Differentiation Tips (for struggling vs advanced students)
6. CBSE Board Exam Connection (marks weightage, important question types)`,
    };
  }

  // question-paper
  return {
    system: common,
    user: `Create a ${difficulty} CBSE-style question paper for the above chapter with exactly ${questionCount} marks total.

Format:
Section A – 1-mark questions (Very Short Answer)
Section B – 2-mark questions (Short Answer I)
Section C – 3-mark questions (Short Answer II)
Section D – 5-mark questions (Long Answer) [only if questionCount >= 15]

Rules:
- Label each question clearly (Q1, Q2...)
- Include marks in brackets at end of each question e.g. [1 mark]
- Ensure variety: recall, application, analysis
- Final line: Total Marks: __`,
  };
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    // Teachers, admins, and developers only
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

    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 32 * 1024);
    if (!bodyResult.ok) {
      return errorJson({ requestId, errorCode: bodyResult.reason, message: bodyResult.message, status: 400 });
    }

    const body = bodyResult.value;
    const type = body.type as ToolType;
    if (!['worksheet', 'lesson-plan', 'question-paper'].includes(type)) {
      return errorJson({ requestId, errorCode: 'invalid-tool-type', message: 'type must be worksheet | lesson-plan | question-paper', status: 400 });
    }

    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
    const chapter = chapterId ? getChapterById(chapterId) : null;

    const chapterTitle = typeof body.chapterTitle === 'string' ? body.chapterTitle.trim()
      : (chapter?.title ?? '');
    const subject = typeof body.subject === 'string' ? body.subject.trim()
      : (chapter?.subject ?? '');
    const classLevel = typeof body.classLevel === 'number' ? body.classLevel
      : (chapter?.classLevel ?? 10);
    const topics: string[] = Array.isArray(body.topics)
      ? (body.topics as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 12)
      : (chapter?.topics.slice(0, 8) ?? []);
    const questionCount = typeof body.questionCount === 'number' && body.questionCount > 0
      ? Math.min(30, Math.max(3, Math.round(body.questionCount))) : 10;
    const difficulty = typeof body.difficulty === 'string' ? body.difficulty : 'mixed';
    const customContext = typeof body.customContext === 'string' ? body.customContext.trim().slice(0, 500) : '';

    if (!chapterTitle || !subject) {
      return errorJson({ requestId, errorCode: 'missing-chapter-info', message: 'chapterId or chapterTitle + subject required', status: 400 });
    }

    const { system, user } = buildTeacherAIPrompt(
      type, chapterTitle, subject, classLevel, topics, questionCount, difficulty, customContext
    );

    const generated = await generateTaskText({
      task: 'chat',
      contextHash: `teacher-${type}-${chapterId || chapterTitle}`,
      contextSnippets: [],
      systemPrompt: system,
      userPrompt: user,
      temperature: 0.5,
      maxOutputTokens: 3000,
    });

    await logAiUsage({
      context,
      endpoint: '/api/teacher/ai',
      provider: generated.provider,
      model: generated.model,
      promptText: user,
      completionText: generated.text,
      requestId,
      estimated: true,
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
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI generation failed.';
    logServerEvent({ level: 'error', event: 'teacher-ai-tool-error', requestId, endpoint: '/api/teacher/ai', statusCode: 500 });
    if (message.toLowerCase().includes('configured')) {
      return errorJson({ requestId, errorCode: 'ai-provider-not-configured', message: 'AI provider not configured.', status: 503 });
    }
    return errorJson({ requestId, errorCode: 'ai-generation-failed', message, status: 502 });
  }
}
