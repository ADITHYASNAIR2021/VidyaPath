'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Target, Trophy, BrainCircuit, Activity, BookOpen, ChevronRight,
  TrendingUp, Zap, CheckCircle2, Clock, Star, Award, BarChart2,
  Atom, FlaskConical, Leaf, Calculator, FileText, Briefcase, LineChart, Users,
} from 'lucide-react';
import clsx from 'clsx';
import { ALL_CHAPTERS } from '@/lib/data';
import type { Subject } from '@/lib/data';
import { useProgressStore, useBookmarkStore } from '@/lib/store';
import { getPaperStats } from '@/lib/papers';
import { getPYQData } from '@/lib/pyq';
import { buildLearningProfile, rankWeakChapters, type LearningProfile } from '@/lib/learning-profile';
import RevisionPlanCard from '@/components/RevisionPlanCard';
import DashboardChapterCoach from '@/components/DashboardChapterCoach';
import { fetchClientStudentSession } from '@/lib/client-student-session';

// ── SVG Progress Ring ─────────────────────────────────────────
function ProgressRing({
  pct, size = 80, stroke = 7, color = '#E8511A',
}: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F0EDE8" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
    </svg>
  );
}

// ── Subject ring card ─────────────────────────────────────────
const SUBJECT_META = {
  Physics:   { icon: Atom,        color: '#0284c7', ring: '#0ea5e9', bg: 'bg-sky-50 border-sky-100',     label: 'Physics' },
  Chemistry: { icon: FlaskConical, color: '#059669', ring: '#10b981', bg: 'bg-emerald-50 border-emerald-100', label: 'Chemistry' },
  Biology:   { icon: Leaf,        color: '#16a34a', ring: '#22c55e', bg: 'bg-green-50 border-green-100',  label: 'Biology' },
  Math:      { icon: Calculator,  color: '#7c3aed', ring: '#a855f7', bg: 'bg-purple-50 border-purple-100', label: 'Math' },
  Accountancy: { icon: Briefcase, color: '#d97706', ring: '#f59e0b', bg: 'bg-amber-50 border-amber-100', label: 'Accountancy' },
  'Business Studies': { icon: LineChart, color: '#4f46e5', ring: '#6366f1', bg: 'bg-indigo-50 border-indigo-100', label: 'Business Studies' },
  Economics: { icon: LineChart, color: '#e11d48', ring: '#fb7185', bg: 'bg-rose-50 border-rose-100', label: 'Economics' },
  'English Core': { icon: BookOpen, color: '#0e7490', ring: '#06b6d4', bg: 'bg-cyan-50 border-cyan-100', label: 'English Core' },
} as const;

