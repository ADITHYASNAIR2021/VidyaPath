'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Plus, RefreshCw, Save, UserCog } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

interface ClassSection {
  id: string;
  classLevel: 10 | 12;
  section: string;
  batch?: string;
  classTeacherId?: string;
  classTeacherName?: string;
  status: 'active' | 'inactive' | 'archived';
}

interface TeacherOption {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function ClassSectionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingSectionId, setSavingSectionId] = useState<string>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    classLevel: 12 as 10 | 12,
    section: '',
    batch: '',
  });
  const [draftTeachers, setDraftTeachers] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, sectionsRes, teachersRes] = await Promise.all([
        fetch('/api/admin/session/me', { cache: 'no-store' }),
        fetch('/api/admin/class-sections', { cache: 'no-store' }),
        fetch('/api/admin/teachers', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        router.replace('/admin/login');
        return;
      }

      const sectionsBody = await sectionsRes.json().catch(() => null);
      const teachersBody = await teachersRes.json().catch(() => null);

      const sectionData = unwrap<{ sections?: ClassSection[] } | null>(sectionsBody);
      const teacherData = unwrap<{ teachers?: Array<{ id: string; name: string; status: 'active' | 'inactive' }> } | null>(teachersBody);

      const nextSections = Array.isArray(sectionData?.sections) ? sectionData.sections : [];
      const nextTeachers = Array.isArray(teacherData?.teachers)
        ? teacherData.teachers.map((item) => ({ id: item.id, name: item.name, status: item.status }))
        : [];

      setSections(nextSections);
      setTeachers(nextTeachers);

      const nextDrafts: Record<string, string> = {};
      for (const section of nextSections) {
        nextDrafts[section.id] = section.classTeacherId ?? '';
      }
      setDraftTeachers(nextDrafts);
    } catch {
      setError('Failed to load class sections.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createSection() {
    if (!form.section.trim()) return;
    setCreating(true);
    setError('');
    try {
      const response = await fetch('/api/admin/class-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classLevel: form.classLevel,
          section: form.section.trim(),
          batch: form.batch.trim() || undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to create section.');
        return;
      }
      setShowCreate(false);
      setForm({ classLevel: 12, section: '', batch: '' });
      setSuccess('Section created.');
      setTimeout(() => setSuccess(''), 2000);
      await load();
    } catch {
      setError('Failed to create section.');
    } finally {
      setCreating(false);
    }
  }

  async function patchSection(
    sectionId: string,
    patch: Partial<{ classTeacherId: string | null; status: 'active' | 'inactive' | 'archived' }>
  ) {
    setSavingSectionId(sectionId);
    setError('');
    try {
      const response = await fetch(`/api/admin/class-sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to update section.');
        return;
      }
      setSuccess('Section updated.');
      setTimeout(() => setSuccess(''), 1800);
      await load();
    } catch {
      setError('Failed to update section.');
    } finally {
      setSavingSectionId('');
    }
  }

  const activeTeachers = useMemo(
    () => teachers.filter((teacher) => teacher.status === 'active'),
    [teachers]
  );

  const grouped = useMemo(
    () => ({
      10: sections.filter((item) => item.classLevel === 10),
      12: sections.filter((item) => item.classLevel === 12),
    }),
    [sections]
  );

  return (
    <div className="mx-auto max-w-5xl p-6">
      <BackButton href="/admin" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <Layers className="h-6 w-6 text-indigo-600" />
            Class Sections
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Create sections, assign class teachers, and manage section status.</p>
        </div>
        <button
          onClick={() => setShowCreate((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Section
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      )}

      {showCreate && (
        <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-indigo-800">Create New Section</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Class</label>
              <select
                value={form.classLevel}
                onChange={(event) => setForm((prev) => ({ ...prev, classLevel: Number(event.target.value) as 10 | 12 }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value={10}>Class 10</option>
                <option value={12}>Class 12</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Section</label>
              <input
                value={form.section}
                onChange={(event) => setForm((prev) => ({ ...prev, section: event.target.value }))}
                placeholder="A"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Batch (optional)</label>
              <input
                value={form.batch}
                onChange={(event) => setForm((prev) => ({ ...prev, batch: event.target.value }))}
                placeholder="2026"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void createSection()}
              disabled={!form.section.trim() || creating}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading sections...
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
          No class sections configured yet.
        </div>
      ) : (
        ([10, 12] as const).map((classLevel) =>
          grouped[classLevel].length > 0 ? (
            <div key={classLevel} className="mb-6">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">Class {classLevel}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {grouped[classLevel].map((section) => (
                  <div
                    key={section.id}
                    className={clsx(
                      'rounded-2xl border p-4 shadow-sm',
                      section.status === 'active' ? 'border-[#E8E4DC] bg-white' : 'border-gray-200 bg-gray-50'
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">
                        Class {section.classLevel} - {section.section}
                      </p>
                      <span
                        className={clsx(
                          'rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize',
                          section.status === 'active' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                          section.status === 'inactive' && 'border-amber-200 bg-amber-50 text-amber-700',
                          section.status === 'archived' && 'border-gray-200 bg-gray-100 text-gray-600'
                        )}
                      >
                        {section.status}
                      </span>
                    </div>

                    <p className="text-xs text-gray-500 mb-3">Batch: {section.batch || 'Not set'}</p>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                        <UserCog className="h-3.5 w-3.5" />
                        Class Teacher
                      </label>
                      <select
                        value={draftTeachers[section.id] ?? ''}
                        onChange={(event) =>
                          setDraftTeachers((prev) => ({
                            ...prev,
                            [section.id]: event.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {activeTeachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() =>
                          void patchSection(section.id, {
                            classTeacherId: (draftTeachers[section.id] || null),
                          })
                        }
                        disabled={savingSectionId === section.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Save Teacher
                      </button>
                      {section.status !== 'active' && (
                        <button
                          onClick={() => void patchSection(section.id, { status: 'active' })}
                          disabled={savingSectionId === section.id}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          Activate
                        </button>
                      )}
                      {section.status !== 'inactive' && (
                        <button
                          onClick={() => void patchSection(section.id, { status: 'inactive' })}
                          disabled={savingSectionId === section.id}
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                        >
                          Deactivate
                        </button>
                      )}
                      {section.status !== 'archived' && (
                        <button
                          onClick={() => void patchSection(section.id, { status: 'archived' })}
                          disabled={savingSectionId === section.id}
                          className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null
        )
      )}
    </div>
  );
}
