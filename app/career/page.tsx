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
  Briefcase,
  Globe2,
  Rocket,
  Compass,
  Shield,
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

// Career fields & job roles per stream
const CAREER_FIELDS: Record<CareerStream, Array<{ field: string; roles: string; note: string }>> = {
  PCM: [
    { field: 'Engineering & Technology', roles: 'Software, Mechanical, Civil, Electrical, Electronics, Aerospace', note: 'Core of PCM — B.Tech/B.E. via JEE, state CETs, private exams.' },
    { field: 'Computer Science & AI', roles: 'Software Engineer, Data Scientist, ML Engineer, Cybersecurity', note: 'Highest-demand field; CSE/IT branches & online specialisations.' },
    { field: 'Pure & Applied Sciences', roles: 'Physicist, Mathematician, Statistician, Researcher', note: 'BS-MS at IISER/IISc/NISER → research & academia.' },
    { field: 'Architecture & Planning', roles: 'Architect, Urban Planner, Landscape Designer', note: 'B.Arch via NATA / JEE Paper 2; Maths compulsory.' },
    { field: 'Defence & Merchant Navy', roles: 'Armed Forces Officer, Marine Engineer, Nautical Officer', note: 'NDA, IMU-CET — disciplined, well-paid service careers.' },
    { field: 'Data & Actuarial', roles: 'Actuary, Quant Analyst, Data Engineer', note: 'Maths-heavy, high-paying; actuarial science via IAI/IFoA.' },
  ],
  PCB: [
    { field: 'Medicine (MBBS) & Surgery', roles: 'Doctor, Surgeon, Specialist (MD/MS)', note: 'NEET-UG → MBBS, then PG specialisation.' },
    { field: 'Dental & AYUSH', roles: 'Dentist (BDS), BAMS, BHMS, BUMS', note: 'Also via NEET-UG; large network of colleges.' },
    { field: 'Allied & Paramedical', roles: 'Physiotherapy, Nursing, Radiology, Optometry, Lab Tech', note: 'High-demand healthcare careers without MBBS.' },
    { field: 'Biotech & Life Sciences', roles: 'Biotechnologist, Microbiologist, Geneticist, Researcher', note: 'B.Sc/B.Tech Biotech, BS-MS — research & pharma industry.' },
    { field: 'Pharmacy', roles: 'Pharmacist, Drug Inspector, Pharma R&D', note: 'B.Pharm/D.Pharm — via state CETs / GPAT later.' },
    { field: 'Agriculture & Food Tech', roles: 'Agronomist, Food Technologist, Agri-business', note: 'B.Sc Agriculture via CUET/ICAR — fast-growing sector.' },
    { field: 'Veterinary Science', roles: 'Veterinarian, Animal Husbandry Officer', note: 'B.V.Sc via NEET-UG; govt and private practice.' },
  ],
  Commerce: [
    { field: 'Chartered Accountancy', roles: 'CA, Auditor, Tax Consultant, CFO track', note: 'CA Foundation → Inter → Final (ICAI).' },
    { field: 'Company Secretary & Cost Acc.', roles: 'CS, CMA, Compliance & Cost Manager', note: 'CSEET (ICSI) and CMA Foundation (ICMAI) routes.' },
    { field: 'Management (BBA/IPM/MBA)', roles: 'Manager, Consultant, Entrepreneur', note: 'IPMAT (IIM), NPAT, SET → BBA → MBA.' },
    { field: 'Finance & Banking', roles: 'Investment Banker, Analyst, Financial Planner', note: 'B.Com (Hons), CFA, FRM, NISM certifications.' },
    { field: 'Economics & Data', roles: 'Economist, Policy Analyst, Business Analyst', note: 'BA/BSc Economics via CUET → research/policy/analytics.' },
    { field: 'Law (Corporate/Commercial)', roles: 'Corporate Lawyer, Legal Advisor', note: 'CLAT/AILET → 5-year integrated BBA-LLB / B.Com-LLB.' },
    { field: 'Digital Business & Startups', roles: 'Digital Marketer, Product Manager, Founder', note: 'Commerce + tech skills — booming startup economy.' },
  ],
};

// Future-ready / emerging fields (cross-stream)
const EMERGING_FIELDS = [
  { name: 'Artificial Intelligence & Machine Learning', desc: 'Build intelligent systems. Strong for PCM/CS but open to all via online specialisations.' },
  { name: 'Data Science & Analytics', desc: 'Turn data into decisions. Needed in every industry — finance, health, sport, govt.' },
  { name: 'Cybersecurity', desc: 'Protect systems & data. Severe global talent shortage; certifications + practice.' },
  { name: 'Renewable Energy & Sustainability', desc: 'Solar, EV, climate tech. Engineering + policy + business roles expanding fast.' },
  { name: 'Biotechnology & Genomics', desc: 'Gene editing, vaccines, bio-manufacturing. PCB/research pathway.' },
  { name: 'Fintech & Blockchain', desc: 'Digital payments, DeFi, risk. Commerce + tech crossover.' },
  { name: 'UX / Product Design', desc: 'Design digital experiences. Any stream — portfolio matters more than marks.' },
  { name: 'Drones, Robotics & Space', desc: 'ISRO ecosystem, private space (skyroot), automation. PCM core.' },
  { name: 'Digital Content & Creator Economy', desc: 'Media, gaming, animation, marketing — skill + consistency driven.' },
];

