import { NextRequest } from 'next/server';
import { getChapterById } from '@/lib/data';
import { generateTaskText } from '@/lib/ai/generator';
import { checkAiTokenBudget } from '@/lib/ai/token-budget';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { logAiUsage } from '@/lib/ai/token-usage';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { teacherAiRequestSchema } from '@/lib/schemas/ai';
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
  const topicList = topics.slice(0, 10).join(', ');
  const ctxLine = customContext ? `\nAdditional teacher instructions: ${customContext}` : '';
  const diffLabel = difficulty === 'easy' ? 'foundation-level' : difficulty === 'hard' ? 'advanced HOTS-level' : difficulty === 'medium' ? 'standard CBSE-level' : 'mixed difficulty';

  const system = `You are a senior CBSE curriculum expert with 15+ years experience writing board exam papers and lesson materials for Class ${classLevel} ${subject}.
STRICT RULES — follow exactly:
1. Never use Markdown syntax. No asterisks (*), hashes (#), backticks, or underscores for formatting.
2. Use plain text only. Use ALL CAPS for section headers.
3. Use numbered lists (1. 2. 3.) and lettered sub-items (a. b. c.) for structure.
4. Write clearly at Class ${classLevel} reading level aligned to NCERT syllabus.
5. Be specific, accurate, and board-exam focused.`;

  if (type === 'worksheet') {
    const mcqCount = Math.max(2, Math.round(questionCount * 0.4));
    const shortCount = Math.max(2, Math.round(questionCount * 0.4));
    const longCount = Math.max(1, questionCount - mcqCount - shortCount);
    return {
      system,
      user: `Create a ${diffLabel} CBSE practice worksheet for Class ${classLevel} ${subject}.
Chapter: ${chapterTitle}
Key Topics: ${topicList}${ctxLine}

Use this exact structure — no markdown, plain text only:

PRACTICE WORKSHEET
Class ${classLevel} | ${subject} | ${chapterTitle}

LEARNING OBJECTIVES
Write 3 clear objectives starting with action verbs (Recall, Explain, Apply, Analyse).

SECTION A — MULTIPLE CHOICE QUESTIONS (1 mark each)
Write ${mcqCount} MCQs. Format each as:
1. [Question text]
   a) [Option]   b) [Option]   c) [Option]   d) [Option]

SECTION B — SHORT ANSWER QUESTIONS (2-3 marks each)
Write ${shortCount} questions. Number them continuing from Section A.

SECTION C — LONG ANSWER QUESTIONS (5 marks each)
Write ${longCount} questions. Number them continuing. Include sub-parts (a), (b), (c).

ANSWER KEY
Section A: 1-[letter] 2-[letter] ... (one line)
Section B: Brief model answers, 2-3 sentences each.
Section C: Key points for full marks (bullet points).

KEY FORMULAS AND POINTS TO REMEMBER
List 4-6 important formulas or facts from this chapter.`,
    };
  }

  if (type === 'lesson-plan') {
    return {
      system,
      user: `Create a structured 45-minute lesson plan for Class ${classLevel} ${subject}.
Chapter: ${chapterTitle}
Key Topics: ${topicList}${ctxLine}

Use this exact structure — plain text, no markdown:

LESSON PLAN
Class ${classLevel} | ${subject} | ${chapterTitle}
Duration: 45 minutes | Difficulty: ${diffLabel}

LEARNING OBJECTIVES
1. [Objective — start with action verb]
2. [Objective]
3. [Objective]

PRIOR KNOWLEDGE REQUIRED
List 2-3 concepts students should already know.

MATERIALS AND RESOURCES
Textbook pages, diagrams to draw on board, any equipment.

LESSON FLOW

HOOK AND WARM-UP (5 minutes)
Describe an engaging opening activity, real-world connection, or question to spark curiosity. Be specific.

DIRECT INSTRUCTION (15 minutes)
Key concepts to explain, in what order. Include 1-2 specific examples or worked problems the teacher should demonstrate. Mention any important diagrams to draw.

GUIDED PRACTICE (10 minutes)
Write 2-3 practice questions with expected student answers. Teacher works through these with class.
Q1. [Question] — Expected: [Answer]
Q2. [Question] — Expected: [Answer]

INDEPENDENT PRACTICE (10 minutes)
Write 3-4 questions students solve individually. Vary difficulty.

EXIT TICKET ASSESSMENT (5 minutes)
One targeted question to gauge understanding. Include the answer.

HOMEWORK ASSIGNMENT
2-3 questions for home practice with page references from NCERT.

DIFFERENTIATION TIPS
For struggling students: [specific support strategy]
For advanced students: [extension activity or challenge]

CBSE BOARD EXAM RELEVANCE
Marks weightage, common question types, frequently tested concepts from this chapter.`,
    };
  }

  // question-paper
  const totalMarks = Math.max(20, questionCount);
  const sec_a = Math.floor(totalMarks * 0.2);
  const sec_b = Math.floor(totalMarks * 0.3);
  const sec_c = Math.floor(totalMarks * 0.3);
  const sec_d = totalMarks - sec_a - sec_b - sec_c;
  return {
    system,
    user: `Create a ${diffLabel} CBSE-format question paper for Class ${classLevel} ${subject}.
Chapter: ${chapterTitle}
Key Topics: ${topicList}${ctxLine}
Total Marks: ${totalMarks}

Use this exact structure — plain text, no markdown:

QUESTION PAPER
Class ${classLevel} | ${subject}
Chapter: ${chapterTitle}
Time Allowed: ${Math.round(totalMarks * 1.2)} minutes | Maximum Marks: ${totalMarks}

General Instructions:
1. All questions are compulsory.
2. Write neat and legible answers.
3. Internal choices are given where indicated.

SECTION A — OBJECTIVE TYPE (${sec_a} marks)
(1 mark each)
Write ${sec_a} questions. MCQ format with 4 options, label options a) b) c) d).
Number as Q1, Q2...

SECTION B — SHORT ANSWER I (${sec_b} marks)
(2 marks each — write in 30-50 words)
Write ${Math.round(sec_b / 2)} questions. Number continuing from Section A.

SECTION C — SHORT ANSWER II (${sec_c} marks)
(3 marks each — write in 60-80 words)
Write ${Math.round(sec_c / 3)} questions. Give one internal choice per question (OR).
Number continuing from Section B.

SECTION D — LONG ANSWER (${sec_d} marks)
(5 marks each — write in 100-150 words)
Write ${Math.round(sec_d / 5)} questions. Give one internal choice per question (OR). Include a diagram/case-study based question.
Number continuing from Section C.

Total Marks: ${totalMarks}`,
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
    const tokenBudget = await checkAiTokenBudget({
      context,
      endpoint: '/api/teacher/ai',
      projectedInputText: user,
      projectedOutputTokens: 3000,
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
