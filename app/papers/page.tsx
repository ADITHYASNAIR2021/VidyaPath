'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Clock, Star, ChevronRight, Shield, BookOpen, Award,
  Calendar, TrendingUp, CheckCircle2, ExternalLink, BarChart2, Layers,
} from 'lucide-react';
import clsx from 'clsx';
import {
  ALL_PAPERS, PAPER_YEARS, filterPapers, getPaperStats,
  type PaperEntry, type PaperType,
} from '@/lib/papers';

// ── Design tokens ────────────────────────────────────────────
const SUBJECT_COLORS: Record<string, { bg: string; text: string; light: string; ring: string }> = {
  Physics:       { bg: 'bg-sky-500',     text: 'text-sky-700',     light: 'bg-sky-50 border-sky-100',      ring: 'ring-sky-200' },
  Chemistry:     { bg: 'bg-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50 border-emerald-100', ring: 'ring-emerald-200' },
  Biology:       { bg: 'bg-green-500',   text: 'text-green-700',   light: 'bg-green-50 border-green-100',   ring: 'ring-green-200' },
  Math:          { bg: 'bg-purple-500',  text: 'text-purple-700',  light: 'bg-purple-50 border-purple-100', ring: 'ring-purple-200' },
  'English Core':{ bg: 'bg-cyan-500',    text: 'text-cyan-700',    light: 'bg-cyan-50 border-cyan-100',     ring: 'ring-cyan-200' },
  Accountancy:   { bg: 'bg-amber-500',   text: 'text-amber-700',   light: 'bg-amber-50 border-amber-100',   ring: 'ring-amber-200' },
  'Business Studies': { bg: 'bg-indigo-500', text: 'text-indigo-700', light: 'bg-indigo-50 border-indigo-100', ring: 'ring-indigo-200' },
  Economics:     { bg: 'bg-rose-500',    text: 'text-rose-700',    light: 'bg-rose-50 border-rose-100',     ring: 'ring-rose-200' },
  Science:       { bg: 'bg-saffron-500', text: 'text-saffron-700', light: 'bg-saffron-50 border-saffron-100', ring: 'ring-saffron-200' },
  'All Subjects':{ bg: 'bg-indigo-500',  text: 'text-indigo-700',  light: 'bg-indigo-50 border-indigo-100', ring: 'ring-indigo-200' },
  'Marking Scheme': { bg: 'bg-gray-500', text: 'text-gray-700',   light: 'bg-gray-50 border-gray-200',     ring: 'ring-gray-200' },
};
const DEFAULT_COLOR = SUBJECT_COLORS['Marking Scheme'];

const TYPE_CONFIG: Record<PaperType, { label: string; icon: React.ElementType; color: string; dot: string }> = {
  board:       { label: 'Board Exam',  icon: Award,     color: 'bg-indigo-600 text-white', dot: 'bg-indigo-500' },
  sample:      { label: 'Sample',      icon: BookOpen,  color: 'bg-saffron-500 text-white', dot: 'bg-saffron-400' },
  compartment: { label: 'Compartment', icon: Shield,    color: 'bg-rose-500 text-white',    dot: 'bg-rose-400' },
};

const SET_LABELS: Record<string, string> = {
  Delhi: 'DL',
  'Outside Delhi': 'OD',
  Foreign: 'FR',
  Standard: 'Std',
  Basic: 'Basic',
  'All India': 'AI',
};

