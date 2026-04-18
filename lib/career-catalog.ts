export type CareerStream = 'pcm' | 'pcb' | 'commerce';

export interface CareerTrack {
  id: string;
  stream: CareerStream;
  title: string;
  description: string;
  sourceUrl: string;
  lastVerifiedAt: string;
  verificationOwner: string;
}

export interface CareerExam {
  id: string;
  track: CareerStream;
  title: string;
  summary: string;
  eligibility: string;
  schedule: string;
  officialUrl: string;
  sourceUrl: string;
  lastVerifiedAt: string;
  verificationOwner: string;
}

export interface ChapterCareerRelevance {
  chapterId: string;
  track: CareerStream;
  pathways: string[];
  relevance: string;
  sourceUrl: string;
  lastVerifiedAt: string;
  verificationOwner: string;
}

const VERIFIED_AT = '2026-04-18';
const OWNER = 'VidyaPath Content Ops';

const TRACKS: CareerTrack[] = [
  {
    id: 'track-commerce-core',
    stream: 'commerce',
    title: 'Commerce Core (CA/CMA/CS/BBA Finance)',
    description: 'Structured pathway for students targeting accountancy, management, taxation, and finance careers.',
    sourceUrl: 'https://www.ncs.gov.in/Pages/about-us.aspx',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
];

const EXAMS: CareerExam[] = [
  {
    id: 'ca-foundation',
    track: 'commerce',
    title: 'CA Foundation (ICAI)',
    summary: 'Entry exam for Chartered Accountancy pathway with accounting, law, and aptitude focus.',
    eligibility: 'Class 12 pass/appearing as per ICAI notifications.',
    schedule: 'Exam and registration windows as published by ICAI announcements.',
    officialUrl: 'https://boslive.icai.org/announcement_details.php?id=484',
    sourceUrl: 'https://boslive.icai.org/announcement_details.php?id=484',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
  {
    id: 'cseet',
    track: 'commerce',
    title: 'CSEET (ICSI)',
    summary: 'Company Secretary Executive Entrance Test for CS pathway.',
    eligibility: 'As specified by ICSI for current session.',
    schedule: 'Session-wise schedule announced by ICSI.',
    officialUrl: 'https://www.icsi.edu/',
    sourceUrl: 'https://www.icsi.edu/',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
  {
    id: 'cma-foundation',
    track: 'commerce',
    title: 'CMA Foundation (ICMAI)',
    summary: 'Entry route for Cost and Management Accounting pathway.',
    eligibility: 'As per ICMAI admission eligibility criteria.',
    schedule: 'Term-wise schedule announced by ICMAI.',
    officialUrl: 'https://icmai.in/studentswebsite/exam.php',
    sourceUrl: 'https://icmai.in/studentswebsite/exam.php',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
  {
    id: 'cuet-ug-commerce',
    track: 'commerce',
    title: 'CUET UG (Commerce Routes)',
    summary: 'Commerce domain admissions for central and participating universities.',
    eligibility: 'Class 12 pass/appearing per NTA CUET bulletin.',
    schedule: 'Annual window as published on NTA CUET portal.',
    officialUrl: 'https://cuet.nta.nic.in',
    sourceUrl: 'https://cuet.nta.nic.in',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
  {
    id: 'ipmat-indore',
    track: 'commerce',
    title: 'IPM AT (IIM Indore and participating institutes)',
    summary: 'Integrated programme admission route aligned to management and business careers.',
    eligibility: 'As per IIM Indore IPM admissions details.',
    schedule: 'Session windows and exam dates published by IIM Indore.',
    officialUrl: 'https://iimidr.ac.in/programmes/academic-programmes/five-year-integrated-programme-in-management-ipm/ipm-admissions-details/',
    sourceUrl: 'https://iimidr.ac.in/programmes/academic-programmes/five-year-integrated-programme-in-management-ipm/ipm-admissions-details/',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
  {
    id: 'ipm-ranchi',
    track: 'commerce',
    title: 'IPM (IIM Ranchi application route)',
    summary: 'Institute-specific IPM application aligned with IPM admissions cycle.',
    eligibility: 'As published by IIM Ranchi admissions page.',
    schedule: 'Annual application window announced by IIM Ranchi.',
    officialUrl: 'https://app.iimranchi.ac.in/admission/ipm.html',
    sourceUrl: 'https://app.iimranchi.ac.in/admission/ipm.html',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
  {
    id: 'nism-certifications',
    track: 'commerce',
    title: 'NISM Certifications (Securities Markets)',
    summary: 'Regulatory and market certification track for finance/securities roles.',
    eligibility: 'As per NISM series requirements.',
    schedule: 'Ongoing windows as published by NISM.',
    officialUrl: 'https://www.nism.ac.in/depository-operations-cpe/',
    sourceUrl: 'https://www.nism.ac.in/depository-operations-cpe/',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
];

const CHAPTER_MAP: ChapterCareerRelevance[] = [
  {
    chapterId: 'c12-acc-1',
    track: 'commerce',
    pathways: ['CA Foundation', 'CMA Foundation'],
    relevance: 'Partnership and accounting treatment skills map directly to accounting and audit fundamentals.',
    sourceUrl: 'https://boslive.icai.org/announcement_details.php?id=484',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
  {
    chapterId: 'c12-acc-4',
    track: 'commerce',
    pathways: ['CA Foundation', 'CMA Foundation', 'BBA Finance'],
    relevance: 'Ratio and financial analysis are core for financial statement interpretation in higher studies.',
    sourceUrl: 'https://icmai.in/studentswebsite/exam.php',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
  {
    chapterId: 'c12-bst-5',
    track: 'commerce',
    pathways: ['IPM', 'BBA', 'Management'],
    relevance: 'Marketing and consumer behavior directly support business management entrance preparation.',
    sourceUrl: 'https://iimidr.ac.in/programmes/academic-programmes/five-year-integrated-programme-in-management-ipm/ipm-admissions-details/',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
  {
    chapterId: 'c12-eco-1',
    track: 'commerce',
    pathways: ['CUET UG Commerce', 'BCom Economics', 'BBA Finance'],
    relevance: 'National income and macro foundations support commerce entrance domain sections.',
    sourceUrl: 'https://cuet.nta.nic.in',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
  {
    chapterId: 'c12-eco-5',
    track: 'commerce',
    pathways: ['CUET UG Commerce', 'IPM', 'Finance careers'],
    relevance: 'Open economy and BOP concepts map to management and finance program readiness.',
    sourceUrl: 'https://www.ncs.gov.in/Pages/about-us.aspx',
    lastVerifiedAt: VERIFIED_AT,
    verificationOwner: OWNER,
  },
];

function inferCommerceMap(chapterId: string): ChapterCareerRelevance | null {
  if (chapterId.startsWith('c12-acc-')) {
    return {
      chapterId,
      track: 'commerce',
      pathways: ['CA Foundation', 'CMA Foundation', 'BCom Accounts'],
      relevance: 'Accounting chapters directly support accountancy and cost-management pathways.',
      sourceUrl: 'https://icmai.in/studentswebsite/exam.php',
      lastVerifiedAt: VERIFIED_AT,
      verificationOwner: OWNER,
    };
  }
  if (chapterId.startsWith('c12-bst-')) {
    return {
      chapterId,
      track: 'commerce',
      pathways: ['IPM', 'BBA', 'Management programs'],
      relevance: 'Business studies chapters map to management aptitude and business foundations.',
      sourceUrl: 'https://iimidr.ac.in/programmes/academic-programmes/five-year-integrated-programme-in-management-ipm/ipm-admissions-details/',
      lastVerifiedAt: VERIFIED_AT,
      verificationOwner: OWNER,
    };
  }
  if (chapterId.startsWith('c12-eco-')) {
    return {
      chapterId,
      track: 'commerce',
      pathways: ['CUET UG Commerce', 'Economics majors', 'Finance pathways'],
      relevance: 'Economics chapters strengthen domain readiness for commerce and management admissions.',
      sourceUrl: 'https://cuet.nta.nic.in',
      lastVerifiedAt: VERIFIED_AT,
      verificationOwner: OWNER,
    };
  }
  return null;
}

export function listCareerTracks(stream?: CareerStream): CareerTrack[] {
  if (!stream) return TRACKS;
  return TRACKS.filter((track) => track.stream === stream);
}

export function listCareerExams(track?: CareerStream): CareerExam[] {
  if (!track) return EXAMS;
  return EXAMS.filter((exam) => exam.track === track);
}

export function getChapterCareerMap(chapterId: string): ChapterCareerRelevance | null {
  const exact = CHAPTER_MAP.find((row) => row.chapterId === chapterId);
  if (exact) return exact;
  return inferCommerceMap(chapterId);
}
