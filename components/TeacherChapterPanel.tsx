'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, ExternalLink, Megaphone, Star } from 'lucide-react';

interface TeacherChapterPanelProps {
  chapterId: string;
  defaultQuizUrl?: string;
}

interface PublicTeacherConfig {
  updatedAt: string;
  importantTopics: Record<string, string[]>;
  quizLinks: Record<string, string>;
  announcements: Array<{ id: string; title: string; body: string; createdAt: string }>;
}

export default function TeacherChapterPanel({ chapterId, defaultQuizUrl }: TeacherChapterPanelProps) {
  const [config, setConfig] = useState<PublicTeacherConfig | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/teacher', { cache: 'no-store' });
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
  }, []);

  const effectiveQuizUrl = useMemo(() => {
    const override = config?.quizLinks?.[chapterId];
    return override || defaultQuizUrl || '';
  }, [chapterId, config?.quizLinks, defaultQuizUrl]);

  const importantTopics = (config?.importantTopics?.[chapterId] ?? []).slice(0, 8);
  const announcements = (config?.announcements ?? []).slice(0, 2);

  return (
    <div className="space-y-4">
      {importantTopics.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          <h3 className="font-fraunces text-base font-bold text-indigo-800 flex items-center gap-2">
            <Star className="w-4 h-4 text-indigo-600" />
            Teacher Priority Topics
          </h3>
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
              </div>
            ))}
          </div>
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