function SubjectCard({
  subject, studied, total,
}: { subject: keyof typeof SUBJECT_META; studied: number; total: number }) {
  const meta = SUBJECT_META[subject];
  const Icon = meta.icon ?? BookOpen;
  const pct = total > 0 ? Math.round((studied / total) * 100) : 0;
  return (
    <div className={clsx('rounded-2xl border p-4 flex items-center gap-4', meta.bg)}>
      <div className="relative flex-shrink-0">
        <ProgressRing pct={pct} size={68} stroke={6} color={meta.ring} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="w-5 h-5" style={{ color: meta.color }} />
        </div>
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-navy-700 text-sm">{meta.label}</div>
        <div className="text-2xl font-bold mt-0.5" style={{ color: meta.color }}>
          {pct}<span className="text-base font-medium text-[#8A8AAA]">%</span>
        </div>
        <div className="text-xs text-[#8A8AAA]">{studied} / {total} chapters</div>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub, color, href,
}: { icon: React.ElementType; label: string; value: string | number; sub?: string; color: string; href?: string }) {
  const inner = (
    <div className={clsx('bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5 hover:shadow-md transition-shadow group', href && 'cursor-pointer')}>
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center mb-3', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="text-3xl font-bold text-navy-700 leading-none">{value}</div>
      <div className="text-sm font-medium text-[#4A4A6A] mt-1">{label}</div>
      {sub && <div className="text-xs text-[#8A8AAA] mt-0.5">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ── Class progress bar ────────────────────────────────────────
function ClassBar({ cls, studied, total }: { cls: number; studied: number; total: number }) {
  const pct = total > 0 ? Math.round((studied / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm font-medium mb-1.5">
        <span className="text-navy-700">Class {cls}</span>
        <span className="text-[#8A8AAA]">{studied}/{total} chapters</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className={clsx('h-full rounded-full', cls === 10 ? 'bg-emerald-500' : 'bg-sky-500')}
        />
      </div>
      <div className="text-xs text-[#8A8AAA] mt-1">{pct}% complete</div>
    </div>
  );
}

interface StudentSessionSnapshot {
  studentName: string;
  classLevel: 10 | 12;
  section?: string;
  stream?: 'Science' | 'Commerce' | 'Humanities';
  enrolledSubjects: Subject[];
}

interface TeacherAssignmentSnapshot {
  packId: string;
  title: string;
  chapterId: string;
  subject: string;
  classLevel: 10 | 12;
  section?: string;
  dueDate?: string;
  teacherName?: string;
  shareUrl?: string;
  questionCount: number;
  estimatedTimeMinutes: number;
}

interface TeacherAnnouncementSnapshot {
  id: string;
  title: string;
  body: string;
  subject: string;
  classLevel: 10 | 12;
  section?: string;
}

interface DashboardAttendanceSummary {
  percentage: number;
  total: number;
}

interface DashboardResourceItem {
  id: string;
  title: string;
  createdAt: string;
  type: 'pdf' | 'link' | 'video' | 'image';
}

interface DashboardEventItem {
  id: string;
  title: string;
  eventDate: string;
  type: 'exam' | 'assignment_due' | 'holiday' | 'meeting' | 'other';
}

interface DashboardGradeItem {
  submissionId: string;
  subject: string;
  score: number;
  createdAt: string;
}

interface DashboardTimetableSlot {
  dayOfWeek: number;
  periodNo: number;
  subject: string;
  startTime?: string;
  endTime?: string;
}

interface DashboardSchoolAnnouncement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

// ── Main page ─────────────────────────────────────────────────
export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [quizzesTaken, setQuizzesTaken] = useState(0);
  const [avgQuizScore, setAvgQuizScore] = useState(0);
  const [cardsDue, setCardsDue] = useState(0);
  const [weakProfiles, setWeakProfiles] = useState<LearningProfile[]>([]);
  const [studentSession, setStudentSession] = useState<StudentSessionSnapshot | null>(null);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignmentSnapshot[]>([]);
  const [teacherAnnouncements, setTeacherAnnouncements] = useState<TeacherAnnouncementSnapshot[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<DashboardAttendanceSummary | null>(null);
  const [resourceFeed, setResourceFeed] = useState<DashboardResourceItem[]>([]);
  const [eventFeed, setEventFeed] = useState<DashboardEventItem[]>([]);
  const [gradeFeed, setGradeFeed] = useState<DashboardGradeItem[]>([]);
  const [todayTimetable, setTodayTimetable] = useState<DashboardTimetableSlot[]>([]);
  const [schoolAnnouncements, setSchoolAnnouncements] = useState<DashboardSchoolAnnouncement[]>([]);
  const { studiedChapterIds } = useProgressStore();
  const { bookmarkedChapterIds } = useBookmarkStore();
  const eligibleChapters = useMemo(() => ALL_CHAPTERS.filter((c) => c.classLevel !== 11), []);
  const enrolledSubjectSet = useMemo(() => {
    if (!studentSession) return null;
    if (studentSession.enrolledSubjects.length === 0) return null;
    return new Set<Subject>(studentSession.enrolledSubjects);
  }, [studentSession]);
  const visibleChapters = useMemo(
    () => eligibleChapters.filter((chapter) => !enrolledSubjectSet || enrolledSubjectSet.has(chapter.subject)),
    [eligibleChapters, enrolledSubjectSet]
  );
  const chapterById = useMemo(() => new Map(visibleChapters.map((chapter) => [chapter.id, chapter])), [visibleChapters]);

  const paperStats = useMemo(() => getPaperStats(), []);

  // Compute progress by subject and class
  const subjectProgress = useMemo(() => {
    const result: Record<string, { studied: number; total: number }> = Object.keys(SUBJECT_META).reduce(
      (acc, key) => ({ ...acc, [key]: { studied: 0, total: 0 } }),
      {} as Record<string, { studied: number; total: number }>
    );
    const classProgress: Record<number, { studied: number; total: number }> = {
      10: { studied: 0, total: 0 },
      12: { studied: 0, total: 0 },
    };
    for (const ch of visibleChapters) {
      result[ch.subject].total++;
      if (studiedChapterIds.includes(ch.id)) result[ch.subject].studied++;
      if (classProgress[ch.classLevel]) {
        classProgress[ch.classLevel].total++;
        if (studiedChapterIds.includes(ch.id)) classProgress[ch.classLevel].studied++;
      }
    }
    return { bySubject: result, byClass: classProgress };
  }, [studiedChapterIds, visibleChapters]);

  const totalChapters = visibleChapters.length;
  const studiedCount = studiedChapterIds.filter((id) => chapterById.has(id)).length;
  const overallPct = totalChapters > 0 ? Math.round((studiedCount / totalChapters) * 100) : 0;
  const dashboardTrack = useMemo(() => {
    if (!studentSession) return 'General';
    if (studentSession.stream) return studentSession.stream;
    if (studentSession.classLevel === 10) return 'Science & Math Foundation';
    const subjectSet = new Set(teacherAssignments.map((item) => item.subject));
    const hasCommerce = ['Accountancy', 'Business Studies', 'Economics'].some((subject) => subjectSet.has(subject));
    const hasScience = ['Physics', 'Chemistry', 'Biology', 'Math'].some((subject) => subjectSet.has(subject));
    if (hasCommerce) return 'Commerce';
    if (hasScience) return 'Science';
    return 'Humanities';
  }, [studentSession, teacherAssignments]);
  const orderedSubjects = useMemo(() => {
    const allSubjects = Object.keys(SUBJECT_META) as Array<keyof typeof SUBJECT_META>;
    const visibleSet = new Set(visibleChapters.map((chapter) => chapter.subject));
    const priority: Array<keyof typeof SUBJECT_META> = (() => {
      if (studentSession?.classLevel === 10) {
        return ['Physics', 'Chemistry', 'Biology', 'Math', 'English Core'];
      }
      if (dashboardTrack === 'Commerce') {
        return ['Accountancy', 'Business Studies', 'Economics', 'English Core'];
      }
      if (dashboardTrack === 'Science') {
        return ['Physics', 'Chemistry', 'Math', 'Biology', 'English Core'];
      }
      return ['English Core', 'Physics', 'Chemistry', 'Biology', 'Math'];
    })();
    return [...new Set([...priority, ...allSubjects])].filter((subject) => visibleSet.has(subject));
  }, [dashboardTrack, studentSession, visibleChapters]);
  const plannerClassLevel = useMemo<10 | 12>(() => {
    const class10Weak = weakProfiles.filter((profile) => chapterById.get(profile.chapterId)?.classLevel === 10).length;
    const class12Weak = weakProfiles.filter((profile) => chapterById.get(profile.chapterId)?.classLevel === 12).length;
    return class10Weak > class12Weak ? 10 : 12;
  }, [chapterById, weakProfiles]);
  const plannerWeakChapterIds = useMemo(
    () =>
      weakProfiles
        .filter((profile) => chapterById.get(profile.chapterId)?.classLevel === plannerClassLevel)
        .map((profile) => profile.chapterId),
    [chapterById, plannerClassLevel, weakProfiles]
  );
  const topWeakProfile = weakProfiles[0] ?? null;
  const topWeakChapter = topWeakProfile ? chapterById.get(topWeakProfile.chapterId) : undefined;

  useEffect(() => {
    let active = true;
    fetchClientStudentSession()
      .then((session) => {
        if (!session?.studentId || !session.classLevel || !session.studentName) return null;
        return {
          studentName: session.studentName,
          classLevel: session.classLevel,
          section: session.section,
          stream: session.stream,
          enrolledSubjects: session.enrolledSubjects,
        } as StudentSessionSnapshot;
      })
      .then((session) => {
        if (!active || !session) return;
        setStudentSession(session);
      })
      .catch(() => {
        if (active) setStudentSession(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!studentSession) {
      setTeacherAssignments([]);
      setTeacherAnnouncements([]);
      return;
    }
    let active = true;
    const params = new URLSearchParams({
      classLevel: String(studentSession.classLevel),
    });
    if (studentSession.section) params.set('section', studentSession.section);
    fetch(`/api/teacher?${params.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = await response.json().catch(() => null);
        const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
          ? payload.data as Record<string, unknown>
          : payload as Record<string, unknown> | null;
        if (!data || !data.scopeFeed || typeof data.scopeFeed !== 'object') return null;
        return data.scopeFeed as Record<string, unknown>;
      })
      .then((scopeFeed) => {
        if (!active || !scopeFeed) return;
        const assignmentPacks = Array.isArray(scopeFeed.assignmentPacks)
          ? scopeFeed.assignmentPacks
          : [];
        const announcements = Array.isArray(scopeFeed.announcements)
          ? scopeFeed.announcements
          : [];

        const nextAssignments = assignmentPacks
          .map((item): TeacherAssignmentSnapshot | null => {
            if (!item || typeof item !== 'object') return null;
            const record = item as Record<string, unknown>;
            const classLevelRaw = Number(record.classLevel);
            if (classLevelRaw !== 10 && classLevelRaw !== 12) return null;
            const packId = typeof record.packId === 'string' ? record.packId.trim() : '';
            const title = typeof record.title === 'string' ? record.title.trim() : '';
            const chapterId = typeof record.chapterId === 'string' ? record.chapterId.trim() : '';
            const subject = typeof record.subject === 'string' ? record.subject.trim() : '';
            if (!packId || !title || !chapterId || !subject) return null;
            return {
              packId,
              title,
              chapterId,
              subject,
              classLevel: classLevelRaw,
              section: typeof record.section === 'string' ? record.section.trim() || undefined : undefined,
              dueDate: typeof record.dueDate === 'string' ? record.dueDate.trim() || undefined : undefined,
              teacherName: typeof record.teacherName === 'string' ? record.teacherName.trim() || undefined : undefined,
              shareUrl: typeof record.shareUrl === 'string' ? record.shareUrl.trim() || undefined : undefined,
              questionCount: Number.isFinite(Number(record.questionCount)) ? Number(record.questionCount) : 0,
              estimatedTimeMinutes: Number.isFinite(Number(record.estimatedTimeMinutes)) ? Number(record.estimatedTimeMinutes) : 0,
            };
          })
          .filter((item): item is TeacherAssignmentSnapshot => !!item)
          .slice(0, 6);

        const nextAnnouncements = announcements
          .map((item): TeacherAnnouncementSnapshot | null => {
            if (!item || typeof item !== 'object') return null;
            const record = item as Record<string, unknown>;
            const classLevelRaw = Number(record.classLevel);
            if (classLevelRaw !== 10 && classLevelRaw !== 12) return null;
            const id = typeof record.id === 'string' ? record.id.trim() : '';
            const title = typeof record.title === 'string' ? record.title.trim() : '';
            const body = typeof record.body === 'string' ? record.body.trim() : '';
            const subject = typeof record.subject === 'string' ? record.subject.trim() : '';
            if (!id || !title || !subject) return null;
            return {
              id,
              title,
              body,
              subject,
              classLevel: classLevelRaw,
              section: typeof record.section === 'string' ? record.section.trim() || undefined : undefined,
            };
          })
          .filter((item): item is TeacherAnnouncementSnapshot => !!item)
          .slice(0, 6);
        setTeacherAssignments(nextAssignments);
        setTeacherAnnouncements(nextAnnouncements);
      })
      .catch(() => {
        if (!active) return;
        setTeacherAssignments([]);
        setTeacherAnnouncements([]);
      });
    return () => {
      active = false;
    };
  }, [studentSession]);

  useEffect(() => {
    if (!studentSession) {
      setAttendanceSummary(null);
      setResourceFeed([]);
      setEventFeed([]);
      setGradeFeed([]);
      setTodayTimetable([]);
      setSchoolAnnouncements([]);
      return;
    }
    let active = true;
    Promise.all([
      fetch('/api/student/attendance?days=120', { cache: 'no-store' }).then(async (res) => (res.ok ? res.json() : null)).catch(() => null),
      fetch('/api/student/resources?limit=6', { cache: 'no-store' }).then(async (res) => (res.ok ? res.json() : null)).catch(() => null),
      fetch('/api/student/calendar?limit=6', { cache: 'no-store' }).then(async (res) => (res.ok ? res.json() : null)).catch(() => null),
      fetch('/api/student/grades', { cache: 'no-store' }).then(async (res) => (res.ok ? res.json() : null)).catch(() => null),
      fetch('/api/student/timetable', { cache: 'no-store' }).then(async (res) => (res.ok ? res.json() : null)).catch(() => null),
      fetch('/api/student/announcements?limit=5', { cache: 'no-store' }).then(async (res) => (res.ok ? res.json() : null)).catch(() => null),
    ])
      .then(([attendancePayload, resourcesPayload, eventsPayload, gradesPayload, timetablePayload, announcementsPayload]) => {
        if (!active) return;
        const attendanceData = attendancePayload && typeof attendancePayload === 'object' && 'data' in attendancePayload
          ? (attendancePayload as { data: Record<string, unknown> }).data
          : (attendancePayload as Record<string, unknown> | null);
        if (attendanceData && Number.isFinite(Number(attendanceData.percentage))) {
          setAttendanceSummary({
            percentage: Number(attendanceData.percentage),
            total: Number(attendanceData.total || 0),
          });
        } else {
          setAttendanceSummary(null);
        }

        const resourcesData = resourcesPayload && typeof resourcesPayload === 'object' && 'data' in resourcesPayload
          ? (resourcesPayload as { data: Record<string, unknown> }).data
          : (resourcesPayload as Record<string, unknown> | null);
        const resources = Array.isArray(resourcesData?.resources) ? resourcesData.resources : [];
        setResourceFeed(
          resources
            .map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : null))
            .filter((item): item is Record<string, unknown> => !!item)
            .map((item) => ({
              id: String(item.id || ''),
              title: String(item.title || 'Resource'),
              createdAt: String(item.createdAt || ''),
              type: (item.type === 'pdf' || item.type === 'video' || item.type === 'image' ? item.type : 'link') as DashboardResourceItem['type'],
            }))
            .filter((item) => item.id)
            .slice(0, 4)
        );

        const eventsData = eventsPayload && typeof eventsPayload === 'object' && 'data' in eventsPayload
          ? (eventsPayload as { data: Record<string, unknown> }).data
          : (eventsPayload as Record<string, unknown> | null);
        const events = Array.isArray(eventsData?.events) ? eventsData.events : [];
        setEventFeed(
          events
            .map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : null))
            .filter((item): item is Record<string, unknown> => !!item)
            .map((item) => ({
              id: String(item.id || ''),
              title: String(item.title || 'Event'),
              eventDate: String(item.eventDate || ''),
              type: (item.type === 'exam' || item.type === 'assignment_due' || item.type === 'holiday' || item.type === 'meeting' ? item.type : 'other') as DashboardEventItem['type'],
            }))
            .filter((item) => item.id)
            .slice(0, 4)
        );

        const gradesData = gradesPayload && typeof gradesPayload === 'object' && 'data' in gradesPayload
          ? (gradesPayload as { data: Record<string, unknown> }).data
          : (gradesPayload as Record<string, unknown> | null);
        const grades = Array.isArray(gradesData?.grades) ? gradesData.grades : [];
        setGradeFeed(
          grades
            .map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : null))
            .filter((item): item is Record<string, unknown> => !!item)
            .map((item) => ({
              submissionId: String(item.submissionId || ''),
              subject: String(item.subject || ''),
              score: Number(item.score || 0),
              createdAt: String(item.createdAt || ''),
            }))
            .filter((item) => item.submissionId)
            .slice(0, 4)
        );

        const timetableData = timetablePayload && typeof timetablePayload === 'object' && 'data' in timetablePayload
          ? (timetablePayload as { data: Record<string, unknown> }).data
          : (timetablePayload as Record<string, unknown> | null);
        const slots = Array.isArray(timetableData?.slots) ? timetableData.slots : [];
        const weekday = (() => {
          const raw = new Date().getDay();
          return raw === 0 ? 7 : raw;
        })();
        setTodayTimetable(
          slots
            .map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : null))
            .filter((item): item is Record<string, unknown> => !!item)
            .map((item) => ({
              dayOfWeek: Number(item.dayOfWeek || 0),
              periodNo: Number(item.periodNo || 0),
              subject: String(item.subject || ''),
              startTime: typeof item.startTime === 'string' ? item.startTime : undefined,
              endTime: typeof item.endTime === 'string' ? item.endTime : undefined,
            }))
            .filter((item) => item.dayOfWeek === weekday && item.subject)
            .sort((a, b) => a.periodNo - b.periodNo)
            .slice(0, 5)
        );

        const announcementsData = announcementsPayload && typeof announcementsPayload === 'object' && 'data' in announcementsPayload
          ? (announcementsPayload as { data: Record<string, unknown> }).data
          : (announcementsPayload as Record<string, unknown> | null);
        const announcements = Array.isArray(announcementsData?.announcements) ? announcementsData.announcements : [];
        setSchoolAnnouncements(
          announcements
            .map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : null))
            .filter((item): item is Record<string, unknown> => !!item)
            .map((item) => ({
              id: String(item.id || ''),
              title: String(item.title || 'School update'),
              body: String(item.body || ''),
              createdAt: String(item.createdAt || ''),
            }))
            .filter((item) => item.id)
            .slice(0, 3)
        );
      })
      .catch(() => {
        if (!active) return;
        setAttendanceSummary(null);
        setResourceFeed([]);
        setEventFeed([]);
        setGradeFeed([]);
        setTodayTimetable([]);
        setSchoolAnnouncements([]);
      });

    return () => {
      active = false;
    };
  }, [studentSession]);

  // Recent studied (last 5)
  const recentStudied = useMemo(() => {
    return studiedChapterIds
      .map((id) => chapterById.get(id))
      .filter(Boolean)
      .slice(-5)
      .reverse() as typeof ALL_CHAPTERS;
  }, [chapterById, studiedChapterIds]);

  // Suggested next (bookmarked but not studied)
  const suggested = useMemo(() => {
    return bookmarkedChapterIds
      .filter((id) => !studiedChapterIds.includes(id))
      .map((id) => chapterById.get(id))
      .filter(Boolean)
      .slice(0, 3) as typeof ALL_CHAPTERS;
  }, [bookmarkedChapterIds, chapterById, studiedChapterIds]);

  useEffect(() => {
    setMounted(true);
    let quizSum = 0, quizCount = 0, due = 0;
    const now = new Date();
    const chapterProfiles: LearningProfile[] = [];
    for (const ch of visibleChapters) {
      const score = localStorage.getItem(`quiz-score-[${ch.id}]`);
      if (score) { quizCount++; quizSum += parseInt(score, 10); }
      const parsedScore = Number(score);
      const quizScore = Number.isFinite(parsedScore) && parsedScore > 0 ? parsedScore : null;
      let chapterDue = 0;
      if (ch.flashcards) {
        for (let idx = 0; idx < ch.flashcards.length; idx++) {
          const s = localStorage.getItem(`fsrs-[${ch.id}]-${idx}`);
          if (s) {
            try {
              if (new Date(JSON.parse(s).due) <= now) {
                due++;
                chapterDue++;
              }
            }
            catch {
              due++;
              chapterDue++;
            }
          } else {
            due++;
            chapterDue++;
          }
        }
      }

      chapterProfiles.push(
        buildLearningProfile({
          chapterId: ch.id,
          quizScore,
          flashcardsDue: chapterDue,
          studied: studiedChapterIds.includes(ch.id),
          bookmarked: bookmarkedChapterIds.includes(ch.id),
          pyqAvgMarks: getPYQData(ch.id)?.avgMarks ?? 0,
        })
      );
    }
    setQuizzesTaken(quizCount);
    setAvgQuizScore(quizCount > 0 ? Math.round(quizSum / quizCount) : 0);
    setCardsDue(due);
    setWeakProfiles(rankWeakChapters(chapterProfiles).filter((profile) => profile.weakTags.length > 0).slice(0, 3));
  }, [bookmarkedChapterIds, studiedChapterIds, visibleChapters]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#FDFAF6] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-saffron-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-navy-700 to-navy-900 text-white px-4 pt-12 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-saffron-500/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="text-white/60 text-sm font-medium mb-1">
                {studentSession?.studentName ? `Welcome back, ${studentSession.studentName}` : 'Welcome back'}
              </div>
              <h1 className="font-fraunces text-3xl sm:text-4xl font-bold leading-tight">My Dashboard</h1>
              <p className="text-white/70 mt-1.5 text-sm">
                {studentSession
                  ? `Class ${studentSession.classLevel}${studentSession.section ? ` • Section ${studentSession.section}` : ''} personalized learning view.`
                  : 'Track progress, weak zones, and teacher-assigned study flow.'}
              </p>
              <div className="mt-2 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                Focus track: {dashboardTrack}
              </div>
            </div>
            {/* Overall ring */}
            <div className="flex items-center gap-4 bg-white/10 border border-white/15 rounded-2xl px-5 py-3">
              <div className="relative">
                <ProgressRing pct={overallPct} size={72} stroke={7} color="#F97316" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">{overallPct}%</span>
                </div>
              </div>
              <div>
                <div className="text-white font-semibold">{studiedCount} / {totalChapters}</div>
                <div className="text-white/60 text-xs">chapters studied</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-6 relative z-10 pb-12">

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Target}     label="Chapters Studied" value={studiedCount}    sub={`of ${totalChapters} total`}    color="bg-emerald-500" href="/chapters" />
          <StatCard icon={Star}       label="Bookmarked"       value={bookmarkedChapterIds.length} sub="saved chapters"       color="bg-amber-500"  href="/bookmarks" />
          <StatCard icon={Activity}   label="Quizzes Taken"    value={quizzesTaken}   sub={avgQuizScore > 0 ? `avg ${avgQuizScore}%` : '—'} color="bg-sky-500" />
          <StatCard icon={BrainCircuit} label="Flashcards Due" value={cardsDue}       sub="review today"                    color="bg-purple-500" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">

          {/* ── LEFT 2/3 ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Subject rings */}
            <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
              <h2 className="font-fraunces text-lg font-bold text-navy-700 mb-4 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-saffron-500" />
                Progress by Subject
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {orderedSubjects.map((subj) => (
                  <SubjectCard
                    key={subj}
                    subject={subj}
                    studied={subjectProgress.bySubject[subj]?.studied ?? 0}
                    total={subjectProgress.bySubject[subj]?.total ?? 0}
                  />
                ))}
              </div>
            </div>

            {/* Class breakdown */}
            <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
              <h2 className="font-fraunces text-lg font-bold text-navy-700 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-saffron-500" />
                Progress by Class
              </h2>
              <div className="space-y-5">
                <ClassBar cls={10} studied={subjectProgress.byClass[10]?.studied ?? 0} total={subjectProgress.byClass[10]?.total ?? 0} />
                <ClassBar cls={12} studied={subjectProgress.byClass[12]?.studied ?? 0} total={subjectProgress.byClass[12]?.total ?? 0} />
              </div>
            </div>

            {/* Recent activity */}
            {recentStudied.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
                <h2 className="font-fraunces text-lg font-bold text-navy-700 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-saffron-500" />
                  Recently Studied
                </h2>
                <ul className="space-y-2">
                  {recentStudied.map((ch) => (
                    <li key={ch.id}>
                      <Link
                        href={`/chapters/${ch.id}`}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
                      >
                        <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-navy-700 truncate">{ch.title}</div>
                          <div className="text-xs text-[#8A8AAA]">{ch.subject} · Class {ch.classLevel}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-saffron-500 transition-colors flex-shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── RIGHT 1/3 ── */}
          <div className="space-y-5">

            {/* Motivational card */}
            <div className="bg-gradient-to-br from-saffron-500 to-saffron-600 text-white rounded-2xl p-5">
              <Zap className="w-7 h-7 text-white/80 mb-3" />
              <div className="font-fraunces text-xl font-bold mb-1 leading-tight">
                {overallPct === 0 ? 'Start your journey!' : overallPct < 30 ? 'Great start!' : overallPct < 60 ? 'Keep going!' : overallPct < 90 ? 'Almost there!' : 'Champion!'}
              </div>
              <p className="text-white/80 text-sm leading-relaxed">
                {studiedCount === 0
                  ? 'Pick a chapter and mark it as studied to track your progress here.'
                  : `You\'ve studied ${studiedCount} chapter${studiedCount !== 1 ? 's' : ''}. ${totalChapters - studiedCount} more to go — you\'re doing great!`}
              </p>
              <Link
                href="/chapters"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl transition-colors"
              >
                <BookOpen className="w-4 h-4" /> Browse Chapters
              </Link>
            </div>

            {(teacherAssignments.length > 0 || teacherAnnouncements.length > 0) && (
              <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
                <h2 className="font-fraunces text-base font-bold text-navy-700 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-500" />
                  Personalized by Teachers
                </h2>
                {teacherAssignments.length > 0 && (
                  <div className="space-y-2">
                    {teacherAssignments.slice(0, 3).map((pack) => (
                      <Link
                        key={pack.packId}
                        href={pack.shareUrl || `/practice/assignment/${pack.packId}`}
                        className="block rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 hover:bg-indigo-100"
                      >
                        <p className="text-xs font-semibold text-indigo-900 truncate">{pack.title}</p>
                        <p className="text-[11px] text-indigo-700">
                          {pack.subject} • {pack.questionCount}Q • {pack.estimatedTimeMinutes} min
                          {pack.teacherName ? ` • ${pack.teacherName}` : ''}
                        </p>
                        {pack.dueDate && (
                          <p className="text-[11px] text-indigo-700/80">Due: {pack.dueDate}</p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
                {teacherAnnouncements.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {teacherAnnouncements.slice(0, 2).map((notice) => (
                      <div key={notice.id} className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                        <p className="text-xs font-semibold text-amber-900 truncate">{notice.title}</p>
                        <p className="text-[11px] text-amber-800 truncate">{notice.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(attendanceSummary || resourceFeed.length > 0 || eventFeed.length > 0 || gradeFeed.length > 0 || todayTimetable.length > 0 || schoolAnnouncements.length > 0) && (
              <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
                <h2 className="font-fraunces text-base font-bold text-navy-700 mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  School Ops Snapshot
                </h2>

                {attendanceSummary && (
                  <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                    <p className="text-xs font-semibold text-emerald-800">
                      Attendance: {attendanceSummary.percentage}% ({attendanceSummary.total} marked days)
                    </p>
                  </div>
                )}

                {todayTimetable.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-[#4A4A6A] mb-1">Today&apos;s Schedule</p>
                    <div className="space-y-1.5">
                      {todayTimetable.map((slot) => (
                        <div key={`${slot.dayOfWeek}-${slot.periodNo}-${slot.subject}`} className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1.5">
                          <p className="text-[11px] font-semibold text-indigo-900">P{slot.periodNo}: {slot.subject}</p>
                          {(slot.startTime || slot.endTime) && (
                            <p className="text-[10px] text-indigo-700">{slot.startTime || '--'} - {slot.endTime || '--'}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {eventFeed.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-[#4A4A6A] mb-1">Upcoming Events</p>
                    <div className="space-y-1.5">
                      {eventFeed.map((event) => (
                        <div key={event.id} className="rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1.5">
                          <p className="text-[11px] font-semibold text-amber-900">{event.title}</p>
                          <p className="text-[10px] text-amber-700">{new Date(event.eventDate).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {resourceFeed.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-[#4A4A6A] mb-1">New Resources</p>
                    <div className="space-y-1.5">
                      {resourceFeed.map((resource) => (
                        <div key={resource.id} className="rounded-lg border border-cyan-100 bg-cyan-50 px-2.5 py-1.5">
                          <p className="text-[11px] font-semibold text-cyan-900 truncate">{resource.title}</p>
                          <p className="text-[10px] text-cyan-700">{resource.type.toUpperCase()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {gradeFeed.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#4A4A6A] mb-1">Latest Grades</p>
                    <div className="space-y-1.5">
                      {gradeFeed.map((grade) => (
                        <div key={grade.submissionId} className="rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-rose-900">{grade.subject}</span>
                          <span className="text-[11px] font-bold text-rose-700">{grade.score}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {schoolAnnouncements.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-[#4A4A6A] mb-1">School Announcements</p>
                    <div className="space-y-1.5">
                      {schoolAnnouncements.map((notice) => (
                        <div key={notice.id} className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1.5">
                          <p className="text-[11px] font-semibold text-indigo-900 truncate">{notice.title}</p>
                          <p className="text-[10px] text-indigo-700 truncate">{notice.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Suggested chapters (bookmarked, not studied) */}
            {suggested.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
                <h2 className="font-fraunces text-base font-bold text-navy-700 mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  Study Next
                </h2>
                <p className="text-xs text-[#8A8AAA] mb-3">Bookmarked but not yet studied:</p>
                <ul className="space-y-2">
                  {suggested.map((ch) => (
                    <li key={ch.id}>
                      <Link
                        href={`/chapters/${ch.id}`}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-amber-50 transition-colors group"
                      >
                        <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-navy-700 truncate">{ch.title}</div>
                          <div className="text-[10px] text-[#8A8AAA]">Class {ch.classLevel} · {ch.subject}</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-amber-500 flex-shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {weakProfiles.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                <h2 className="font-fraunces text-base font-bold text-amber-800 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-600" />
                  Adaptive Focus Queue
                </h2>
                <div className="space-y-2">
                  {weakProfiles.map((profile) => (
                    <Link
                      key={profile.chapterId}
                      href={`/chapters/${profile.chapterId}`}
                      className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border border-amber-100 hover:border-amber-300 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-[11px] font-bold shrink-0">
                        {profile.weakTags.length}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-amber-900 truncate">
                          {chapterById.get(profile.chapterId)?.title ?? profile.chapterId}
                        </div>
                        <div className="text-[11px] text-amber-700 mt-0.5 truncate">
                          {profile.recommendedActions[0]}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <RevisionPlanCard
              classLevel={plannerClassLevel}
              weakChapterIds={plannerWeakChapterIds}
            />

            {topWeakProfile && topWeakChapter && (
              <DashboardChapterCoach
                chapterId={topWeakProfile.chapterId}
                chapterTitle={topWeakChapter.title}
                quizScore={topWeakProfile.quizScore}
                flashcardsDue={topWeakProfile.flashcardsDue}
                studied={topWeakProfile.studied}
                bookmarked={topWeakProfile.bookmarked}
              />
            )}

            {/* Papers quick link */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span className="font-semibold text-indigo-700 text-sm">Previous Year Papers</span>
              </div>
              <p className="text-xs text-indigo-600/80 mb-3 leading-relaxed">
                {paperStats.board} board exam papers · {paperStats.sample} sample papers · 17 years covered
              </p>
              <Link
                href="/papers"
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 text-white px-3.5 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                <Award className="w-3.5 h-3.5" /> Browse Papers
              </Link>
            </div>

            {/* Flashcards nudge */}
            {cardsDue > 0 && (
              <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5">
                <BrainCircuit className="w-5 h-5 text-purple-600 mb-2" />
                <div className="font-semibold text-purple-700 text-sm mb-1">
                  {cardsDue} flashcard{cardsDue !== 1 ? 's' : ''} due
                </div>
                <p className="text-xs text-purple-600/80 mb-3">
                  Review them now to keep concepts fresh in your memory.
                </p>
                <Link
                  href="/chapters"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-purple-600 text-white px-3.5 py-2 rounded-xl hover:bg-purple-700 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" /> Open Chapters
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

