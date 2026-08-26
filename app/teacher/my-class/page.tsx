'use client';

import { useEffect, useState, useCallback, type ChangeEvent } from 'react';
import {
  Users, UserPlus, RefreshCw, CheckCircle2, AlertCircle,
  PencilLine, KeyRound, UserMinus, UserCheck, BookOpen, X, Save,
  ChevronDown, ChevronUp, FileSpreadsheet, Download,
} from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClassSection {
  id: string;
  classLevel: 10 | 12;
  section: string;
  batch?: string;
  status: string;
}

interface StudentProfile {
  id: string;
  name: string;
  rollCode?: string;
  rollNo?: string;
  classLevel: 10 | 12;
  section?: string;
  batch?: string;
  status: 'active' | 'inactive';
  enrolledSubjects?: string[];
}

type Tab = 'roster' | 'add' | 'bulk';

const ALL_CLASS12_SUBJECTS = ['Physics', 'Chemistry', 'Biology', 'Math', 'Accountancy', 'Business Studies', 'Economics', 'English Core'];
const ALL_CLASS10_SUBJECTS = ['Physics', 'Chemistry', 'Biology', 'Math', 'English Core'];

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

function downloadStudentTemplate() {
  const csv = 'name,rollNo,parentPhone,parentName,subjects\nArjun Nair,1,9876543210,Ravi Nair,"Physics,Chemistry,Math,English Core"';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'vidyapath_class_students.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FeedbackBanner({ ok, message, onClose }: { ok: boolean; message: string; onClose: () => void }) {
  return (
    <div className={clsx('flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm mb-4', ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800')}>
      {ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function StudentRow({
  student,
  classLevel,
  onRefresh,
  setBanner,
}: {
  student: StudentProfile;
  classLevel: 10 | 12;
  onRefresh: () => void;
  setBanner: (b: { ok: boolean; message: string } | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(student.name);
  const [rollNo, setRollNo] = useState(student.rollNo || '');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Subject management (class 12 only)
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subjectsLoaded, setSubjectsLoaded] = useState(false);
  const [savingSubjects, setSavingSubjects] = useState(false);

  async function loadSubjects() {
    if (subjectsLoaded) return;
    try {
      const res = await fetch(`/api/teacher/my-class/students/${student.id}/subjects`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      const data = unwrap<{ subjects?: string[] } | null>(body);
      setSubjects(Array.isArray(data?.subjects) ? data.subjects : []);
      setSubjectsLoaded(true);
    } catch { /* ignore */ }
  }

  function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next) void loadSubjects();
  }

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (name.trim() !== student.name) body.name = name.trim();
      if (rollNo.trim() !== (student.rollNo || '')) body.rollNo = rollNo.trim();
      if (newPassword.trim()) body.password = newPassword.trim();
      if (Object.keys(body).length === 0) { setEditing(false); return; }
      const res = await fetch(`/api/teacher/my-class/students/${student.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const resBody = await res.json().catch(() => null);
      if (!res.ok) {
        setBanner({ ok: false, message: resBody?.message || 'Failed to save.' });
      } else {
        setEditing(false);
        setNewPassword('');
        setBanner({ ok: true, message: `${student.name} updated.` });
        onRefresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    const next = student.status === 'active' ? 'inactive' : 'active';
    const res = await fetch(`/api/teacher/my-class/students/${student.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setBanner({ ok: false, message: body?.message || 'Failed to update status.' });
    } else {
      setBanner({ ok: true, message: `${student.name} marked as ${next}.` });
      onRefresh();
    }
  }

  async function resetPassword() {
    setResetting(true);
    try {
      const response = await fetch(`/api/teacher/my-class/students/${student.id}/reset-password`, { method: 'POST' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setBanner({ ok: false, message: body?.message || 'Password reset failed.' });
        return;
      }
      const data = unwrap<{ temporaryPassword?: string } | null>(body);
      setBanner({
        ok: true,
        message: `One-time password for ${student.name}: ${data?.temporaryPassword || 'generated'}. Share it privately; a change is required at next login.`,
      });
    } finally {
      setResetting(false);
    }
  }

  async function saveSubjects() {
    setSavingSubjects(true);
    try {
      const res = await fetch(`/api/teacher/my-class/students/${student.id}/subjects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjects }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setBanner({ ok: false, message: body?.message || 'Failed to update subjects.' });
      } else {
        setBanner({ ok: true, message: `Subjects updated for ${student.name}.` });
      }
    } finally {
      setSavingSubjects(false);
    }
  }

  const availableSubjects = classLevel === 12 ? ALL_CLASS12_SUBJECTS : ALL_CLASS10_SUBJECTS;

  return (
    <div className={clsx('border border-[#E8E4DC] rounded-2xl bg-white overflow-hidden', student.status === 'inactive' && 'opacity-60')}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
          {student.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-navy-700 truncate">{student.name}</p>
          <p className="text-[11px] text-gray-400">{student.rollCode || student.rollNo || '—'} · {student.status}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setEditing((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
            title="Edit"
          >
            <PencilLine className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleStatus}
            className={clsx('p-1.5 rounded-lg transition-colors', student.status === 'active' ? 'hover:bg-rose-50 text-gray-400 hover:text-rose-600' : 'hover:bg-emerald-50 text-gray-400 hover:text-emerald-600')}
            title={student.status === 'active' ? 'Deactivate' : 'Activate'}
          >
            {student.status === 'active' ? <UserMinus className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleExpand}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-purple-600 transition-colors"
            title="Manage subjects"
          >
            <BookOpen className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleExpand} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Edit panel */}
      {editing && (
        <div className="border-t border-[#E8E4DC] bg-gray-50 px-4 py-3 space-y-2">
          <div className="grid sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-0.5">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-0.5">Roll No</label>
              <input value={rollNo} onChange={(e) => setRollNo(e.target.value)} placeholder="Optional" className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-0.5 flex items-center gap-1">
                <KeyRound className="w-3 h-3" /> New Password
              </label>
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank to keep" type="text" className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
              {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
            </button>
            <button onClick={() => { setEditing(false); setName(student.name); setRollNo(student.rollNo || ''); setNewPassword(''); }} className="text-xs text-gray-500 hover:text-gray-700 px-2">Cancel</button>
            <button onClick={resetPassword} disabled={resetting} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-60">
              <KeyRound className="h-3 w-3" /> {resetting ? 'Generating…' : 'Generate one-time password'}
            </button>
          </div>
        </div>
      )}

      {/* Subjects panel */}
      {expanded && (
        <div className="border-t border-[#E8E4DC] bg-purple-50 px-4 py-3">
          <p className="text-xs font-semibold text-purple-800 mb-2">Enrolled Subjects</p>
          {!subjectsLoaded ? (
            <div className="text-xs text-gray-400 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Loading…</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {availableSubjects.map((sub) => {
                  const active = subjects.includes(sub);
                  return (
                    <button
                      key={sub}
                      onClick={() => setSubjects((prev) => active ? prev.filter((s) => s !== sub) : [...prev, sub])}
                      className={clsx('px-2.5 py-1 rounded-full text-xs font-semibold border transition-all', active ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-purple-300')}
                    >
                      {sub}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={saveSubjects}
                disabled={savingSubjects || subjects.length === 0}
                className="inline-flex items-center gap-1.5 bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {savingSubjects ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Subjects
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyClassPage() {
  const [loading, setLoading] = useState(true);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('roster');
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null);

  // Add student form
  const [addName, setAddName] = useState('');
  const [addRollNo, setAddRollNo] = useState('');
  const [addParentPhone, setAddParentPhone] = useState('');
  const [addParentName, setAddParentName] = useState('');
  const [addSubjects, setAddSubjects] = useState<string[]>([]);
  const [addPassword, setAddPassword] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [bulkRows, setBulkRows] = useState<Array<Record<string, string>>>([]);
  const [bulkFileName, setBulkFileName] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkCreated, setBulkCreated] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/teacher/session/me', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) { return; }
        return fetch('/api/teacher/class-sections', { cache: 'no-store' });
      })
      .then(async (res) => {
        if (!res || !active) return;
        const body = await res.json().catch(() => null);
        const data = unwrap<{ managedSections?: ClassSection[]; sections?: ClassSection[] } | ClassSection[] | null>(body);
        const sections: ClassSection[] = Array.isArray(data)
          ? data
          : Array.isArray((data as { managedSections?: ClassSection[] } | null)?.managedSections)
            ? (data as { managedSections: ClassSection[] }).managedSections
            : Array.isArray((data as { sections?: ClassSection[] } | null)?.sections)
              ? (data as { sections: ClassSection[] }).sections
              : [];
        setClassSections(sections);
        if (sections.length > 0) setSelectedSectionId(sections[0].id);
      })
      .catch(() => { if (active) setClassSections([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const loadStudents = useCallback(async (sectionId: string) => {
    if (!sectionId) return;
    setStudentsLoading(true);
    try {
      const res = await fetch(`/api/teacher/my-class/students?classSectionId=${encodeURIComponent(sectionId)}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        const data = unwrap<{ students?: StudentProfile[] } | null>(body);
        setStudents(Array.isArray(data?.students) ? data.students : []);
      } else {
        setStudents([]);
        setBanner({ ok: false, message: body?.message || 'Could not load roster. You may not be the class teacher for this section.' });
      }
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSectionId) void loadStudents(selectedSectionId);
  }, [selectedSectionId, loadStudents]);

  async function addStudent() {
    const name = addName.trim();
    if (!name || !selectedSectionId) return;
    setAddLoading(true);
    setBanner(null);
    try {
      const row: Record<string, unknown> = { name };
      if (addRollNo.trim()) row.rollNo = addRollNo.trim();
      if (addParentPhone.trim()) row.parentPhone = addParentPhone.trim();
      if (addParentName.trim()) row.parentName = addParentName.trim();
      if (addSubjects.length > 0) row.subjects = addSubjects.join(',');
      if (addPassword.trim()) row.password = addPassword.trim();
      const res = await fetch('/api/teacher/class-sections/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classSectionId: selectedSectionId, rows: [row] }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setBanner({ ok: false, message: body?.message || 'Failed to add student.' });
      } else {
        const data = unwrap<{ created?: unknown[]; failed?: unknown[] } | null>(body);
        const failed = Array.isArray(data?.failed) ? data.failed : [];
        if (failed.length > 0) {
          const msg = (failed[0] as Record<string, unknown>)?.reason ?? 'Student could not be added.';
          setBanner({ ok: false, message: String(msg) });
        } else {
          const created = Array.isArray(data?.created) ? data.created[0] as Record<string, unknown> | undefined : undefined;
          const credentials = created?.issuedCredentials as Record<string, unknown> | undefined;
          setBanner({
            ok: true,
            message: `"${name}" added. Login: ${String(credentials?.loginIdentifier || 'generated student ID')} · One-time password: ${String(credentials?.password || 'generated')}`,
          });
          setAddName(''); setAddRollNo(''); setAddParentPhone(''); setAddParentName(''); setAddSubjects([]); setAddPassword('');
          void loadStudents(selectedSectionId);
          setTab('roster');
        }
      }
    } finally {
      setAddLoading(false);
    }
  }

  async function loadBulkFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBanner(null);
    setBulkCreated([]);
    const formData = new FormData();
    formData.set('file', file, file.name);
    const response = await fetch('/api/admin/import/roster/parse', { method: 'POST', body: formData });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setBanner({ ok: false, message: body?.message || 'Could not read this roster file.' });
      return;
    }
    const data = unwrap<{ preview?: { rows?: Array<Record<string, string>> }; sheets?: Record<string, Array<Record<string, string>>> } | null>(body);
    const rows = data?.sheets?.Students || data?.preview?.rows || [];
    setBulkRows(rows);
    setBulkFileName(file.name);
    setBanner({ ok: true, message: `${rows.length} student rows are ready for review and import.` });
  }

  async function importBulkStudents() {
    if (!selectedSectionId || bulkRows.length === 0) return;
    setBulkLoading(true);
    setBanner(null);
    try {
      const response = await fetch('/api/teacher/class-sections/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classSectionId: selectedSectionId, rows: bulkRows }),
      });
      const body = await response.json().catch(() => null);
      const data = unwrap<{ created?: Array<Record<string, unknown>>; failed?: Array<Record<string, unknown>>; createdCount?: number; failedCount?: number } | null>(body);
      if (!response.ok && response.status !== 207) {
        setBanner({ ok: false, message: body?.message || 'Student import failed.' });
        return;
      }
      setBulkCreated(data?.created || []);
      setBanner({
        ok: Number(data?.failedCount || 0) === 0,
        message: `${Number(data?.createdCount || 0)} students created; ${Number(data?.failedCount || 0)} rows need correction.`,
      });
      await loadStudents(selectedSectionId);
    } finally {
      setBulkLoading(false);
    }
  }

  const selectedSection = classSections.find((s) => s.id === selectedSectionId);
  const activeStudents = students.filter((s) => s.status === 'active');
  const inactiveStudents = students.filter((s) => s.status === 'inactive');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto pb-16">
      <BackButton href="/teacher" label="Dashboard" />

      <div className="mb-6">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <Users className="w-6 h-6 text-emerald-600" /> My Class
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your class roster, subjects, and student access.</p>
      </div>

      {classSections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-14 text-center text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No class sections assigned to you.</p>
          <p className="text-sm mt-1">Ask your admin to make you class teacher for a section.</p>
        </div>
      ) : (
        <>
          {/* Section selector */}
          <div className="mb-5 flex flex-wrap gap-2">
            {classSections.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelectedSectionId(s.id); setBanner(null); }}
                className={clsx('px-4 py-1.5 rounded-xl text-sm font-semibold border transition-all', selectedSectionId === s.id ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-400')}
              >
                Class {s.classLevel} – {s.section}{s.batch ? ` (${s.batch})` : ''}
              </button>
            ))}
          </div>

          {/* Banner */}
          {banner && <FeedbackBanner ok={banner.ok} message={banner.message} onClose={() => setBanner(null)} />}

          {selectedSection && (
            <div className="mb-4 flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
              <div>
                <p className="text-xs font-bold text-emerald-800">Class {selectedSection.classLevel} — Section {selectedSection.section}</p>
                <p className="text-[11px] text-emerald-700">{activeStudents.length} active · {inactiveStudents.length} inactive</p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
            <button onClick={() => setTab('roster')} className={clsx('px-4 py-1.5 rounded-lg text-sm font-semibold transition-all', tab === 'roster' ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              Roster
            </button>
            <button onClick={() => setTab('add')} className={clsx('px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5', tab === 'add' ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              <UserPlus className="w-3.5 h-3.5" /> Add Student
            </button>
            <button onClick={() => setTab('bulk')} className={clsx('px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5', tab === 'bulk' ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> Bulk import
            </button>
          </div>

          {/* Roster tab */}
          {tab === 'roster' && (
            <div>
              {studentsLoading ? (
                <div className="flex items-center justify-center h-32 text-gray-400">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading roster…
                </div>
              ) : students.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="font-medium text-sm">No students in this section yet.</p>
                  <button onClick={() => setTab('add')} className="mt-3 text-xs text-emerald-700 font-semibold hover:underline">Add the first student →</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeStudents.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active ({activeStudents.length})</p>
                      {activeStudents.map((st) => (
                        <StudentRow
                          key={st.id}
                          student={st}
                          classLevel={selectedSection?.classLevel ?? 12}
                          onRefresh={() => void loadStudents(selectedSectionId)}
                          setBanner={setBanner}
                        />
                      ))}
                    </>
                  )}
                  {inactiveStudents.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-5">Inactive ({inactiveStudents.length})</p>
                      {inactiveStudents.map((st) => (
                        <StudentRow
                          key={st.id}
                          student={st}
                          classLevel={selectedSection?.classLevel ?? 12}
                          onRefresh={() => void loadStudents(selectedSectionId)}
                          setBanner={setBanner}
                        />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Add Student tab */}
          {tab === 'add' && (
            <div className="bg-white rounded-2xl border border-[#E8E4DC] p-5 shadow-sm">
              <h2 className="font-fraunces text-base font-bold text-navy-700 mb-4 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                Add New Student
                {selectedSection && <span className="text-sm font-normal text-gray-400 ml-1">to Class {selectedSection.classLevel} – {selectedSection.section}</span>}
              </h2>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Student Name <span className="text-rose-500">*</span></label>
                  <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Full name" className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Roll No <span className="text-rose-500">*</span></label>
                  <input value={addRollNo} onChange={(e) => setAddRollNo(e.target.value)} placeholder="e.g. 1" inputMode="numeric" className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Parent phone <span className="text-rose-500">*</span></label>
                  <input value={addParentPhone} onChange={(e) => setAddParentPhone(e.target.value)} placeholder="10-digit login phone" inputMode="tel" className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Parent name <span className="text-gray-400">(optional)</span></label>
                  <input value={addParentName} onChange={(e) => setAddParentName(e.target.value)} placeholder="Parent or guardian" className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-purple-100 bg-purple-50 p-3">
                <p className="mb-2 text-xs font-semibold text-purple-900">Subjects enrolled for this student</p>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedSection?.classLevel === 12 ? ALL_CLASS12_SUBJECTS : ALL_CLASS10_SUBJECTS).map((subject) => {
                    const selected = addSubjects.includes(subject);
                    return (
                      <button key={subject} type="button" onClick={() => setAddSubjects((current) => selected ? current.filter((item) => item !== subject) : [...current, subject])} className={clsx('rounded-full border px-2.5 py-1 text-xs font-semibold', selected ? 'border-purple-600 bg-purple-600 text-white' : 'border-purple-200 bg-white text-purple-800')}>
                        {subject}
                      </button>
                    );
                  })}
                </div>
              </div>

              <details className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-gray-700">Set a custom one-time password (optional)</summary>
                <input value={addPassword} onChange={(e) => setAddPassword(e.target.value)} placeholder="Leave blank to generate securely" className="mt-2 w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2" />
              </details>

              <button
                onClick={addStudent}
                disabled={addLoading || !addName.trim() || !addRollNo.trim() || !addParentPhone.trim()}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
              >
                {addLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {addLoading ? 'Adding…' : 'Add Student'}
              </button>
              <p className="mt-3 text-xs text-gray-400">
                Students sign in with the parent phone and their individual one-time password. Siblings may share a phone because each student password remains separate.
              </p>
            </div>
          )}

          {tab === 'bulk' && (
            <div className="space-y-4 rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-fraunces text-lg font-bold text-navy-700">Import this class roster</h2>
                  <p className="mt-1 text-xs leading-5 text-gray-500">CSV, TSV and Excel files are supported. Every row stays inside Class {selectedSection?.classLevel} – {selectedSection?.section}.</p>
                </div>
                <button type="button" onClick={downloadStudentTemplate} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800">
                  <Download className="h-4 w-4" /> Download template
                </button>
              </div>
              <label className="block rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/60 p-5 text-center text-sm font-semibold text-indigo-800">
                Choose roster file
                <input type="file" accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={loadBulkFile} className="mx-auto mt-2 block max-w-full text-xs font-normal" />
              </label>
              {bulkFileName ? <p className="text-xs text-gray-500">{bulkFileName} · {bulkRows.length} rows detected</p> : null}
              {bulkRows.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full min-w-[620px] text-xs">
                    <thead className="bg-gray-50 text-left text-gray-500"><tr><th className="px-3 py-2">Roll</th><th className="px-3 py-2">Student</th><th className="px-3 py-2">Parent phone</th><th className="px-3 py-2">Subjects</th></tr></thead>
                    <tbody>{bulkRows.slice(0, 8).map((row, index) => <tr key={index} className="border-t border-gray-100"><td className="px-3 py-2">{row.rollNo || row.roll || '—'}</td><td className="px-3 py-2 font-medium">{row.name || '—'}</td><td className="px-3 py-2">{row.parentPhone || row.parent_phone || '—'}</td><td className="px-3 py-2">{row.subjects || '—'}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : null}
              <button type="button" onClick={importBulkStudents} disabled={bulkLoading || bulkRows.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
                <FileSpreadsheet className="h-4 w-4" /> {bulkLoading ? 'Importing…' : `Import ${bulkRows.length || ''} students`}
              </button>
              {bulkCreated.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-bold text-amber-900">One-time credentials — copy now and share privately</p>
                  <div className="mt-2 max-h-52 space-y-1 overflow-y-auto font-mono text-[11px] text-amber-950">
                    {bulkCreated.map((item, index) => {
                      const credentials = item.issuedCredentials as Record<string, unknown> | undefined;
                      return <p key={String(item.id || index)}>{String(item.name || `Row ${index + 1}`)} · {String(credentials?.loginIdentifier || '')} · {String(credentials?.password || '')}</p>;
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
