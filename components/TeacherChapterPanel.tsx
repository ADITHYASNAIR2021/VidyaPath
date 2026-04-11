'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, ExternalLink, Megaphone, Star } from 'lucide-react';

interface TeacherChapterPanelProps {
  chapterId: string;
  classLevel?: 10 | 12;
  subject: string;
  section?: string;
  defaultQuizUrl?: string;
}

interface PublicTeacherConfig {
  updatedAt: string;
  importantTopics: Record<string, string[]>;
  quizLinks: Record<string, string>;
  announcements: Array<{ id: string; title: string; body: string; createdAt: string }>;
  assignmentPacks?: Array<{
    chapterId: string;
    packId: string;
    title: string;
    dueDate?: string;
    portion?: string;
    questionCount: number;
    estimatedTimeMinutes: number;
    classLevel: 10 | 12;
    subject: string;
    section?: string;
    status: 'draft' | 'review' | 'published' | 'archived';
    shareUrl: string;
    updatedAt: string;
  }>;
  scopeFeed?: {
    quizLinks: Array<{ chapterId: string; url: string; classLevel: 10 | 12; subject: string; section?: string; updatedAt: string }>;
    importantTopics: Array<{ chapterId: string; topics: string[]; classLevel: 10 | 12; subject: string; section?: string; updatedAt: string }>;
    announcements: Array<{ id: string; title: string; body: string; chapterId?: string; classLevel: 10 | 12; subject: string; section?: string; updatedAt: string }>;
    assignmentPacks: Array<{
      chapterId: string;
      packId: string;
      title: string;
      dueDate?: string;
      portion?: string;
      questionCount: number;
      estimatedTimeMinutes: number;
      classLevel: 10 | 12;
      subject: string;
      section?: string;
      teacherName?: string;
      status: 'draft' | 'review' | 'published' | 'archived';
      shareUrl: string;
      updatedAt: string;
    }>;
  };
}

