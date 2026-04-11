'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GraduationCap } from 'lucide-react';

export default function SiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith('/exam/assignment/')) return null;

  return (
    <footer className="border-t border-[#E8E4DC] bg-white px-4 py-7 mt-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-saffron-500 text-white flex items-center justify-center">
            <GraduationCap className="w-4 h-4" />
          </div>
          <p className="font-fraunces text-lg font-bold text-navy-700">
            Vidya<span className="text-saffron-500">Path</span>
          </p>
        </div>

        <div className="text-xs text-[#8A8AAA] text-center">
          Made with love by Adithya S Nair.
        </div>

        <div className="flex items-center gap-3 text-xs">
          <Link href="/student/login" className="text-emerald-700 hover:text-emerald-800 font-semibold">
            Student
          </Link>
          <Link href="/teacher/login" className="text-indigo-700 hover:text-indigo-800 font-semibold">
            Teacher
          </Link>
          <Link href="/admin/login" className="text-amber-700 hover:text-amber-800 font-semibold">
            Admin
          </Link>
          <Link href="/developer/login" className="text-violet-700 hover:text-violet-800 font-semibold">
            Developer
          </Link>
        </div>
      </div>
    </footer>
  );
}
