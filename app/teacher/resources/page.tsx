'use client';

import { useEffect, useMemo, useState, type ElementType } from 'react';
import { BookMarked, ExternalLink, FileText, Image, Link as LinkIcon, RefreshCw, Trash2, Video } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';
import { ALL_CHAPTERS } from '@/lib/data';

type ResourceType = 'pdf' | 'link' | 'video' | 'image';

interface ResourceItem {
  id: string;
  title: string;
  description?: string;
  type: ResourceType;
  url: string;
  subject?: string;
  classLevel?: 10 | 12;
  section?: string;
  chapterId?: string;
  createdAt: string;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

const TYPE_ICON: Record<ResourceType, ElementType> = {
  pdf: FileText,
  link: LinkIcon,
  video: Video,
  image: Image,
};

const TYPE_STYLE: Record<ResourceType, string> = {
  pdf: 'bg-rose-50 text-rose-700 border-rose-200',
  link: 'bg-amber-50 text-amber-700 border-amber-200',
  video: 'bg-purple-50 text-purple-700 border-purple-200',
  image: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function ResourcesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [form, setForm] = useState({
    title: '',
    type: 'link' as ResourceType,
    url: '',
    description: '',
    subject: '',
    classLevel: '' as '' | '10' | '12',
    section: '',
    chapterId: '',
  });

  async function loadResources() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, resourcesRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher/resources?mine=1&limit=300', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        setError('Session expired. Please sign in again.');
        return;
      }
      const body = await resourcesRes.json().catch(() => null);
      if (!resourcesRes.ok) {
        setError(body?.message || 'Failed to load resources.');
        setResources([]);
        return;
      }
      const data = unwrap<{ resources?: ResourceItem[] }>(body);
      setResources(Array.isArray(data.resources) ? data.resources : []);
    } catch {
      setError('Failed to load resources.');
      setResources([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadResources();
  }, []);

  const chapterOptions = useMemo(
    () =>
      ALL_CHAPTERS
        .filter((chapter) => chapter.classLevel !== 11)
        .sort((a, b) => a.classLevel - b.classLevel || a.subject.localeCompare(b.subject) || a.chapterNumber - b.chapterNumber),
    []
  );

  async function createResource() {
    if (!form.title.trim() || !form.url.trim()) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/teacher/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          type: form.type,
          url: form.url.trim(),
          description: form.description.trim() || undefined,
          subject: form.subject.trim() || undefined,
          classLevel: form.classLevel ? Number(form.classLevel) : undefined,
          section: form.section.trim() || undefined,
          chapterId: form.chapterId.trim() || undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to add resource.');
        return;
      }
      setForm({
        title: '',
        type: form.type,
        url: '',
        description: '',
        subject: '',
        classLevel: '',
        section: '',
        chapterId: '',
      });
      await loadResources();
    } catch {
      setError('Failed to add resource.');
    } finally {
      setSaving(false);
    }
  }

  async function removeResource(id: string) {
    try {
      const response = await fetch(`/api/teacher/resources?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message || 'Failed to delete resource.');
        return;
      }
      setResources((prev) => prev.filter((resource) => resource.id !== id));
    } catch {
      setError('Failed to delete resource.');
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <BookMarked className="h-6 w-6 text-amber-600" />
            Resources
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Upload links and study material for your sections.</p>
        </div>
        <button
          onClick={() => void loadResources()}
          disabled={loading}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50 disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </span>
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="mb-6 rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-700">Add Resource</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Title"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <select
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as ResourceType }))}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="link">Link</option>
            <option value="pdf">PDF</option>
            <option value="video">Video</option>
            <option value="image">Image</option>
          </select>
          <input
            value={form.url}
            onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
            placeholder="https://..."
            className="sm:col-span-2 rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <textarea
            rows={3}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description (optional)"
            className="sm:col-span-2 rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
          />
          <input
            value={form.subject}
            onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
            placeholder="Subject (optional)"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <select
            value={form.classLevel}
            onChange={(event) => setForm((prev) => ({ ...prev, classLevel: event.target.value as '' | '10' | '12' }))}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">Class (optional)</option>
            <option value="10">Class 10</option>
            <option value="12">Class 12</option>
          </select>
          <input
            value={form.section}
            onChange={(event) => setForm((prev) => ({ ...prev, section: event.target.value }))}
            placeholder="Section (optional)"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <select
            value={form.chapterId}
            onChange={(event) => setForm((prev) => ({ ...prev, chapterId: event.target.value }))}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">Chapter (optional)</option>
            {chapterOptions.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                Class {chapter.classLevel} | {chapter.subject} | Ch {chapter.chapterNumber} - {chapter.title}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4">
          <button
            onClick={() => void createResource()}
            disabled={saving || !form.title.trim() || !form.url.trim()}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Add Resource'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading resources...
        </div>
      ) : resources.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No resources uploaded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {resources.map((resource) => {
            const Icon = TYPE_ICON[resource.type] ?? LinkIcon;
            const color = TYPE_STYLE[resource.type] ?? 'bg-gray-50 text-gray-700 border-gray-200';
            return (
              <div key={resource.id} className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className={clsx('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{resource.title}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {resource.subject || 'General'}
                          {resource.classLevel ? ` | Class ${resource.classLevel}` : ''}
                          {resource.section ? ` | Section ${resource.section}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open
                        </a>
                        <button
                          onClick={() => void removeResource(resource.id)}
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                    {resource.description && <p className="mt-2 text-sm text-[#4A4A6A]">{resource.description}</p>}
                    <p className="mt-1 text-[11px] text-gray-400">{new Date(resource.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
