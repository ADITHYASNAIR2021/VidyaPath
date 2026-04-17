import { z } from 'zod';

const teacherClassPreset = z.enum(['class10-science', 'class12-pcm', 'class12-pcb', 'custom']);
const classLevelCoerce = z.coerce.number().refine((value) => value === 10 || value === 12, {
  message: 'classLevel must be 10 or 12',
});

export const teacherWeeklyPlanCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    classPreset: teacherClassPreset.optional(),
    classLevel: classLevelCoerce.optional(),
    subject: z.string().trim().max(60).optional(),
    focusChapterIds: z.array(z.string().trim().min(1).max(120)).min(1).max(24),
    planWeeks: z.array(z.object({}).passthrough()).min(1).max(16),
    dueDate: z.string().trim().max(40).optional(),
    section: z.string().trim().max(40).optional(),
  })
  .passthrough();

export const teacherSubmissionCreateSchema = z
  .object({
    packId: z.string().trim().min(1).max(120),
    answers: z
      .array(
        z
          .object({
            questionNo: z.string().trim().min(1).max(30),
            answerText: z.string().trim().min(1).max(4000),
          })
          .passthrough()
      )
      .min(1)
      .max(300),
  })
  .passthrough();