// ── Stats bar ─────────────────────────────────────────────────
function StatBadge({ icon: Icon, value, label, color }: { icon: React.ElementType; value: number | string; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <div className="text-lg font-bold text-white leading-none">{value}</div>
        <div className="text-xs text-indigo-200 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ── Paper card ────────────────────────────────────────────────
function PaperCard({ paper }: { paper: PaperEntry }) {
  const color = SUBJECT_COLORS[paper.subject] ?? DEFAULT_COLOR;
  const typeConf = TYPE_CONFIG[paper.paperType];
  const TypeIcon = typeConf.icon;

  return (
    <a
      href={paper.url}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        'group flex flex-col h-full bg-white rounded-2xl border p-4 transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]',
        color.light
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full text-white', typeConf.color)}>
            {paper.year}
          </span>
          <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', color.light, color.text, 'border')}>
            {paper.subject}
          </span>
          {paper.isFromHF && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">
              HF PDF
            </span>
          )}
          {paper.set && SET_LABELS[paper.set] && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500">
              {SET_LABELS[paper.set]}
            </span>
          )}
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-400 transition-colors flex-shrink-0 mt-0.5" />
      </div>

      {/* Title */}
      <h3 className="font-semibold text-navy-700 text-sm leading-snug mb-3 group-hover:text-indigo-700 transition-colors flex-1">
        {paper.title}
      </h3>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2.5 border-t border-black/5">
        <div className="flex items-center gap-3 text-xs text-[#8A8AAA]">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{paper.duration}</span>
          {paper.totalMarks > 0 && (
            <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-400" />{paper.totalMarks}M</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <TypeIcon className="w-3.5 h-3.5 text-gray-400" />
          {paper.hasMarkingScheme && (
            <span title="Marking scheme available">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

// ── Year timeline row ─────────────────────────────────────────
function YearSection({ year, papers }: { year: number; papers: PaperEntry[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const bySubject: Record<string, PaperEntry[]> = {};
  for (const p of papers) {
    if (!bySubject[p.subject]) bySubject[p.subject] = [];
    bySubject[p.subject].push(p);
  }
  const typeCount = {
    board: papers.filter((p) => p.paperType === 'board').length,
    sample: papers.filter((p) => p.paperType === 'sample').length,
    compartment: papers.filter((p) => p.paperType === 'compartment').length,
  };

  return (
    <div className="mb-8">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-3 mb-4 group"
      >
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Calendar className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 text-left">
          <span className="font-fraunces font-bold text-navy-700 text-xl group-hover:text-indigo-700 transition-colors">{year}</span>
          <span className="ml-3 text-xs text-[#8A8AAA]">{papers.length} paper{papers.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2 mt-1">
            {typeCount.board > 0 && <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded-full">{typeCount.board} board</span>}
            {typeCount.sample > 0 && <span className="text-[10px] bg-saffron-50 text-saffron-600 border border-saffron-100 px-1.5 py-0.5 rounded-full">{typeCount.sample} sample</span>}
            {typeCount.compartment > 0 && <span className="text-[10px] bg-rose-50 text-rose-600 border border-rose-100 px-1.5 py-0.5 rounded-full">{typeCount.compartment} compartment</span>}
          </div>
        </div>
        <ChevronRight className={clsx('w-5 h-5 text-gray-400 transition-transform', !collapsed && 'rotate-90')} />
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pl-13">
              {papers.map((p) => (
                <PaperCard key={p.id} paper={p} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function PapersPage() {
  const stats = useMemo(() => getPaperStats(), []);

  const [activeClass, setActiveClass] = useState<10 | 12 | 'all'>(12);
  const [activeType, setActiveType] = useState<PaperType | 'all'>('all');
  const [activeSubject, setActiveSubject] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'year'>('year');

  // Derive available subjects for selected class
  const classPapers = useMemo(
    () => filterPapers({ classLevel: activeClass }),
    [activeClass]
  );
  const subjects = useMemo(
    () => ['All', ...Array.from(new Set(classPapers.map((p) => p.subject))).sort()],
    [classPapers]
  );

  // Final filtered set
  const filtered = useMemo(
    () => filterPapers({ classLevel: activeClass, subject: activeSubject, paperType: activeType }),
    [activeClass, activeSubject, activeType]
  );

  // Years present in filtered set
  const yearsInFiltered = useMemo(
    () => Array.from(new Set(filtered.map((p) => p.year))).sort((a, b) => b - a),
    [filtered]
  );

  return (
    <div className="min-h-screen bg-[#FDFAF6]">

      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-indigo-700 via-indigo-800 to-navy-900 text-white px-4 pt-14 pb-20 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-saffron-400/10 rounded-full blur-2xl" />
        </div>

        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold bg-white/10 border border-white/20 px-3 py-1 rounded-full text-indigo-200 uppercase tracking-wider">Official CBSE Papers</span>
            </div>
            <h1 className="font-fraunces text-4xl sm:text-5xl font-bold mb-3 leading-tight">
              Previous Year Papers
            </h1>
            <p className="text-indigo-200 text-base max-w-xl leading-relaxed mb-8">
              17 years of official CBSE board papers, sample papers &amp; compartment papers - all in one place. Solve them to master board patterns.
            </p>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatBadge icon={FileText}   value={stats.board}         label="Board Papers"    color="bg-white/15" />
              <StatBadge icon={BookOpen}   value={stats.sample}        label="Sample Papers"   color="bg-white/15" />
              <StatBadge icon={Shield}     value={stats.compartment}   label="Compartment"     color="bg-white/15" />
              <StatBadge icon={Calendar}   value={`${stats.yearsSpanned}`} label="Years (2009-2025)" color="bg-white/15" />
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="max-w-5xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="-mt-6 relative z-20 bg-white/90 backdrop-blur-md rounded-2xl border border-[#E8E4DC] shadow-sm p-4 mb-8"
        >
          {/* Row 1: Class + View Mode */}
          <div className="flex flex-wrap gap-3 justify-between items-center mb-3">
            {/* Class */}
            <div className="flex bg-gray-100 p-1 rounded-xl gap-1 text-sm font-semibold">
              {([10, 12, 'all'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => { setActiveClass(c); setActiveSubject('All'); }}
                  className={clsx(
                    'px-5 py-1.5 rounded-lg transition-all whitespace-nowrap',
                    activeClass === c
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {c === 'all' ? 'Resources' : `Class ${c}`}
                </button>
              ))}
            </div>

            {/* View mode + type toggle */}
            <div className="flex items-center gap-2">
              {/* Paper type */}
              <div className="flex bg-gray-100 p-1 rounded-xl gap-1 text-xs font-semibold">
                {(['all', 'board', 'sample', 'compartment'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setActiveType(t)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg transition-all whitespace-nowrap capitalize',
                      activeType === t
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    {t === 'all' ? 'All types' : t}
                  </button>
                ))}
              </div>

              {/* View toggle */}
              <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                <button
                  onClick={() => setViewMode('year')}
                  className={clsx('p-1.5 rounded-lg transition-all', viewMode === 'year' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600')}
                  title="Year view"
                >
                  <BarChart2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={clsx('p-1.5 rounded-lg transition-all', viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600')}
                  title="Grid view"
                >
                  <Layers className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Subject chips */}
          <div className="flex flex-wrap gap-1.5">
            {subjects.map((sub) => (
              <button
                key={sub}
                onClick={() => setActiveSubject(sub)}
                className={clsx(
                  'px-3 py-1 rounded-full text-xs font-semibold transition-all border',
                  activeSubject === sub
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-[#E8E4DC] text-[#4A4A6A] hover:border-indigo-200 hover:text-indigo-600'
                )}
              >
                {sub}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Results summary ── */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-[#8A8AAA]">
            <span className="font-semibold text-navy-700">{filtered.length}</span> papers found
          </p>
          <div className="flex items-center gap-2 text-xs text-[#8A8AAA]">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            {yearsInFiltered.length} year{yearsInFiltered.length !== 1 ? 's' : ''} covered
          </div>
        </div>

        {/* ── Content ── */}
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-12 h-12 text-[#E8E4DC] mx-auto mb-3" />
            <h3 className="text-navy-700 font-semibold mb-1">No papers match your filters</h3>
            <p className="text-sm text-[#8A8AAA]">Try changing class, type, or subject.</p>
          </div>
        ) : viewMode === 'year' ? (
          /* Year timeline view */
          <div className="pb-12">
            {yearsInFiltered.map((year) => (
              <YearSection
                key={year}
                year={year}
                papers={filtered.filter((p) => p.year === year)}
              />
            ))}
          </div>
        ) : (
          /* Flat grid view */
          <motion.div layout className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
            <AnimatePresence mode="popLayout">
              {filtered.map((paper, i) => (
                <motion.div
                  layout
                  key={paper.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.03, 0.25) }}
                >
                  <PaperCard paper={paper} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
