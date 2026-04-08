import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Calculator,
  Compass,
  ExternalLink,
  FileText,
  GraduationCap,
  MessageCircle,
  Network,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { getChapterStats, PAPERS } from '@/lib/data';

const BOARD_PATTERN = [
  { section: 'Section A', type: 'MCQ + Assertion (1 mark)', marks: '20 marks' },
  { section: 'Section B', type: 'Very short answer (2 marks)', marks: '10 marks' },
  { section: 'Section C', type: 'Short answer (3 marks)', marks: '18 marks' },
  { section: 'Section D', type: 'Case study (4 marks)', marks: '12 marks' },
  { section: 'Section E', type: 'Long answer (5 marks)', marks: '20 marks' },
];

export default function HomePage() {
  const stats = getChapterStats();

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      <section className="px-4 pt-14 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-3xl border border-[#E8E4DC] bg-gradient-to-br from-white via-[#FFF8ED] to-[#F3F8FF] p-8 sm:p-10 shadow-sm">
            <div className="inline-flex items-center gap-2 rounded-full border border-saffron-200 bg-white px-3 py-1.5 text-xs font-semibold text-saffron-600">
              <Sparkles className="w-3.5 h-3.5" />
              Free for all students - no login required
            </div>

            <h1 className="mt-5 font-fraunces text-4xl sm:text-5xl font-bold text-navy-700 leading-tight">
              Study for CBSE boards with one focused platform
            </h1>
            <p className="mt-4 max-w-2xl text-[#4A4A6A]">
              VidyaPath brings chapters, PYQs, AI explanations, flashcards, and exam practice together for
              Class 10 and Class 12.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <Link
                href="/chapters"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-saffron-500 px-6 py-3 text-sm font-semibold text-white hover:bg-saffron-600 transition-colors"
              >
                Start with chapters
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/papers"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DC] bg-white px-6 py-3 text-sm font-semibold text-navy-700 hover:bg-[#F7F5F0] transition-colors"
              >
                Practice board papers
                <FileText className="w-4 h-4" />
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric value={`${stats.total}+`} label="Chapters" />
              <Metric value={`${Object.keys(stats.byClass).length}`} label="Classes covered" />
              <Metric value={`${PAPERS.length}+`} label="Papers listed" />
              <Metric value="INR 0" label="Cost forever" />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-14">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-4">
          <QuickLink
            href="/chapters?class=10"
            title="Class 10"
            subtitle="Science + Math board flow"
            details="Physics, Chemistry, Biology, and Math chapters with PYQ-driven study."
          />
          <QuickLink
            href="/chapters?class=12"
            title="Class 12"
            subtitle="Boards + JEE/NEET aligned"
            details="Deep chapter prep with AI drills, formulas, and high-yield revision tools."
          />
        </div>
      </section>

      <section className="px-4 pb-14">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-fraunces text-3xl font-bold text-navy-700">Core study tools</h2>
          <p className="text-[#4A4A6A] mt-2">Use these every day to improve speed, recall, and marks.</p>
          <div className="mt-6 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              href="/chapters"
              icon={<BookOpen className="w-5 h-5 text-sky-600" />}
              title="Chapter workspace"
              description="Notes, quiz, flashcards, chapter intelligence, and AI chat in one flow."
            />
            <FeatureCard
              href="/papers"
              icon={<FileText className="w-5 h-5 text-emerald-600" />}
              title="Board papers archive"
              description="Browse paper links and practice exam-style questions by class and subject."
            />
            <FeatureCard
              href="/dashboard"
              icon={<MessageCircle className="w-5 h-5 text-saffron-600" />}
              title="Adaptive revision"
              description="Get chapter diagnosis, 7-day remediation, and progress-oriented next steps."
            />
            <FeatureCard
              href="/formulas"
              icon={<Calculator className="w-5 h-5 text-indigo-600" />}
              title="Formula database"
              description="Search formulas with units, chapter mapping, and exam relevance."
            />
            <FeatureCard
              href="/concept-web"
              icon={<Network className="w-5 h-5 text-emerald-600" />}
              title="Concept web"
              description="Visual graph of topic links across chapters for faster connection-building."
            />
            <FeatureCard
              href="/career"
              icon={<Compass className="w-5 h-5 text-purple-600" />}
              title="Career roadmap"
              description="JEE/NEET pathway guide with timeline, strategy, and exam overview."
            />
          </div>
        </div>
      </section>

      <section className="px-4 pb-14">
        <div className="max-w-6xl mx-auto rounded-3xl border border-saffron-200 bg-saffron-50 p-6 sm:p-8">
          <h2 className="font-fraunces text-2xl sm:text-3xl font-bold text-navy-700">CBSE board exam pattern</h2>
          <p className="text-sm text-[#4A4A6A] mt-2">
            Added on home page only as quick reference. Chapter pages now stay focused on chapter study.
          </p>
          <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {BOARD_PATTERN.map((item) => (
              <div key={item.section} className="rounded-2xl border border-saffron-100 bg-white p-4">
                <p className="text-xs font-semibold text-navy-700">{item.section}</p>
                <p className="text-xs text-[#6E6984] mt-1">{item.type}</p>
                <p className="text-sm font-bold text-saffron-600 mt-2">{item.marks}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[#8A8AAA]">Total: 80 marks theory + 20 marks practical/internal.</p>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="max-w-6xl mx-auto rounded-3xl bg-navy-700 p-8 text-center text-white">
          <h2 className="font-fraunces text-3xl font-bold">Start your next focused study session now</h2>
          <p className="text-navy-200 mt-3">No setup, no signup, no payment wall.</p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <Link
              href="/chapters"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-saffron-500 px-6 py-3 text-sm font-semibold hover:bg-saffron-400 transition-colors"
            >
              Browse chapters
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/papers"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold hover:bg-white/10 transition-colors"
            >
              Open papers
              <FileText className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E8E4DC] bg-white px-4 py-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <div className="w-7 h-7 rounded-lg bg-saffron-500 text-white flex items-center justify-center">
                <GraduationCap className="w-4 h-4" />
              </div>
              <p className="font-fraunces text-lg font-bold text-navy-700">
                Vidya<span className="text-saffron-500">Path</span>
              </p>
            </div>
            <p className="text-xs text-[#8A8AAA] mt-1 text-center md:text-left">
              Made with love by Adithya S Nair.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <SourcePill href="https://ncert.nic.in" label="NCERT" />
            <SourcePill href="https://cbseacademic.nic.in" label="CBSE" />
            <SourcePill href="https://groq.com" label="Groq" />
            <SourcePill href="https://vercel.com" label="Vercel" />
          </div>
        </div>
      </footer>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-[#E8E4DC] bg-white p-3">
      <p className="font-fraunces text-2xl font-bold text-saffron-500">{value}</p>
      <p className="text-xs font-medium text-[#8A8AAA]">{label}</p>
    </div>
  );
}

function QuickLink({
  href,
  title,
  subtitle,
  details,
}: {
  href: string;
  title: string;
  subtitle: string;
  details: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-[#E8E4DC] bg-white p-6 hover:shadow-md transition-shadow"
    >
      <p className="text-xs font-semibold text-saffron-600">{subtitle}</p>
      <h3 className="font-fraunces text-2xl font-bold text-navy-700 mt-1">{title}</h3>
      <p className="mt-2 text-sm text-[#4A4A6A] leading-relaxed">{details}</p>
      <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-saffron-600">
        Open
        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </p>
    </Link>
  );
}

function FeatureCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-[#E8E4DC] bg-white p-5 hover:shadow-md transition-shadow"
    >
      <div className="w-10 h-10 rounded-xl bg-[#F7F5F0] flex items-center justify-center">{icon}</div>
      <h3 className="font-semibold text-navy-700 mt-3">{title}</h3>
      <p className="text-sm text-[#4A4A6A] mt-1.5 leading-relaxed">{description}</p>
    </Link>
  );
}

function SourcePill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-[#4A4A6A] hover:bg-gray-100 transition-colors"
    >
      {label}
      <ExternalLink className="w-3 h-3 opacity-60" />
    </a>
  );
}
