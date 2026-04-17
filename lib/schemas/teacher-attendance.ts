/**
 * Typed Zod schemas for teacher attendance route.
 * Route: /api/teacher/attendance
 */
import { z } from 'zod';

const attendanceStatus = z.enum(['present', 'absent', 'late', 'excused']);

const attendanceRecord = z.object({
  studentId: z.string().trim().min(1).max(90),
  status: attendanceStatus,
  note: z.string().trim().max(300).optional(),
});

export const markAttendanceSchema = z.object({
  classLevel: z.union([z.literal(10), z.literal(12)]),
  section: z.string().trim().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
  records: z.array(attendanceRecord).min(1).max(3000),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
