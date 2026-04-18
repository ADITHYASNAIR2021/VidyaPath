'use client';

import { useState } from 'react';
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Telescope,
  Microscope,
  Trophy,
  BookOpen,
  GraduationCap,
  Star,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ENTRANCE_EXAMS,
  TOP_COLLEGES,
  SCHOLARSHIPS,
  ROADMAP_PCM,
  ROADMAP_PCB,
  ROADMAP_COMMERCE,
} from '@/lib/data';

type CareerStream = 'PCM' | 'PCB' | 'Commerce';

const STREAM_STYLES: Record<CareerStream | 'Both', { bg: string; text: string; light: string }> = {
  PCM: { bg: 'bg-sky-600', text: 'text-sky-700', light: 'bg-sky-50 border-sky-100' },
  PCB: { bg: 'bg-emerald-600', text: 'text-emerald-700', light: 'bg-emerald-50 border-emerald-100' },
  Commerce: { bg: 'bg-amber-600', text: 'text-amber-700', light: 'bg-amber-50 border-amber-100' },
  Both: { bg: 'bg-purple-600', text: 'text-purple-700', light: 'bg-purple-50 border-purple-100' },
};

const TIER_STYLES = {
  Elite: 'bg-amber-100 text-amber-700 border-amber-200',
  Top: 'bg-sky-100 text-sky-700 border-sky-100',
  Good: 'bg-green-100 text-green-700 border-green-100',
};

const STREAM_LABEL: Record<CareerStream, string> = {
  PCM: 'Engineering',
  PCB: 'Medical',
  Commerce: 'Commerce and Finance',
};

const OFFICIAL_PORTALS = [
  { name: 'JEE Main', url: 'https://jeemain.nta.nic.in' },
  { name: 'JEE Advanced', url: 'https://jeeadv.ac.in' },
  { name: 'NEET-UG', url: 'https://neet.nta.nic.in' },
  { name: 'CUET-UG (NTA)', url: 'https://cuet.nta.nic.in' },
  { name: 'CA Foundation (ICAI)', url: 'https://boslive.icai.org/announcement_details.php?id=484' },
  { name: 'CSEET (ICSI)', url: 'https://www.icsi.edu/' },
  { name: 'CMA Foundation (ICMAI)', url: 'https://icmai.in/studentswebsite/exam.php' },
  { name: 'IPM AT (IIM Indore)', url: 'https://iimidr.ac.in/programmes/academic-programmes/five-year-integrated-programme-in-management-ipm/ipm-admissions-details/' },
  { name: 'IIM Ranchi IPM', url: 'https://app.iimranchi.ac.in/admission/ipm.html' },
  { name: 'NISM Certifications', url: 'https://www.nism.ac.in/depository-operations-cpe/' },
];

const COMMON_RESOURCES = [
  { name: 'NCERT Textbooks', desc: 'All chapters free PDF', url: 'https://ncert.nic.in/textbook.php' },
  { name: 'CBSE Sample Papers', desc: 'Official previous papers', url: 'https://cbseacademic.nic.in' },
  { name: 'National Scholarship Portal', desc: 'Government scholarship platform', url: 'https://scholarships.gov.in' },
];

const SCIENCE_RESOURCES = [
  { name: 'Physics Wallah (PW)', desc: 'Free and affordable coaching support', url: 'https://www.pw.live' },
  { name: 'Khan Academy India', desc: 'Math and science concept revision', url: 'https://in.khanacademy.org' },
  { name: 'DoubtNut', desc: 'Question-level doubt support', url: 'https://www.doubtnut.com' },
];

const COMMERCE_RESOURCES = [
  { name: 'ICAI BoS', desc: 'Official CA announcements and updates', url: 'https://boslive.icai.org/announcement_details.php?id=484' },
  { name: 'ICSI', desc: 'Official CS pathway and CSEET updates', url: 'https://www.icsi.edu/' },
  { name: 'ICMAI', desc: 'Official CMA foundation information', url: 'https://icmai.in/studentswebsite/exam.php' },
  { name: 'National Career Service', desc: 'Government career pathways', url: 'https://www.ncs.gov.in/Pages/about-us.aspx' },
];

