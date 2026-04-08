'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, FileText, Compass, GraduationCap, Menu, X, Bookmark, Target, Calculator } from 'lucide-react';
import clsx from 'clsx';
import CommandPalette from '@/components/CommandPalette';

const NAV_LINKS = [
  { href: '/chapters', label: 'All Chapters', icon: BookOpen },
  { href: '/papers', label: 'Papers', icon: FileText },
  { href: '/formulas', label: 'Formulas', icon: Calculator },
  { href: '/dashboard', label: 'Dashboard', icon: Target },
  { href: '/career', label: 'Career', icon: Compass },
  { href: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E8E4DC]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group" onClick={() => setMobileOpen(false)}>
            <div className="w-8 h-8 bg-saffron-500 rounded-lg flex items-center justify-center shadow-sm group-hover:bg-saffron-600 transition-colors">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="font-fraunces text-xl font-bold text-navy-700">
              Vidya<span className="text-saffron-500">Path</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150',
                  pathname.startsWith(href)
                    ? 'bg-saffron-50 text-saffron-600 font-semibold'
                    : 'text-[#4A4A6A] hover:bg-gray-100 hover:text-[#1C1C2E]'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>

          {/* Desktop Search & Badge */}
          <div className="hidden md:flex items-center gap-3">
            <CommandPalette />
            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full font-medium">
              Free forever
            </span>
          </div>

          <div className="md:hidden flex items-center gap-2">
            <CommandPalette />
            {/* Mobile Toggle */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="p-2 rounded-xl text-[#4A4A6A] hover:bg-gray-100 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#E8E4DC] bg-white animate-fade-in">
          <div className="px-4 py-3 space-y-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                  pathname.startsWith(href)
                    ? 'bg-saffron-50 text-saffron-600 font-semibold'
                    : 'text-[#4A4A6A] hover:bg-gray-50'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
            <div className="pt-2 pb-1">
              <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full font-medium">
                100% Free · No Login Required
              </span>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
