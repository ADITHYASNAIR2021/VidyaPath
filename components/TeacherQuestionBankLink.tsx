'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HelpCircle } from 'lucide-react';

interface Props {
  chapterId: string;
}

export default function TeacherQuestionBankLink({ chapterId }: Props) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    // Only fetch if this is a teacher/admin/developer session
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        const data = body?.data ?? body;
        const role = data?.role;
        if (role !== 'teacher' && role !== 'admin' && role !== 'developer') return;

        // Fetch question count for this chapter
        fetch(`/api/teacher/question-bank/item?chapterId=${encodeURIComponent(chapterId)}`, { cache: 'no-store' })
          .then(async (r) => {
            const b = await r.json().catch(() => null);
            const d = b?.data ?? b;
            const items = Array.isArray(d?.items) ? d.items : [];
            setCount(items.length);
          })
          .catch(() => undefined);
      })
      .catch(() => undefined);
  }, [chapterId]);

  if (count === null) return null;

  return (
    <Link
      href={`/teacher/question-bank?chapter=${encodeURIComponent(chapterId)}`}
      className="inline-flex items-center gap-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1 transition-colors border border-white/25"
      title="Your question bank for this chapter"
    >
      <HelpCircle className="w-3.5 h-3.5" />
      My Questions ({count})
    </Link>
  );
}
