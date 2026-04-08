import Link from 'next/link';
import {
  BookOpen,
  FileText,
  Compass,
  MessageCircle,
  ArrowRight,
  Star,
  Zap,
  CheckCircle,
  ExternalLink,
  GraduationCap,
  Atom,
  FlaskConical,
  Leaf,
  Calculator,
  Camera,
  Network,
} from 'lucide-react';
import clsx from 'clsx';
import { getChapterStats, PAPERS } from '@/lib/data';

export default function HomePage() {
  const stats = getChapterStats();
  
  return (
    <div className="min-h-screen">
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-saffron-50 via-[#FDFAF6] to-navy-50 pt-14 pb-20 px-4 overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-saffron-100 rounded-full blur-3xl opacity-40 -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-navy-50 rounded-full blur-3xl opacity-50 translate-y-1/3 -translate-x-1/4 pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white border border-saffron-200 text-saffron-600 text-sm font-medium px-4 py-1.5 rounded-full shadow-sm mb-6 animate-fade-in-up">
            <Star className="w-3.5 h-3.5 fill-saffron-400 text-saffron-400" />
            Free for all students · No login required
          </div>

          {/* Headline */}
          <h1 className="font-fraunces text-4xl sm:text-5xl md:text-6xl font-bold text-navy-700 leading-tight mb-4 animate-fade-in-up stagger-1">
            Your CBSE Science
            <br />
            <span className="text-saffron-500">Study Companion</span>
          </h1>

          <p className="text-lg text-[#4A4A6A] max-w-xl mx-auto mb-8 animate-fade-in-up stagger-2">
            NCERT chapters, AI tutor, previous year papers, and JEE/NEET career guide — all
            in one place, completely free. For Class 10 and Class 12.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12 animate-fade-in-up stagger-3">
            <Link
              href="/chapters"
              className="inline-flex items-center justify-center gap-2 bg-saffron-500 hover:bg-saffron-600 active:scale-95 text-white font-semibold px-7 py-3.5 rounded-xl shadow-md transition-all duration-150"
            >
              Start Studying
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/career"
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 active:scale-95 text-navy-700 font-semibold px-7 py-3.5 rounded-xl border border-[#E8E4DC] shadow-sm transition-all duration-150"
            >
              <Compass className="w-4 h-4 text-saffron-500" />
              Explore JEE / NEET
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto animate-fade-in-up stagger-4">
            {[
              { value: `${stats.total}+`, label: 'Chapters' },
              { value: `${Object.keys(stats.byClass).length}`, label: 'Classes' },
              { value: `${PAPERS.length}+`, label: 'Papers' },
              { value: '₹0', label: 'Forever Free' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white/80 backdrop-blur border border-[#E8E4DC] rounded-2xl px-4 py-3 shadow-sm"
              >
                <div className="font-fraunces text-2xl font-bold text-saffron-500">{stat.value}</div>
                <div className="text-xs text-[#8A8AAA] font-medium mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STUDY BY CLASS ──────────────────────────────────── */}
      <section className="py-12 px-4 bg-white/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="font-fraunces text-2xl font-bold text-navy-700">Choose Your Class</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl mx-auto">
            {[
              {
                class: 10,
                desc: 'Science (Physics, Chemistry, Biology) and Math. Covers the full CBSE Class 10 board syllabus.',
                color: 'bg-emerald-500',
                light: 'bg-emerald-50',
                border: 'border-emerald-200',
                chapters: '29 chapters',
                badge: 'Board Exams',
                badgeColor: 'bg-emerald-100 text-emerald-700',
              },
              {
                class: 12,
                desc: 'Physics, Chemistry, Biology and Math. Complete prep for boards + JEE/NEET entrance.',
                color: 'bg-purple-500',
                light: 'bg-purple-50',
                border: 'border-purple-200',
                chapters: '59 chapters',
                badge: 'Boards + JEE/NEET',
                badgeColor: 'bg-purple-100 text-purple-700',
              },
            ].map((item) => (
              <Link
                key={item.class}
                href={`/chapters?class=${item.class}`}
                className={clsx(
                  'group p-6 rounded-2xl border transition-all active:scale-95 duration-200',
                  item.light,
                  item.border,
                  'hover:shadow-md'
                )}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className={clsx('w-12 h-12 rounded-xl text-white flex items-center justify-center font-bold font-fraunces text-2xl shadow-sm mb-2', item.color)}>
                      {item.class}
                    </div>
                    <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full', item.badgeColor)}>
                      {item.badge}
                    </span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#8A8AAA] group-hover:translate-x-1 transition-transform mt-1" />
                </div>
                <h3 className="font-bold text-navy-700 text-xl mt-3 mb-1">Class {item.class}</h3>
                <p className="text-sm text-[#4A4A6A] leading-relaxed mb-3">{item.desc}</p>
                <div className="text-xs font-semibold text-[#8A8AAA]">{item.chapters}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── SUBJECTS GRID ───────────────────────────────────── */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-fraunces text-3xl font-bold text-navy-700 mb-2">
              Pick Your Subject
            </h2>
            <p className="text-[#4A4A6A]">All NCERT chapters, organized and ready.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                icon: Atom,
                label: 'Physics',
                description: 'Mechanics, Optics, Electricity & more',
                color: 'bg-sky-50 text-sky-700 border-sky-100',
                iconBg: 'bg-sky-100',
                href: '/chapters?subject=Physics',
              },
              {
                icon: FlaskConical,
                label: 'Chemistry',
                description: 'Organic, Inorganic & Physical',
                color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                iconBg: 'bg-emerald-100',
                href: '/chapters?subject=Chemistry',
              },
              {
                icon: Leaf,
                label: 'Biology',
                description: 'Cell, Plants, Humans & Ecology',
                color: 'bg-green-50 text-green-700 border-green-100',
                iconBg: 'bg-green-100',
                href: '/chapters?subject=Biology',
              },
              {
                icon: Calculator,
                label: 'Math',
                description: 'Calculus, Algebra & Statistics',
                color: 'bg-purple-50 text-purple-700 border-purple-100',
                iconBg: 'bg-purple-100',
                href: '/chapters?subject=Math',
              },
            ].map(({ icon: Icon, label, description, color, iconBg, href }, i) => (
              <Link
                key={label}
                href={href}
                className={`group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border ${color} hover:shadow-md transition-all duration-200 active:scale-95 animate-fade-in-up`}
                style={{ animationDelay: `${i * 0.07}s` }}
              >
                <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-semibold text-base">{label}</div>
                  <div className="text-xs opacity-75 mt-0.5 leading-snug">{description}</div>
                </div>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            <Link
              href="/formulas"
              className="group flex items-center justify-between bg-white border border-[#E8E4DC] rounded-2xl p-4 hover:shadow-md transition-shadow"
            >
              <div>
                <p className="text-xs font-semibold text-purple-600">New</p>
                <p className="font-semibold text-navy-700">Formula Database</p>
                <p className="text-xs text-[#6E6984] mt-0.5">KaTeX formulas + SI units + JEE flag</p>
              </div>
              <Calculator className="w-5 h-5 text-purple-500" />
            </Link>
            <Link
              href="/concept-web"
              className="group flex items-center justify-between bg-white border border-[#E8E4DC] rounded-2xl p-4 hover:shadow-md transition-shadow"
            >
              <div>
                <p className="text-xs font-semibold text-emerald-600">New</p>
                <p className="font-semibold text-navy-700">Concept Web</p>
                <p className="text-xs text-[#6E6984] mt-0.5">Visual graph of chapter/topic connections</p>
              </div>
              <Network className="w-5 h-5 text-emerald-500" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-navy-50/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-fraunces text-3xl font-bold text-navy-700 mb-2">
              Everything You Need to Score High
            </h2>
            <p className="text-[#4A4A6A]">Built for CBSE students. Powered by free tools.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {[
              {
                icon: BookOpen,
                title: 'Chapter Library',
                description:
                  'All Class 10 and 12 Science & Math chapters with NCERT PDF links, key topics, and YouTube lecture links. No coaching required.',
                href: '/chapters',
                cta: 'Browse Chapters',
                color: 'text-sky-600 bg-sky-50',
              },
              {
                icon: FileText,
                title: 'Previous Year Papers',
                description:
                  'Official CBSE sample papers from 2019 to 2024. Sorted by class and subject. Direct links to CBSE website — always authentic.',
                href: '/papers',
                cta: 'View Papers',
                color: 'text-emerald-600 bg-emerald-50',
              },
              {
                icon: MessageCircle,
                title: 'VidyaAI Tutor',
                description:
                  'Ask any CBSE question and get a clear explanation instantly. Powered by Groq\'s LLaMA — fast, free, and available 24/7.',
                href: '/chapters',
                cta: 'Try AI Tutor',
                color: 'text-saffron-600 bg-saffron-50',
              },
              {
                icon: Camera,
                title: 'Image Question Solver',
                description:
                  'Upload a textbook question photo and get a step-by-step board-style solution with formulas.',
                href: '/chapters',
                cta: 'Try Image Solver',
                color: 'text-indigo-600 bg-indigo-50',
              },
              {
                icon: Compass,
                title: 'Career Guide',
                description:
                  'JEE, NEET, CUET, BITSAT — understand every entrance exam, top colleges, and a year-by-year study roadmap.',
                href: '/career',
                cta: 'Plan Your Career',
                color: 'text-purple-600 bg-purple-50',
              },
            ].map(({ icon: Icon, title, description, href, cta, color }, i) => (
              <div
                key={title}
                className="bg-white rounded-2xl border border-[#E8E4DC] p-6 shadow-sm hover:shadow-md transition-all duration-200 animate-fade-in-up"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mb-4`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-fraunces text-lg font-bold text-navy-700 mb-2">{title}</h3>
                <p className="text-sm text-[#4A4A6A] leading-relaxed mb-4">{description}</p>
                <Link
                  href={href}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-saffron-500 hover:text-saffron-600 transition-colors"
                >
                  {cta}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW TO USE ──────────────────────────────────────── */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-fraunces text-3xl font-bold text-navy-700 mb-2">
              How to Use VidyaPath
            </h2>
            <p className="text-[#4A4A6A]">Four simple steps to study smarter.</p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                step: '1',
                icon: BookOpen,
                title: 'Study the Chapter',
                desc: 'Open any chapter. Read NCERT PDF or watch the YouTube lecture.',
                color: 'bg-sky-500',
              },
              {
                step: '2',
                icon: FileText,
                title: 'Take the Quiz',
                desc: "Test yourself with the chapter quiz to check what you've understood.",
                color: 'bg-emerald-500',
              },
              {
                step: '3',
                icon: MessageCircle,
                title: 'Clear Doubts with AI',
                desc: 'Ask VidyaAI any question. Get step-by-step explanations instantly.',
                color: 'bg-saffron-500',
              },
              {
                step: '4',
                icon: GraduationCap,
                title: 'Plan Your Career',
                desc: 'Once chapters are done, check the JEE/NEET guide to plan ahead.',
                color: 'bg-purple-500',
              },
            ].map(({ step, icon: Icon, title, desc, color }, i) => (
              <div
                key={step}
                className="relative bg-white rounded-2xl border border-[#E8E4DC] p-5 shadow-sm animate-fade-in-up"
                style={{ animationDelay: `${i * 0.07}s` }}
              >
                <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center mb-4 shadow-sm`}>
                  <Icon className="w-4.5 h-4.5 text-white w-5 h-5" />
                </div>
                <div className="absolute top-4 right-4 text-4xl font-fraunces font-bold text-gray-100 select-none">
                  {step}
                </div>
                <h3 className="font-semibold text-navy-700 mb-1.5">{title}</h3>
                <p className="text-sm text-[#4A4A6A] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI CALLOUT ──────────────────────────────────────── */}
      <section className="py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-gradient-to-r from-saffron-50 to-amber-50 border border-saffron-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4">
            <div className="w-12 h-12 bg-saffron-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="text-center sm:text-left">
              <h3 className="font-fraunces text-lg font-bold text-navy-700 mb-1">
                VidyaAI — Your Free 24/7 Tutor
              </h3>
              <p className="text-sm text-[#4A4A6A]">
                Stuck on a concept at midnight? Ask VidyaAI. It explains CBSE topics in simple
                language, gives step-by-step solutions, and can generate MCQs for practice.
                Powered by Groq&apos;s LLaMA model — completely free.
              </p>
            </div>
            <Link
              href="/chapters"
              className="flex-shrink-0 bg-saffron-500 hover:bg-saffron-600 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors active:scale-95 whitespace-nowrap"
            >
              Try Now
            </Link>
          </div>
        </div>
      </section>

      {/* ── FREE PROMISE ────────────────────────────────────── */}
      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white border border-[#E8E4DC] rounded-2xl p-6 shadow-sm">
            <h3 className="font-fraunces text-xl font-bold text-navy-700 mb-4 text-center">
              Why VidyaPath is Free — and Will Stay Free
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                'No account or login needed',
                'No ads, ever',
                'No paid tiers or locked content',
                'All NCERT content is government-owned and free',
                'AI powered by Groq\'s generous free tier',
                'Hosted free on Vercel',
              ].map((point) => (
                <div key={point} className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-[#4A4A6A]">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── DARK CTA BANNER ─────────────────────────────────── */}
      <section className="py-20 px-4 bg-navy-700">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-fraunces text-3xl sm:text-4xl font-bold text-white mb-4">
            Start Studying Right Now
          </h2>
          <p className="text-navy-200 mb-8 text-lg">
            No sign-up. No payment. No waiting. Just open a chapter and start.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/chapters"
              className="inline-flex items-center justify-center gap-2 bg-saffron-500 hover:bg-saffron-400 active:scale-95 text-white font-semibold px-8 py-3.5 rounded-xl shadow-lg transition-all duration-150"
            >
              Browse All Chapters
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/papers"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 active:scale-95 text-white font-semibold px-8 py-3.5 rounded-xl border border-white/20 transition-all duration-150"
            >
              <FileText className="w-4 h-4" />
              Previous Papers
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <footer className="bg-white border-t border-[#E8E4DC] py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Brand */}
            <div className="text-center md:text-left">
              <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                <div className="w-7 h-7 bg-saffron-500 rounded-lg flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-white" />
                </div>
                <span className="font-fraunces text-lg font-bold text-navy-700">
                  Vidya<span className="text-saffron-500">Path</span>
                </span>
              </div>
              <p className="text-xs text-[#8A8AAA]">
                Built with love for every student who deserves quality education.
              </p>
            </div>

            {/* Links */}
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-[#4A4A6A]">
              <Link href="/chapters" className="hover:text-saffron-500 transition-colors">Chapters</Link>
              <Link href="/papers" className="hover:text-saffron-500 transition-colors">Papers</Link>
              <Link href="/career" className="hover:text-saffron-500 transition-colors">Career Guide</Link>
            </div>

            {/* Credits */}
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { label: 'NCERT', url: 'https://ncert.nic.in' },
                { label: 'CBSE', url: 'https://cbseacademic.nic.in' },
                { label: 'Groq AI', url: 'https://groq.com' },
                { label: 'Vercel', url: 'https://vercel.com' },
              ].map(({ label, url }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs bg-gray-50 hover:bg-gray-100 text-[#4A4A6A] border border-gray-200 px-2.5 py-1 rounded-full transition-colors"
                >
                  {label}
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </a>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-[#E8E4DC] text-center">
            <p className="text-xs text-[#8A8AAA]">
              Content sourced from NCERT (ncert.nic.in) and CBSE (cbseacademic.nic.in) — both
              government resources, free for all students. &nbsp;·&nbsp; Made in India &nbsp;🇮🇳
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
