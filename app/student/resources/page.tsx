'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Link as LinkIcon,
  Video,
  Image as ImageIcon,
  RefreshCw,
  ExternalLink,
  BookOpen,
} from 'lucide-react';

interface Resource {
  id: string;
  title: string;
  description: string;
  type: 'notes' | 'pdf' | 'link' | 'video' | 'image';
  url: string;
  subject: string;
  chapterId: string;
  classLevel: number;
  section: string;
  teacherName: string;
  createdAt: string;
}

interface ResourcesData {
  resources: Resource[];
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

const TYPE_BADGE: Record<Resource['type'], string> = {
  notes: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  pdf: 'bg-rose-50 text-rose-700 border-rose-200',
  link: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  video: 'bg-violet-50 text-violet-700 border-violet-200',
  image: 'bg-amber-50 text-amber-700 border-amber-200',
};

const SUBJECT_BADGE: Record<string, string> = {
  Physics: 'bg-blue-50 text-blue-700 border-blue-200',
  Chemistry: 'bg-green-50 text-green-700 border-green-200',
  Biology: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Mathematics: 'bg-purple-50 text-purple-700 border-purple-200',
  Maths: 'bg-purple-50 text-purple-700 border-purple-200',
  English: 'bg-orange-50 text-orange-700 border-orange-200',
  History: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Geography: 'bg-teal-50 text-teal-700 border-teal-200',
};

function getSubjectBadge(subject: string): string {
  return SUBJECT_BADGE[subject] ?? 'bg-gray-50 text-gray-700 border-gray-200';
}

function TypeIcon({ type }: { type: Resource['type'] }) {
  const cls = 'h-5 w-5';
  if (type === 'notes' || type === 'pdf') return <FileText className={cls} />;
  if (type === 'link') return <LinkIcon className={cls} />;
  if (type === 'video') return <Video className={cls} />;
  if (type === 'image') return <ImageIcon className={cls} />;
  return <BookOpen className={cls} />;
}

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'notes', label: 'Notes' },
  { value: 'pdf', label: 'PDF' },
  { value: 'link', label: 'Link' },
  { value: 'video', label: 'Video' },
  { value: 'image', label: 'Image' },
];

export default function StudentResourcesPage() {
  const router = useRouter();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/student/resources', { cache: 'no-store' });
      if (res.status === 401) {
        router.push('/student/login');
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          body && typeof body === 'object' && 'message' in (body as Record<string, unknown>)
            ? String((body as Record<string, unknown>).message)
            : 'Failed to load resources.';
        setError(msg);
        return;
      }
      const data = unwrap<ResourcesData>(body);
      setResources(data?.resources ?? []);
    } catch {
      setError('Failed to load resources.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subjects = ['all', ...Array.from(new Set(resources.map((r) => r.subject))).sort()];

  const filtered = resources.filter((r) => {
    const matchSubject = subjectFilter === 'all' || r.subject === subjectFilter;
    const matchType = typeFilter === 'all' || r.type === typeFilter;
    return matchSubject && matchType;
  });

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-fraunces text-2xl font-bold text-navy-700">Study Resources</h1>
            <p className="mt-1 text-sm text-[#6D6A7C]">Materials shared by your teachers.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-[#E8E4DC] bg-white px-4 py-2 text-sm font-semibold text-[#3D3A4E] shadow-sm hover:bg-[#F9F7F2] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="mt-5 flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-[#8A8AAA]">Subject</label>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="rounded-xl border border-[#E8E4DC] bg-white px-3 py-2 text-sm text-[#3D3A4E] shadow-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
            >
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Subjects' : s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-[#8A8AAA]">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-[#E8E4DC] bg-white px-3 py-2 text-sm text-[#3D3A4E] shadow-sm focus:outline-none focus:ring-2 focus:ring-navy-700"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-44 animate-pulse rounded-2xl border border-[#E8E4DC] bg-white"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <BookOpen className="h-10 w-10 text-[#C8C4BE]" />
            <p className="text-sm text-[#8A8AAA]">
              {resources.length === 0
                ? 'No resources yet. Your teacher will share study materials here.'
                : 'No resources match the selected filters.'}
            </p>
          </div>
        )}

        {/* Resource grid */}
        {!loading && filtered.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm p-5 flex flex-col gap-3"
              >
                {/* Top row: icon + type badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F4F1EB] text-[#3D3A4E]">
                      <TypeIcon type={r.type} />
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${TYPE_BADGE[r.type]}`}
                    >
                      {r.type}
                    </span>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getSubjectBadge(r.subject)}`}
                  >
                    {r.subject}
                  </span>
                </div>

                {/* Title */}
                <p className="font-semibold text-[#1E1B2E] leading-snug">{r.title}</p>

                {/* Description */}
                {r.description && (
                  <p className="text-sm text-[#6D6A7C] line-clamp-2 leading-relaxed">
                    {r.description}
                  </p>
                )}

                {/* Footer */}
                <div className="mt-auto flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-[#8A8AAA]">{r.teacherName}</p>
                    <p className="text-xs text-[#8A8AAA]">
                      {new Date(r.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-xl bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800 transition-colors"
                  >
                    Open
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
