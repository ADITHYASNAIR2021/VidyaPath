import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

export default function SiteFooter() {
  return (
    <footer className="border-t border-[#E8E4DC] bg-[var(--color-surface)] px-4 py-7 mt-8">
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
          Free for every student. No login — your progress stays on your device.
        </div>

        <div className="flex items-center gap-3 text-xs">
          <Link href="/privacy" className="text-[#8A8AAA] hover:text-navy-700 transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="text-[#8A8AAA] hover:text-navy-700 transition-colors">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