export default function TeacherChapterPanel({ chapterId, classLevel, subject, section, defaultQuizUrl }: TeacherChapterPanelProps) {
  const [config, setConfig] = useState<PublicTeacherConfig | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const query = new URLSearchParams({
          chapterId,
          subject,
          ...(section ? { section } : {}),
          ...(typeof classLevel === 'number' ? { classLevel: String(classLevel) } : {}),
        });
        const response = await fetch(`/api/teacher?${query.toString()}`, { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || !active) return;
        setConfig(data as PublicTeacherConfig);
      } catch {
        // Silent fail for student view.
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [chapterId, classLevel, subject, section]);

  const effectiveQuizUrl = useMemo(() => {
    const scoped = (config?.scopeFeed?.quizLinks ?? [])
      .filter((item) => item.chapterId === chapterId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.url;
    const override = config?.quizLinks?.[chapterId];
    return scoped || override || defaultQuizUrl || '';
  }, [chapterId, config?.scopeFeed?.quizLinks, config?.quizLinks, defaultQuizUrl]);

  const importantTopics = useMemo(() => {
    const scoped = (config?.scopeFeed?.importantTopics ?? [])
      .filter((item) => item.chapterId === chapterId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .flatMap((item) => item.topics);
    const fallback = config?.importantTopics?.[chapterId] ?? [];
    const merged = [...scoped, ...fallback];
    return Array.from(new Set(merged)).slice(0, 8);
  }, [chapterId, config?.scopeFeed?.importantTopics, config?.importantTopics]);

  const latestQuizMeta = useMemo(
    () =>
      (config?.scopeFeed?.quizLinks ?? [])
        .filter((item) => item.chapterId === chapterId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0],
    [chapterId, config?.scopeFeed?.quizLinks]
  );

  const latestTopicsMeta = useMemo(
    () =>
      (config?.scopeFeed?.importantTopics ?? [])
        .filter((item) => item.chapterId === chapterId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0],
    [chapterId, config?.scopeFeed?.importantTopics]
  );

  const announcements = useMemo(() => {
    const scoped = (config?.scopeFeed?.announcements ?? [])
      .filter((item) => !item.chapterId || item.chapterId === chapterId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => ({ id: item.id, title: item.title, body: item.body, createdAt: item.updatedAt }));
    const fallback = config?.announcements ?? [];
    const merged = [...scoped, ...fallback];
    const seen = new Set<string>();
    const output: Array<{ id: string; title: string; body: string; createdAt: string }> = [];
    for (const item of merged) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      output.push(item);
      if (output.length >= 4) break;
    }
    return output;
  }, [chapterId, config?.scopeFeed?.announcements, config?.announcements]);

  const assignmentPacks = useMemo(
    () => {
      const scoped = (config?.scopeFeed?.assignmentPacks ?? [])
        .filter((item) => item.chapterId === chapterId && item.status === 'published');
      const privateFallback = (config?.assignmentPacks ?? [])
        .filter((item) => item.chapterId === chapterId && item.status === 'published')
        .map((item) => ({
          chapterId: item.chapterId,
          packId: item.packId,
          title: item.title,
          dueDate: item.dueDate,
          portion: item.portion,
          questionCount: item.questionCount,
          estimatedTimeMinutes: item.estimatedTimeMinutes,
          classLevel: item.classLevel,
          subject: item.subject,
          section: item.section,
          teacherName: undefined,
          status: item.status,
          shareUrl: item.shareUrl,
          updatedAt: item.updatedAt,
        }));
      const merged = [...scoped];
      const seen = new Set(scoped.map((item) => item.packId));
      for (const item of privateFallback) {
        if (seen.has(item.packId)) continue;
        merged.push(item);
      }
      return merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
    },
    [chapterId, config?.scopeFeed?.assignmentPacks, config?.assignmentPacks]
  );

  return (
    <div className="space-y-4">
      {importantTopics.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          <h3 className="font-fraunces text-base font-bold text-indigo-800 flex items-center gap-2">
            <Star className="w-4 h-4 text-indigo-600" />
            Teacher Priority Topics
          </h3>
          {latestTopicsMeta && (
            <p className="text-[11px] text-indigo-700 mt-1">
              Scope: Class {latestTopicsMeta.classLevel} {latestTopicsMeta.subject}
              {latestTopicsMeta.section ? ` - Section ${latestTopicsMeta.section}` : ''} | Updated {new Date(latestTopicsMeta.updatedAt).toLocaleString()}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {importantTopics.map((topic) => (
              <span key={topic} className="text-xs font-semibold bg-white border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-full">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {announcements.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-4">
          <h3 className="font-fraunces text-base font-bold text-navy-700 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-saffron-500" />
            Teacher Announcements
          </h3>
          <div className="mt-3 space-y-2">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                <p className="text-sm font-semibold text-amber-800">{announcement.title}</p>
                <p className="text-xs text-amber-700 mt-0.5">{announcement.body}</p>
                <p className="text-[11px] text-amber-600 mt-1">{new Date(announcement.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {assignmentPacks.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-4">
          <h3 className="font-fraunces text-base font-bold text-navy-700 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-emerald-600" />
            Teacher Assignments
          </h3>
          <div className="mt-3 space-y-2">
            {assignmentPacks.map((pack) => (
              <div key={pack.packId} className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                <p className="text-sm font-semibold text-emerald-900">{pack.title}</p>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  {pack.questionCount} questions | {pack.estimatedTimeMinutes} min
                  {pack.dueDate ? ` | due ${pack.dueDate}` : ''}
                  {pack.teacherName ? ` | ${pack.teacherName}` : ''}
                </p>
                {pack.portion && <p className="text-[11px] text-emerald-700 mt-0.5">Portion: {pack.portion}</p>}
                <div className="mt-2">
                  <a
                    href={pack.shareUrl || `/practice/assignment/${pack.packId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 hover:bg-emerald-800"
                  >
                    Start Assignment
                  </a>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-emerald-800">
            Use student login before opening assignments to unlock class/section-scoped access and result tracking.
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
        <h2 className="font-fraunces text-lg font-bold text-navy-700 mb-3 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-saffron-500" />
          Chapter Quiz
        </h2>
        {effectiveQuizUrl ? (
          <div>
                <p className="text-sm text-[#4A4A6A] mb-4">
                  Attempt the latest teacher-provided quiz for this chapter.
                </p>
                {latestQuizMeta && (
                  <p className="text-[11px] text-[#6A6A84] mb-3">
                    Scope: Class {latestQuizMeta.classLevel} {latestQuizMeta.subject}
                    {latestQuizMeta.section ? ` - Section ${latestQuizMeta.section}` : ''} | Updated {new Date(latestQuizMeta.updatedAt).toLocaleString()}
                  </p>
                )}
                <a
                  href={effectiveQuizUrl}
                  target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-saffron-500 hover:bg-saffron-600 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm"
            >
              Start Quiz
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700">No teacher quiz link yet</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Use VidyaAI-generated MCQs below until your teacher publishes a quiz.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