// Study-abroad entrance/qualifying tests
const STUDY_ABROAD = [
  { name: 'SAT', desc: 'Undergrad admission test for US & many global universities.', url: 'https://satsuite.collegeboard.org' },
  { name: 'ACT', desc: 'Alternative US undergrad admission test.', url: 'https://www.act.org' },
  { name: 'IELTS', desc: 'English proficiency for UK, Australia, Canada, etc.', url: 'https://www.ielts.org' },
  { name: 'TOEFL', desc: 'English proficiency, widely accepted in the US.', url: 'https://www.ets.org/toefl' },
  { name: 'UCAT / BMAT', desc: 'For medicine abroad (UK & others).', url: 'https://www.ucat.ac.uk' },
  { name: 'Duolingo English Test', desc: 'Affordable online English test accepted by many universities.', url: 'https://englishtest.duolingo.com' },
];

// Broader opportunities beyond the three classic streams
const BROADER_OPPORTUNITIES = [
  { name: 'Defence & Civil Services', desc: 'NDA, CDS, UPSC, SSB — officer & administrative careers.', icon: Shield },
  { name: 'Design & Creative', desc: 'UCEED, NID, NIFT — product, fashion, UX, animation.', icon: Compass },
  { name: 'Law', desc: 'CLAT, AILET — corporate, litigation, judiciary, policy.', icon: Briefcase },
  { name: 'Hospitality & Aviation', desc: 'NCHM JEE, cabin crew, travel & tourism management.', icon: Globe2 },
  { name: 'Liberal Arts & Humanities', desc: 'Ashoka, Krea, DU (CUET) — interdisciplinary degrees.', icon: BookOpen },
  { name: 'Skilling & Vocational', desc: 'Polytechnic, ITI, NSDC skill courses — quick job-ready paths.', icon: Rocket },
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

        {/* === Career Fields & Roles (stream-aware) === */}
        <section className="mt-10">
          <h2 className="font-fraunces text-2xl font-bold text-navy-700 mb-1 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-purple-600" />
            Career Fields &amp; Roles — {STREAM_LABEL[stream]}
          </h2>
          <p className="text-sm text-[#4A4A6A] mb-4">Where this stream can take you, and the roles you can aim for.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CAREER_FIELDS[stream].map((f) => (
              <div key={f.field} className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-4">
                <div className="font-fraunces font-bold text-navy-700 text-sm mb-1">{f.field}</div>
                <div className="text-xs text-purple-700 font-medium mb-1.5">{f.roles}</div>
                <p className="text-xs text-[#4A4A6A] leading-relaxed">{f.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* === Beyond the Usual — Broader Opportunities === */}
        <section className="mt-10">
          <h2 className="font-fraunces text-2xl font-bold text-navy-700 mb-1 flex items-center gap-2">
            <Compass className="w-5 h-5 text-sky-600" />
            Beyond the Usual — More Opportunities
          </h2>
          <p className="text-sm text-[#4A4A6A] mb-4">Strong careers open to students of <strong>any</strong> stream.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BROADER_OPPORTUNITIES.map((o) => {
              const Icon = o.icon;
              return (
                <div key={o.name} className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-sky-600" />
                  </div>
                  <div>
                    <div className="font-fraunces font-bold text-navy-700 text-sm mb-0.5">{o.name}</div>
                    <p className="text-xs text-[#4A4A6A] leading-relaxed">{o.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* === Emerging & Future-Ready Fields === */}
        <section className="mt-10">
          <h2 className="font-fraunces text-2xl font-bold text-navy-700 mb-1 flex items-center gap-2">
            <Rocket className="w-5 h-5 text-emerald-600" />
            Emerging &amp; Future-Ready Fields
          </h2>
          <p className="text-sm text-[#4A4A6A] mb-4">High-growth areas worth exploring early — many are open across streams.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {EMERGING_FIELDS.map((e) => (
              <div key={e.name} className="bg-emerald-50/60 rounded-2xl border border-emerald-100 p-4">
                <div className="font-fraunces font-bold text-navy-700 text-sm mb-1">{e.name}</div>
                <p className="text-xs text-[#4A4A6A] leading-relaxed">{e.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* === Study Abroad === */}
        <section className="mt-10 mb-4">
          <h2 className="font-fraunces text-2xl font-bold text-navy-700 mb-1 flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-amber-600" />
            Planning to Study Abroad?
          </h2>
          <p className="text-sm text-[#4A4A6A] mb-4">Qualifying tests for undergraduate admission outside India.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {STUDY_ABROAD.map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-4 hover:border-amber-200 transition-colors group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-fraunces font-bold text-navy-700 text-sm group-hover:text-amber-700 transition-colors">{s.name}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#8A8AAA]" />
                </div>
                <p className="text-xs text-[#4A4A6A] leading-relaxed">{s.desc}</p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </motion.div>
  );
}