function ExamAccordion({ exam }: { exam: (typeof ENTRANCE_EXAMS)[0] }) {
  const [open, setOpen] = useState(false);
  const streamStyle = STREAM_STYLES[exam.stream];

  return (
    <div className={clsx('rounded-2xl border overflow-hidden', streamStyle.light)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-black/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold', streamStyle.bg)}>
            {exam.name.slice(0, 2)}
          </div>
          <div>
            <div className="font-fraunces font-bold text-navy-700 text-base">{exam.name}</div>
            <div className="text-xs text-[#4A4A6A] mt-0.5">{exam.forColleges}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full hidden sm:block', streamStyle.bg, 'text-white')}>
            {exam.stream}
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-[#8A8AAA]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#8A8AAA]" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-5 border-t border-white/50 space-y-4 overflow-hidden"
          >
            <div className="pt-4 pb-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-[#8A8AAA] uppercase tracking-wide mb-1">Eligibility</div>
                  <p className="text-sm text-[#4A4A6A]">{exam.eligibility}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#8A8AAA] uppercase tracking-wide mb-1">Exam Pattern</div>
                  <p className="text-sm text-[#4A4A6A]">{exam.pattern}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#8A8AAA] uppercase tracking-wide mb-1">Important Dates</div>
                  <p className="text-sm text-[#4A4A6A]">{exam.dates}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#8A8AAA] uppercase tracking-wide mb-1">Prep Tip</div>
                  <p className="text-sm text-emerald-700 font-medium">{exam.prepTip}</p>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#8A8AAA] uppercase tracking-wide mb-2">Top Colleges</div>
                <div className="flex flex-wrap gap-1.5">
                  {exam.topColleges.map((college) => (
                    <span
                      key={college}
                      className="text-xs bg-white border border-[#E8E4DC] text-[#4A4A6A] px-2.5 py-1 rounded-full"
                    >
                      {college}
                    </span>
                  ))}
                </div>
              </div>

              <a
                href={exam.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={clsx('inline-flex items-center gap-1.5 text-sm font-semibold transition-colors', streamStyle.text)}
              >
                Official Website
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CareerPage() {
  const [stream, setStream] = useState<CareerStream>('PCM');

  const filteredExams = ENTRANCE_EXAMS.filter((e) => e.stream === stream || e.stream === 'Both');
  const filteredColleges = TOP_COLLEGES.filter((c) => c.stream === stream || c.stream === 'Both');

  const roadmap =
    stream === 'PCM'
      ? ROADMAP_PCM
      : stream === 'PCB'
      ? ROADMAP_PCB
      : ROADMAP_COMMERCE;

  const resources = [
    ...(stream === 'Commerce' ? COMMERCE_RESOURCES : SCIENCE_RESOURCES),
    ...COMMON_RESOURCES,
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-[#FDFAF6]">
      <div className="bg-gradient-to-br from-purple-700 to-purple-900 text-white px-4 py-12">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-fraunces text-3xl sm:text-4xl font-bold mb-2">Career Guide</h1>
          <p className="text-purple-200 text-base max-w-xl">
            JEE, NEET, CUET, CA, CS, CMA, and IPM guidance to plan your path after Class 12.
            Free resources, scholarship links, official portals, and a year-by-year roadmap.
          </p>

          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={() => setStream('PCM')}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all',
                stream === 'PCM' ? 'bg-white text-sky-700 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
              )}
            >
              <Telescope className="w-4 h-4" />
              PCM - Engineering
            </button>
            <button
              onClick={() => setStream('PCB')}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all',
                stream === 'PCB' ? 'bg-white text-emerald-700 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
              )}
            >
              <Microscope className="w-4 h-4" />
              PCB - Medical
            </button>
            <button
              onClick={() => setStream('Commerce')}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all',
                stream === 'Commerce' ? 'bg-white text-amber-700 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
              )}
            >
              <GraduationCap className="w-4 h-4" />
              Commerce - Finance
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-8">
            <div>
              <h2 className="font-fraunces text-2xl font-bold text-navy-700 mb-4">
                Entrance Exams for {STREAM_LABEL[stream]}
              </h2>
              <div className="space-y-3">
                {filteredExams.map((exam) => (
                  <ExamAccordion key={exam.id} exam={exam} />
                ))}
              </div>
            </div>

            <div>
              <h2 className="font-fraunces text-2xl font-bold text-navy-700 mb-4">Year-by-Year Roadmap</h2>
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-200 via-purple-300 to-purple-100 hidden sm:block" />

                <div className="space-y-4">
                  {roadmap.map(({ stage, title, steps }, i) => (
                    <motion.div
                      key={stage}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="sm:pl-14 relative"
                    >
                      <div className="absolute left-2.5 top-3 w-5 h-5 rounded-full border-2 border-purple-400 bg-white hidden sm:flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                      </div>

                      <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">
                            {stage}
                          </span>
                        </div>
                        <h3 className="font-fraunces font-bold text-navy-700 text-base mb-3">{title}</h3>
                        <ul className="space-y-1.5">
                          {steps.map((step) => (
                            <li key={step} className="flex items-start gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                              <span className="text-sm text-[#4A4A6A] leading-relaxed">{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
              <h3 className="font-fraunces text-base font-bold text-navy-700 mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                Top Colleges ({stream})
              </h3>
              <div className="space-y-2">
                {filteredColleges.map((college) => (
                  <a
                    key={college.name}
                    href={college.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-gray-50 transition-colors group"
                  >
                    <span className="text-sm text-navy-700 font-medium group-hover:text-saffron-500 transition-colors">
                      {college.name}
                    </span>
                    <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full border', TIER_STYLES[college.tier])}>
                      {college.tier}
                    </span>
                  </a>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
              <h3 className="font-fraunces text-base font-bold text-navy-700 mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-sky-500" />
                Free Study Resources
              </h3>
              <div className="space-y-2">
                {resources.map(({ name, desc, url }) => (
                  <a
                    key={name}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between py-2 px-3 rounded-xl hover:bg-gray-50 transition-colors group gap-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-navy-700 group-hover:text-saffron-500 transition-colors">
                        {name}
                      </div>
                      <div className="text-xs text-[#8A8AAA]">{desc}</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-[#8A8AAA] flex-shrink-0 mt-0.5" />
                  </a>
                ))}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
              <h3 className="font-fraunces text-base font-bold text-navy-700 mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                Scholarships for Students
              </h3>
              <div className="space-y-3">
                {SCHOLARSHIPS.map((s) => (
                  <div key={s.name} className="border-b border-amber-100 last:border-0 pb-2 last:pb-0">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-amber-700 hover:text-amber-800 transition-colors flex items-center gap-1"
                    >
                      {s.name}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <p className="text-xs text-[#4A4A6A] mt-0.5 leading-relaxed">{s.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
              <h3 className="font-fraunces text-base font-bold text-navy-700 mb-3 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-purple-500" />
                Official Exam Portals
              </h3>
              <div className="space-y-2">
                {OFFICIAL_PORTALS.map(({ name, url }) => (
                  <a
                    key={name}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-gray-50 group transition-colors"
                  >
                    <span className="text-sm text-[#4A4A6A] group-hover:text-saffron-500 transition-colors font-medium">
                      {name}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#8A8AAA]" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
