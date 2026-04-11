'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, GraduationCap, RefreshCw, Search } from 'lucide-react';
import type { StudentProfile } from '@/lib/teacher-types';

interface StudentGradeRecord {
  submissionId: string;
  packId: string;
  chapterId: string;
  subject: string;
  classLevel: 10 | 12;
  section?: string;
  score: number;
  status: 'pending_review' | 'graded' | 'released';
  releasedAt?: string;
  createdAt: string;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function AdminGradebookPage() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [grades, setGrades] = useState<StudentGradeRecord[]>([]);

  useEffect(() => {
    async function init() {
      const sessionRes = await fetch('/api/admin/session/me', { cache: 'no-store' });
      if (!sessionRes.ok) {
        router.replace('/admin/login');
        return;
      }
      setLoadingStudents(true);
      try {
        const res = await fetch('/api/admin/students', { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setError('Failed to load students.');
          return;
        }
        const data = unwrap<{ students?: StudentProfile[] } | null>(body);
        setStudents(data?.students ?? []);
      } catch {
        setError('Failed to load students.');
      } finally {
        setLoadingStudents(false);
      }
    }
    void init();
  }, [router]);

  async function loadStudentGrades(studentId: string) {
    setLoadingGrades(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/students/${studentId}/grades`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message || 'Failed to load grade history.');
        setGrades([]);
        return;
      }
      const data = unwrap<{ grades?: StudentGradeRecord[] }>(body);
      setGrades(Array.isArray(data.grades) ? data.grades : []);
    } catch {
      setError('Failed to load grade history.');
      setGrades([]);
    } finally {
      setLoadingGrades(false);
    }
  }

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const query = search.toLowerCase();
    return students.filter((student) =>
      student.name.toLowerCase().includes(query) ||
      student.rollCode.toLowerCase().includes(query) ||
      (student.batch || '').toLowerCase().includes(query)
    );
  }, [search, students]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedId) || null,
    [selectedId, students]
  );

  const summary = useMemo(() => {
    if (grades.length === 0) {
      return { average: 0, best: 0, released: 0 };
    }
    const total = grades.reduce((sum, row) => sum + row.score, 0);
    return {
      average: Math.round((total / grades.length) * 100) / 100,
      best: Math.max(...grades.map((row) => row.score)),
      released: grades.filter((row) => row.status === 'released').length,
    };
  }, [grades]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-indigo-600" />
          Gradebook
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">Select a student to inspect complete grade history and release status.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="mb-5 rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-indigo-600" />
          Student Selector
        </h2>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search students by name, roll code, or batch"
            className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 py-2 text-sm"
          />
        </div>
        <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-gray-200">
          {loadingStudents ? (
            <div className="flex items-center justify-center py-6 text-sm text-gray-400">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading students...
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">No students found.</div>
          ) : (
            filteredStudents.map((student) => (
              <button
                key={student.id}
                onClick={() => {
                  setSelectedId(student.id);
                  void loadStudentGrades(student.id);
                }}
                className={`flex w-full items-center justify-between border-b border-gray-100 px-3 py-2 text-left last:border-0 hover:bg-indigo-50 ${
                  selectedId === student.id ? 'bg-indigo-50' : ''
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{student.name}</p>
                  <p className="text-xs text-gray-500">
                    {student.rollCode} | Class {student.classLevel}{student.section ? `-${student.section}` : ''}
                  </p>
                </div>
                <span className="text-[11px] text-gray-400">{student.batch || '-'}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {selectedStudent && (
        <>
          <div className="mb-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
              <p className="text-xs text-gray-500">Average</p>
              <p className="text-2xl font-bold text-gray-800">{summary.average}%</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs text-gray-500">Best Score</p>
              <p className="text-2xl font-bold text-gray-800">{summary.best}%</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
              <p className="text-xs text-gray-500">Released Results</p>
              <p className="text-2xl font-bold text-gray-800">{summary.released}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm overflow-hidden">
            <div className="border-b border-[#E8E4DC] bg-gray-50 px-4 py-3">
              <p className="text-sm font-semibold text-gray-700">{selectedStudent.name} - Grade History</p>
            </div>
            {loadingGrades ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Loading grades...
              </div>
            ) : grades.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No grade records found for this student.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[860px] w-full">
                  <thead>
                    <tr className="border-b border-[#E8E4DC]">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Subject</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Chapter</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Score</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Status</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Submitted</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Released</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grades.map((row) => (
                      <tr key={row.submissionId} className="border-b border-[#E8E4DC] last:border-0">
                        <td className="px-4 py-3 text-sm">{row.subject}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.chapterId}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold">{row.score}%</td>
                        <td className="px-4 py-3 text-xs capitalize text-gray-600">{row.status.replace('_', ' ')}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.createdAt).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{row.releasedAt ? new Date(row.releasedAt).toLocaleString('en-IN') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
