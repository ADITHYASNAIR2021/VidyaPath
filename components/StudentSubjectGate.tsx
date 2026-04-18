'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface StudentSubjectGateProps {
  subject: string;
  children: React.ReactNode;
}

interface StudentSessionPayload {
  studentId?: string;
  classLevel?: number;
  enrolledSubjects?: string[];
}

export default function StudentSubjectGate({ subject, children }: StudentSubjectGateProps) {
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/student/session/me', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = await response.json().catch(() => null);
        const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
          ? payload.data as Record<string, unknown>
          : payload as Record<string, unknown> | null;
        return data as StudentSessionPayload | null;
      })
      .then((session) => {
        if (!active) return;
        if (!session?.studentId) {
          setDenied(false);
          setLoading(false);
          return;
        }
        // Class 10 has public subject scope — never restrict
        if (session.classLevel === 10) {
          setDenied(false);
          setLoading(false);
          return;
        }
        const enrolledSubjects = Array.isArray(session.enrolledSubjects)
          ? session.enrolledSubjects.filter((item): item is string => typeof item === 'string')
          : [];
        // No enrolled subjects assigned yet — don't block access
        if (enrolledSubjects.length === 0) {
          setDenied(false);
          setLoading(false);
          return;
        }
        setDenied(!enrolledSubjects.includes(subject));
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setDenied(false);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [subject]);

  if (loading) {
    return (
      <div className="min-h-[40vh] rounded-2xl border border-[#E8E4DC] bg-white p-6 text-sm text-[#5F5A73]">
        Verifying subject access...
      </div>
    );
  }

  if (denied) {
    return (
      <div className="min-h-[40vh] rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="font-fraunces text-xl font-bold text-amber-900">Subject Access Restricted</h2>
        <p className="mt-2 text-sm text-amber-900">
          This chapter is not available in your enrolled subjects.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
