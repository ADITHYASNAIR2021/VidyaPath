import HF_PAPER_INDEX from './hfPaperIndex.json';

// ============================================================
// VidyaPath - Comprehensive CBSE Papers Data
// Board Exam Papers: 2009-2025 (Class 10 & 12)
// Sample Papers: 2019-2025
// Compartment Papers: 2022-2025
// ============================================================

export type PaperType = 'board' | 'sample' | 'compartment';
export type PaperSet = 'Delhi' | 'Outside Delhi' | 'Foreign' | 'All India' | 'Standard' | 'Basic';

export interface PaperEntry {
  id: string;
  classLevel: 10 | 12 | 'all';
  subject: string;
  year: number;
  title: string;
  duration: string;
  totalMarks: number;
  url: string;
  paperType: PaperType;
  set?: PaperSet;
  isOfficial?: boolean;   // links directly to official CBSE source
  hasMarkingScheme?: boolean;
  isFromHF?: boolean;
}

// ── Hugging Face Dataset - primary source for actual PDF files ──
// Repo: https://huggingface.co/datasets/AdithyaSNair/cbse-papers-2009-2025
// All 4,666 PDFs are hosted here with the same folder structure as
// the local dataset/ directory.
//
// URL pattern:
//   HF_BASE + "/" + path/inside/dataset/folder + ".pdf"
//
// Example:
//   hf("2025/Class_10/Science/086_science.zip_extracted/086_Science/31-1-1_Science.pdf")
//   -> https://huggingface.co/datasets/AdithyaSNair/cbse-papers-2009-2025/resolve/main/2025/Class_10/Science/...
//
// IMPORTANT: Update HF_DATASET_REPO below once you've created the HF dataset repo.
// Until then, cards fall back to the official CBSE archive page.

const HF_DATASET_REPO = 'AdithyaSNair/cbse-papers-2009-2025'; // <- change to your HF username/repo
const HF_BASE = `https://huggingface.co/datasets/${HF_DATASET_REPO}/resolve/main`;

/** Build a direct PDF link from HF dataset using the local relative path */
export function hf(relativePath: string): string {
  // Encode spaces and special chars in path segments, but keep slashes
  const encoded = relativePath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `${HF_BASE}/${encoded}`;
}

type ResolvedSubject =
  | 'Physics'
  | 'Chemistry'
  | 'Biology'
  | 'Math'
  | 'Science'
  | 'Accountancy'
  | 'Business Studies'
  | 'Economics'
  | 'English Core';

function normalizePaperSubject(subject: string): ResolvedSubject | null {
  const normalized = subject.trim().toLowerCase();
  if (normalized.includes('account')) return 'Accountancy';
  if (normalized.includes('business')) return 'Business Studies';
  if (normalized.includes('economics') || normalized === 'eco') return 'Economics';
  if (normalized.includes('english')) return 'English Core';
  if (normalized.includes('physics')) return 'Physics';
  if (normalized.includes('chem')) return 'Chemistry';
  if (normalized.includes('bio')) return 'Biology';
  if (normalized.includes('math')) return 'Math';
  if (normalized === 'science') return 'Science';
  return null;
}

function getMathVariant(paper: PaperEntry): 'basic' | 'standard' | 'default' {
  const combined = `${paper.title} ${paper.set ?? ''}`.toLowerCase();
  if (combined.includes('basic')) return 'basic';
  if (combined.includes('standard') || combined.includes('std')) return 'standard';
  return 'default';
}

function getHfIndexKey(paper: PaperEntry): string | null {
  if (paper.classLevel !== 10 && paper.classLevel !== 12) return null;
  if (paper.paperType !== 'board' && paper.paperType !== 'compartment') return null;

  const subject = normalizePaperSubject(paper.subject);
  if (!subject) return null;

  const variant = subject === 'Math' && paper.classLevel === 10
    ? getMathVariant(paper)
    : 'default';

  return `${paper.paperType}|${paper.year}|${paper.classLevel}|${subject}|${variant}`;
}

function resolvePaperUrl(paper: PaperEntry): { url: string; isFromHF: boolean } {
  if (paper.url.startsWith(`${HF_BASE}/`)) {
    return { url: paper.url, isFromHF: true };
  }
  const hfIndex = HF_PAPER_INDEX as Record<string, string>;
  const key = getHfIndexKey(paper);
  if (!key) return { url: paper.url, isFromHF: false };

  const direct = hfIndex[key];
  if (direct) return { url: hf(direct), isFromHF: true };

  if (paper.classLevel === 10 && normalizePaperSubject(paper.subject) === 'Math') {
    const fallbackKey = `${paper.paperType}|${paper.year}|${paper.classLevel}|Math|default`;
    const fallback = hfIndex[fallbackKey];
    if (fallback) return { url: hf(fallback), isFromHF: true };
  }

  return { url: paper.url, isFromHF: false };
}

function parseHfPaperType(raw: string): PaperType {
  if (raw === 'sample') return 'sample';
  if (raw === 'compartment') return 'compartment';
  return 'board';
}

function parseClassLevel(raw: string): 10 | 12 | null {
  const value = Number(raw);
  if (value === 10 || value === 12) return value;
  return null;
}

function inferSetFromVariant(variant: string): PaperSet | undefined {
  const normalized = variant.trim().toLowerCase();
  if (normalized === 'basic') return 'Basic';
  if (normalized === 'standard') return 'Standard';
  return undefined;
}

function estimateTotalMarks(classLevel: 10 | 12, subject: string): number {
  if (subject === 'Marking Scheme') return 0;
  if (classLevel === 10) {
    return subject.toLowerCase().includes('math') ? 80 : 80;
  }
  return subject.toLowerCase().includes('math') ? 80 : 80;
}

// ── CBSE Official base URLs - fallback / sample papers ───────
const CBSE_QP_10 = 'https://cbseacademic.nic.in/Question_Paper_classx.html';
const CBSE_QP_12 = 'https://cbseacademic.nic.in/Question_Paper.html';
const CBSE_SQP_12 = (yr: string) => `https://cbseacademic.nic.in/SQP_CLASSXII_${yr}.html`;
const CBSE_SQP_10 = (yr: string) => `https://cbseacademic.nic.in/SQP_CLASSX_${yr}.html`;
const CBSE_MS = 'https://cbseacademic.nic.in/Marking_Scheme.html';

// ============================================================
// BOARD EXAM PAPERS - CLASS 12
// ============================================================

const boardPapers12: PaperEntry[] = [
  // ── 2025 - HF direct links (update paths after upload) ────
  { id: 'b12-phy-2025', classLevel: 12, subject: 'Physics', year: 2025, title: 'Class 12 Physics Board Paper 2025', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'All India', isOfficial: true },
  { id: 'b12-chem-2025', classLevel: 12, subject: 'Chemistry', year: 2025, title: 'Class 12 Chemistry Board Paper 2025', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'All India', isOfficial: true },
  { id: 'b12-bio-2025', classLevel: 12, subject: 'Biology', year: 2025, title: 'Class 12 Biology Board Paper 2025', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'All India', isOfficial: true },
  { id: 'b12-math-2025', classLevel: 12, subject: 'Math', year: 2025, title: 'Class 12 Mathematics Board Paper 2025', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_12, paperType: 'board', set: 'All India', isOfficial: true },

  // ── 2024 ──────────────────────────────────────────────────
  { id: 'b12-phy-2024-d', classLevel: 12, subject: 'Physics', year: 2024, title: 'Class 12 Physics Board Paper 2024 (Delhi)', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/web_material/QP/2024/12_Physics_2024.pdf', paperType: 'board', set: 'Delhi', isOfficial: true, hasMarkingScheme: true },
  { id: 'b12-phy-2024-od', classLevel: 12, subject: 'Physics', year: 2024, title: 'Class 12 Physics Board Paper 2024 (Outside Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Outside Delhi', isOfficial: true },
  { id: 'b12-chem-2024-d', classLevel: 12, subject: 'Chemistry', year: 2024, title: 'Class 12 Chemistry Board Paper 2024 (Delhi)', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/web_material/QP/2024/12_Chemistry_2024.pdf', paperType: 'board', set: 'Delhi', isOfficial: true, hasMarkingScheme: true },
  { id: 'b12-bio-2024-d', classLevel: 12, subject: 'Biology', year: 2024, title: 'Class 12 Biology Board Paper 2024 (Delhi)', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/web_material/QP/2024/12_Biology_2024.pdf', paperType: 'board', set: 'Delhi', isOfficial: true, hasMarkingScheme: true },
  { id: 'b12-math-2024-d', classLevel: 12, subject: 'Math', year: 2024, title: 'Class 12 Mathematics Board Paper 2024 (Delhi)', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/web_material/QP/2024/12_Mathematics_2024.pdf', paperType: 'board', set: 'Delhi', isOfficial: true, hasMarkingScheme: true },

  // ── 2023 ──────────────────────────────────────────────────
  { id: 'b12-phy-2023-d', classLevel: 12, subject: 'Physics', year: 2023, title: 'Class 12 Physics Board Paper 2023 (Delhi)', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/web_material/QP/2023/12_Physics_2023_Delhi.pdf', paperType: 'board', set: 'Delhi', isOfficial: true, hasMarkingScheme: true },
  { id: 'b12-phy-2023-od', classLevel: 12, subject: 'Physics', year: 2023, title: 'Class 12 Physics Board Paper 2023 (Outside Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Outside Delhi', isOfficial: true },
  { id: 'b12-chem-2023-d', classLevel: 12, subject: 'Chemistry', year: 2023, title: 'Class 12 Chemistry Board Paper 2023 (Delhi)', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/web_material/QP/2023/12_Chemistry_2023_Delhi.pdf', paperType: 'board', set: 'Delhi', isOfficial: true, hasMarkingScheme: true },
  { id: 'b12-bio-2023-d', classLevel: 12, subject: 'Biology', year: 2023, title: 'Class 12 Biology Board Paper 2023 (Delhi)', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/web_material/QP/2023/12_Biology_2023_Delhi.pdf', paperType: 'board', set: 'Delhi', isOfficial: true, hasMarkingScheme: true },
  { id: 'b12-math-2023-d', classLevel: 12, subject: 'Math', year: 2023, title: 'Class 12 Mathematics Board Paper 2023 (Delhi)', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/web_material/QP/2023/12_Maths_2023_Delhi.pdf', paperType: 'board', set: 'Delhi', isOfficial: true, hasMarkingScheme: true },

  // ── 2022 ──────────────────────────────────────────────────
  { id: 'b12-phy-2022-t1', classLevel: 12, subject: 'Physics', year: 2022, title: 'Class 12 Physics Board Paper 2022 Term 2', duration: '2 Hours', totalMarks: 35, url: CBSE_QP_12, paperType: 'board', set: 'All India', isOfficial: true },
  { id: 'b12-chem-2022-t1', classLevel: 12, subject: 'Chemistry', year: 2022, title: 'Class 12 Chemistry Board Paper 2022 Term 2', duration: '2 Hours', totalMarks: 35, url: CBSE_QP_12, paperType: 'board', set: 'All India', isOfficial: true },
  { id: 'b12-bio-2022-t1', classLevel: 12, subject: 'Biology', year: 2022, title: 'Class 12 Biology Board Paper 2022 Term 2', duration: '2 Hours', totalMarks: 35, url: CBSE_QP_12, paperType: 'board', set: 'All India', isOfficial: true },
  { id: 'b12-math-2022-t1', classLevel: 12, subject: 'Math', year: 2022, title: 'Class 12 Mathematics Board Paper 2022 Term 2', duration: '2 Hours', totalMarks: 40, url: CBSE_QP_12, paperType: 'board', set: 'All India', isOfficial: true },

  // ── 2019 ──────────────────────────────────────────────────
  { id: 'b12-phy-2019-d', classLevel: 12, subject: 'Physics', year: 2019, title: 'Class 12 Physics Board Paper 2019 (Delhi Set 1)', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/web_material/QP/2019/12_Physics_2019_Delhi_Set1.pdf', paperType: 'board', set: 'Delhi', isOfficial: true, hasMarkingScheme: true },
  { id: 'b12-phy-2019-od', classLevel: 12, subject: 'Physics', year: 2019, title: 'Class 12 Physics Board Paper 2019 (Outside Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Outside Delhi', isOfficial: true },
  { id: 'b12-chem-2019-d', classLevel: 12, subject: 'Chemistry', year: 2019, title: 'Class 12 Chemistry Board Paper 2019 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-bio-2019-d', classLevel: 12, subject: 'Biology', year: 2019, title: 'Class 12 Biology Board Paper 2019 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-math-2019-d', classLevel: 12, subject: 'Math', year: 2019, title: 'Class 12 Mathematics Board Paper 2019 (Delhi)', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2018 ──────────────────────────────────────────────────
  { id: 'b12-phy-2018-d', classLevel: 12, subject: 'Physics', year: 2018, title: 'Class 12 Physics Board Paper 2018 (Delhi Set 1)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-phy-2018-od', classLevel: 12, subject: 'Physics', year: 2018, title: 'Class 12 Physics Board Paper 2018 (Outside Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Outside Delhi', isOfficial: true },
  { id: 'b12-chem-2018-d', classLevel: 12, subject: 'Chemistry', year: 2018, title: 'Class 12 Chemistry Board Paper 2018 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-bio-2018-d', classLevel: 12, subject: 'Biology', year: 2018, title: 'Class 12 Biology Board Paper 2018 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-math-2018-d', classLevel: 12, subject: 'Math', year: 2018, title: 'Class 12 Mathematics Board Paper 2018 (Delhi)', duration: '3 Hours', totalMarks: 100, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2017 ──────────────────────────────────────────────────
  { id: 'b12-phy-2017-d', classLevel: 12, subject: 'Physics', year: 2017, title: 'Class 12 Physics Board Paper 2017 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-phy-2017-od', classLevel: 12, subject: 'Physics', year: 2017, title: 'Class 12 Physics Board Paper 2017 (Outside Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Outside Delhi', isOfficial: true },
  { id: 'b12-chem-2017-d', classLevel: 12, subject: 'Chemistry', year: 2017, title: 'Class 12 Chemistry Board Paper 2017 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-bio-2017-d', classLevel: 12, subject: 'Biology', year: 2017, title: 'Class 12 Biology Board Paper 2017 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-math-2017-d', classLevel: 12, subject: 'Math', year: 2017, title: 'Class 12 Mathematics Board Paper 2017 (Delhi)', duration: '3 Hours', totalMarks: 100, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2016 ──────────────────────────────────────────────────
  { id: 'b12-phy-2016-d', classLevel: 12, subject: 'Physics', year: 2016, title: 'Class 12 Physics Board Paper 2016 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-chem-2016-d', classLevel: 12, subject: 'Chemistry', year: 2016, title: 'Class 12 Chemistry Board Paper 2016 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-bio-2016-d', classLevel: 12, subject: 'Biology', year: 2016, title: 'Class 12 Biology Board Paper 2016 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-math-2016-d', classLevel: 12, subject: 'Math', year: 2016, title: 'Class 12 Mathematics Board Paper 2016 (Delhi)', duration: '3 Hours', totalMarks: 100, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2015 ──────────────────────────────────────────────────
  { id: 'b12-phy-2015-d', classLevel: 12, subject: 'Physics', year: 2015, title: 'Class 12 Physics Board Paper 2015 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-chem-2015-d', classLevel: 12, subject: 'Chemistry', year: 2015, title: 'Class 12 Chemistry Board Paper 2015 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-bio-2015-d', classLevel: 12, subject: 'Biology', year: 2015, title: 'Class 12 Biology Board Paper 2015 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-math-2015-d', classLevel: 12, subject: 'Math', year: 2015, title: 'Class 12 Mathematics Board Paper 2015 (Delhi)', duration: '3 Hours', totalMarks: 100, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2014 ──────────────────────────────────────────────────
  { id: 'b12-phy-2014-d', classLevel: 12, subject: 'Physics', year: 2014, title: 'Class 12 Physics Board Paper 2014 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-chem-2014-d', classLevel: 12, subject: 'Chemistry', year: 2014, title: 'Class 12 Chemistry Board Paper 2014 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-bio-2014-d', classLevel: 12, subject: 'Biology', year: 2014, title: 'Class 12 Biology Board Paper 2014 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-math-2014-d', classLevel: 12, subject: 'Math', year: 2014, title: 'Class 12 Mathematics Board Paper 2014 (Delhi)', duration: '3 Hours', totalMarks: 100, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2013 ──────────────────────────────────────────────────
  { id: 'b12-phy-2013-d', classLevel: 12, subject: 'Physics', year: 2013, title: 'Class 12 Physics Board Paper 2013 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-chem-2013-d', classLevel: 12, subject: 'Chemistry', year: 2013, title: 'Class 12 Chemistry Board Paper 2013 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-bio-2013-d', classLevel: 12, subject: 'Biology', year: 2013, title: 'Class 12 Biology Board Paper 2013 (Delhi)', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-math-2013-d', classLevel: 12, subject: 'Math', year: 2013, title: 'Class 12 Mathematics Board Paper 2013 (Delhi)', duration: '3 Hours', totalMarks: 100, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2012 ──────────────────────────────────────────────────
  { id: 'b12-phy-2012', classLevel: 12, subject: 'Physics', year: 2012, title: 'Class 12 Physics Board Paper 2012', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-chem-2012', classLevel: 12, subject: 'Chemistry', year: 2012, title: 'Class 12 Chemistry Board Paper 2012', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-bio-2012', classLevel: 12, subject: 'Biology', year: 2012, title: 'Class 12 Biology Board Paper 2012', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-math-2012', classLevel: 12, subject: 'Math', year: 2012, title: 'Class 12 Mathematics Board Paper 2012', duration: '3 Hours', totalMarks: 100, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2011 ──────────────────────────────────────────────────
  { id: 'b12-phy-2011', classLevel: 12, subject: 'Physics', year: 2011, title: 'Class 12 Physics Board Paper 2011', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-chem-2011', classLevel: 12, subject: 'Chemistry', year: 2011, title: 'Class 12 Chemistry Board Paper 2011', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-bio-2011', classLevel: 12, subject: 'Biology', year: 2011, title: 'Class 12 Biology Board Paper 2011', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-math-2011', classLevel: 12, subject: 'Math', year: 2011, title: 'Class 12 Mathematics Board Paper 2011', duration: '3 Hours', totalMarks: 100, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2010 ──────────────────────────────────────────────────
  { id: 'b12-phy-2010', classLevel: 12, subject: 'Physics', year: 2010, title: 'Class 12 Physics Board Paper 2010', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-chem-2010', classLevel: 12, subject: 'Chemistry', year: 2010, title: 'Class 12 Chemistry Board Paper 2010', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-bio-2010', classLevel: 12, subject: 'Biology', year: 2010, title: 'Class 12 Biology Board Paper 2010', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-math-2010', classLevel: 12, subject: 'Math', year: 2010, title: 'Class 12 Mathematics Board Paper 2010', duration: '3 Hours', totalMarks: 100, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2009 ──────────────────────────────────────────────────
  { id: 'b12-phy-2009', classLevel: 12, subject: 'Physics', year: 2009, title: 'Class 12 Physics Board Paper 2009', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-chem-2009', classLevel: 12, subject: 'Chemistry', year: 2009, title: 'Class 12 Chemistry Board Paper 2009', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-bio-2009', classLevel: 12, subject: 'Biology', year: 2009, title: 'Class 12 Biology Board Paper 2009', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b12-math-2009', classLevel: 12, subject: 'Math', year: 2009, title: 'Class 12 Mathematics Board Paper 2009', duration: '3 Hours', totalMarks: 100, url: CBSE_QP_12, paperType: 'board', set: 'Delhi', isOfficial: true },
];

// ============================================================
// BOARD EXAM PAPERS - CLASS 10
// ============================================================

const boardPapers10: PaperEntry[] = [
  // ── 2025 ──────────────────────────────────────────────────
  { id: 'b10-sci-2025', classLevel: 10, subject: 'Science', year: 2025, title: 'Class 10 Science Board Paper 2025', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'board', set: 'All India', isOfficial: true },
  { id: 'b10-math-std-2025', classLevel: 10, subject: 'Math', year: 2025, title: 'Class 10 Mathematics (Standard) Board Paper 2025', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'board', set: 'Standard', isOfficial: true },
  { id: 'b10-math-bas-2025', classLevel: 10, subject: 'Math', year: 2025, title: 'Class 10 Mathematics (Basic) Board Paper 2025', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'board', set: 'Basic', isOfficial: true },

  // ── 2024 ──────────────────────────────────────────────────
  { id: 'b10-sci-2024', classLevel: 10, subject: 'Science', year: 2024, title: 'Class 10 Science Board Paper 2024 (Set 1)', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/web_material/QP/2024/10_Science_2024_Set1.pdf', paperType: 'board', set: 'All India', isOfficial: true, hasMarkingScheme: true },
  { id: 'b10-math-std-2024', classLevel: 10, subject: 'Math', year: 2024, title: 'Class 10 Mathematics Standard Board Paper 2024', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/web_material/QP/2024/10_Maths_Standard_2024.pdf', paperType: 'board', set: 'Standard', isOfficial: true, hasMarkingScheme: true },
  { id: 'b10-math-bas-2024', classLevel: 10, subject: 'Math', year: 2024, title: 'Class 10 Mathematics Basic Board Paper 2024', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/web_material/QP/2024/10_Maths_Basic_2024.pdf', paperType: 'board', set: 'Basic', isOfficial: true, hasMarkingScheme: true },

  // ── 2023 ──────────────────────────────────────────────────
  { id: 'b10-sci-2023', classLevel: 10, subject: 'Science', year: 2023, title: 'Class 10 Science Board Paper 2023', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'board', set: 'All India', isOfficial: true, hasMarkingScheme: true },
  { id: 'b10-math-std-2023', classLevel: 10, subject: 'Math', year: 2023, title: 'Class 10 Mathematics Standard Board Paper 2023', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'board', set: 'Standard', isOfficial: true },
  { id: 'b10-math-bas-2023', classLevel: 10, subject: 'Math', year: 2023, title: 'Class 10 Mathematics Basic Board Paper 2023', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'board', set: 'Basic', isOfficial: true },

  // ── 2022 ──────────────────────────────────────────────────
  { id: 'b10-sci-2022-t2', classLevel: 10, subject: 'Science', year: 2022, title: 'Class 10 Science Board Paper 2022 (Term 2)', duration: '2 Hours', totalMarks: 40, url: CBSE_QP_10, paperType: 'board', set: 'All India', isOfficial: true },
  { id: 'b10-math-2022-t2', classLevel: 10, subject: 'Math', year: 2022, title: 'Class 10 Mathematics Board Paper 2022 (Term 2)', duration: '2 Hours', totalMarks: 40, url: CBSE_QP_10, paperType: 'board', set: 'All India', isOfficial: true },
  { id: 'b10-sci-2022-t1', classLevel: 10, subject: 'Science', year: 2022, title: 'Class 10 Science Board Paper 2022 (Term 1 MCQ)', duration: '1.5 Hours', totalMarks: 40, url: CBSE_QP_10, paperType: 'board', set: 'All India', isOfficial: true },
  { id: 'b10-math-2022-t1', classLevel: 10, subject: 'Math', year: 2022, title: 'Class 10 Mathematics Board Paper 2022 (Term 1 MCQ)', duration: '1.5 Hours', totalMarks: 40, url: CBSE_QP_10, paperType: 'board', set: 'All India', isOfficial: true },

  // ── 2019 ──────────────────────────────────────────────────
  { id: 'b10-sci-2019-d', classLevel: 10, subject: 'Science', year: 2019, title: 'Class 10 Science Board Paper 2019 (Delhi Set 1)', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true, hasMarkingScheme: true },
  { id: 'b10-sci-2019-od', classLevel: 10, subject: 'Science', year: 2019, title: 'Class 10 Science Board Paper 2019 (Outside Delhi)', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'board', set: 'Outside Delhi', isOfficial: true },
  { id: 'b10-math-2019-d', classLevel: 10, subject: 'Math', year: 2019, title: 'Class 10 Mathematics Board Paper 2019 (Delhi)', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b10-math-2019-od', classLevel: 10, subject: 'Math', year: 2019, title: 'Class 10 Mathematics Board Paper 2019 (Outside Delhi)', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'board', set: 'Outside Delhi', isOfficial: true },

  // ── 2018 ──────────────────────────────────────────────────
  { id: 'b10-sci-2018', classLevel: 10, subject: 'Science', year: 2018, title: 'Class 10 Science Board Paper 2018 (Delhi)', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b10-math-2018', classLevel: 10, subject: 'Math', year: 2018, title: 'Class 10 Mathematics Board Paper 2018 (Delhi)', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2017 ──────────────────────────────────────────────────
  { id: 'b10-sci-2017', classLevel: 10, subject: 'Science', year: 2017, title: 'Class 10 Science Board Paper 2017 (Delhi)', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b10-math-2017', classLevel: 10, subject: 'Math', year: 2017, title: 'Class 10 Mathematics Board Paper 2017 (Delhi)', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2016 ──────────────────────────────────────────────────
  { id: 'b10-sci-2016', classLevel: 10, subject: 'Science', year: 2016, title: 'Class 10 Science Board Paper 2016 (Delhi)', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b10-math-2016', classLevel: 10, subject: 'Math', year: 2016, title: 'Class 10 Mathematics Board Paper 2016 (Delhi)', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2015 ──────────────────────────────────────────────────
  { id: 'b10-sci-2015', classLevel: 10, subject: 'Science', year: 2015, title: 'Class 10 Science Board Paper 2015 (Delhi)', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b10-math-2015', classLevel: 10, subject: 'Math', year: 2015, title: 'Class 10 Mathematics Board Paper 2015 (Delhi)', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2014 ──────────────────────────────────────────────────
  { id: 'b10-sci-2014', classLevel: 10, subject: 'Science', year: 2014, title: 'Class 10 Science Board Paper 2014 (Delhi)', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b10-math-2014', classLevel: 10, subject: 'Math', year: 2014, title: 'Class 10 Mathematics Board Paper 2014 (Delhi)', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2013 ──────────────────────────────────────────────────
  { id: 'b10-sci-2013', classLevel: 10, subject: 'Science', year: 2013, title: 'Class 10 Science Board Paper 2013 (Delhi)', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b10-math-2013', classLevel: 10, subject: 'Math', year: 2013, title: 'Class 10 Mathematics Board Paper 2013 (Delhi)', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2012 ──────────────────────────────────────────────────
  { id: 'b10-sci-2012', classLevel: 10, subject: 'Science', year: 2012, title: 'Class 10 Science Board Paper 2012', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b10-math-2012', classLevel: 10, subject: 'Math', year: 2012, title: 'Class 10 Mathematics Board Paper 2012', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2011 ──────────────────────────────────────────────────
  { id: 'b10-sci-2011', classLevel: 10, subject: 'Science', year: 2011, title: 'Class 10 Science Board Paper 2011', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b10-math-2011', classLevel: 10, subject: 'Math', year: 2011, title: 'Class 10 Mathematics Board Paper 2011', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2010 ──────────────────────────────────────────────────
  { id: 'b10-sci-2010', classLevel: 10, subject: 'Science', year: 2010, title: 'Class 10 Science Board Paper 2010', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b10-math-2010', classLevel: 10, subject: 'Math', year: 2010, title: 'Class 10 Mathematics Board Paper 2010', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },

  // ── 2009 ──────────────────────────────────────────────────
  { id: 'b10-sci-2009', classLevel: 10, subject: 'Science', year: 2009, title: 'Class 10 Science Board Paper 2009', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },
  { id: 'b10-math-2009', classLevel: 10, subject: 'Math', year: 2009, title: 'Class 10 Mathematics Board Paper 2009', duration: '3 Hours', totalMarks: 90, url: CBSE_QP_10, paperType: 'board', set: 'Delhi', isOfficial: true },
];

// ============================================================
// SAMPLE PAPERS (Official CBSE Academic)
// ============================================================

const samplePapers: PaperEntry[] = [
  // ── Class 12 Sample Papers ────────────────────────────────
  { id: 'sq12-phy-2025', classLevel: 12, subject: 'Physics', year: 2025, title: 'Class 12 Physics Sample Paper 2025-26', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2025-26'), paperType: 'sample', isOfficial: true },
  { id: 'sq12-chem-2025', classLevel: 12, subject: 'Chemistry', year: 2025, title: 'Class 12 Chemistry Sample Paper 2025-26', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2025-26'), paperType: 'sample', isOfficial: true },
  { id: 'sq12-bio-2025', classLevel: 12, subject: 'Biology', year: 2025, title: 'Class 12 Biology Sample Paper 2025-26', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2025-26'), paperType: 'sample', isOfficial: true },
  { id: 'sq12-math-2025', classLevel: 12, subject: 'Math', year: 2025, title: 'Class 12 Mathematics Sample Paper 2025-26', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_12('2025-26'), paperType: 'sample', isOfficial: true },
  { id: 'sq12-phy-2024', classLevel: 12, subject: 'Physics', year: 2024, title: 'Class 12 Physics Sample Paper 2024-25', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2024-25'), paperType: 'sample', isOfficial: true, hasMarkingScheme: true },
  { id: 'sq12-chem-2024', classLevel: 12, subject: 'Chemistry', year: 2024, title: 'Class 12 Chemistry Sample Paper 2024-25', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2024-25'), paperType: 'sample', isOfficial: true, hasMarkingScheme: true },
  { id: 'sq12-bio-2024', classLevel: 12, subject: 'Biology', year: 2024, title: 'Class 12 Biology Sample Paper 2024-25', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2024-25'), paperType: 'sample', isOfficial: true, hasMarkingScheme: true },
  { id: 'sq12-math-2024', classLevel: 12, subject: 'Math', year: 2024, title: 'Class 12 Mathematics Sample Paper 2024-25', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_12('2024-25'), paperType: 'sample', isOfficial: true, hasMarkingScheme: true },
  { id: 'sq12-phy-2023', classLevel: 12, subject: 'Physics', year: 2023, title: 'Class 12 Physics Sample Paper 2023-24', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2023-24'), paperType: 'sample', isOfficial: true, hasMarkingScheme: true },
  { id: 'sq12-chem-2023', classLevel: 12, subject: 'Chemistry', year: 2023, title: 'Class 12 Chemistry Sample Paper 2023-24', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2023-24'), paperType: 'sample', isOfficial: true, hasMarkingScheme: true },
  { id: 'sq12-bio-2023', classLevel: 12, subject: 'Biology', year: 2023, title: 'Class 12 Biology Sample Paper 2023-24', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2023-24'), paperType: 'sample', isOfficial: true, hasMarkingScheme: true },
  { id: 'sq12-math-2023', classLevel: 12, subject: 'Math', year: 2023, title: 'Class 12 Mathematics Sample Paper 2023-24', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_12('2023-24'), paperType: 'sample', isOfficial: true, hasMarkingScheme: true },
  { id: 'sq12-phy-2022', classLevel: 12, subject: 'Physics', year: 2022, title: 'Class 12 Physics Sample Paper 2022-23', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2022-23'), paperType: 'sample', isOfficial: true },
  { id: 'sq12-chem-2022', classLevel: 12, subject: 'Chemistry', year: 2022, title: 'Class 12 Chemistry Sample Paper 2022-23', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2022-23'), paperType: 'sample', isOfficial: true },
  { id: 'sq12-bio-2022', classLevel: 12, subject: 'Biology', year: 2022, title: 'Class 12 Biology Sample Paper 2022-23', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2022-23'), paperType: 'sample', isOfficial: true },
  { id: 'sq12-math-2022', classLevel: 12, subject: 'Math', year: 2022, title: 'Class 12 Mathematics Sample Paper 2022-23', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_12('2022-23'), paperType: 'sample', isOfficial: true },
  { id: 'sq12-all-2021', classLevel: 12, subject: 'All Subjects', year: 2021, title: 'Class 12 All Subjects Sample Papers 2021-22', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2021-22'), paperType: 'sample', isOfficial: true },
  { id: 'sq12-all-2020', classLevel: 12, subject: 'All Subjects', year: 2020, title: 'Class 12 All Subjects Sample Papers 2020-21', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2020-21'), paperType: 'sample', isOfficial: true },
  { id: 'sq12-all-2019', classLevel: 12, subject: 'All Subjects', year: 2019, title: 'Class 12 All Subjects Sample Papers 2019-20', duration: '3 Hours', totalMarks: 70, url: CBSE_SQP_12('2019-20'), paperType: 'sample', isOfficial: true },

  // ── Class 10 Sample Papers ────────────────────────────────
  { id: 'sq10-sci-2025', classLevel: 10, subject: 'Science', year: 2025, title: 'Class 10 Science Sample Paper 2025-26', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_10('2025-26'), paperType: 'sample', isOfficial: true },
  { id: 'sq10-math-2025', classLevel: 10, subject: 'Math', year: 2025, title: 'Class 10 Mathematics Sample Paper 2025-26', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_10('2025-26'), paperType: 'sample', isOfficial: true },
  { id: 'sq10-sci-2024', classLevel: 10, subject: 'Science', year: 2024, title: 'Class 10 Science Sample Paper 2024-25', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_10('2024-25'), paperType: 'sample', isOfficial: true, hasMarkingScheme: true },
  { id: 'sq10-math-2024', classLevel: 10, subject: 'Math', year: 2024, title: 'Class 10 Mathematics Sample Paper 2024-25', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_10('2024-25'), paperType: 'sample', isOfficial: true, hasMarkingScheme: true },
  { id: 'sq10-sci-2023', classLevel: 10, subject: 'Science', year: 2023, title: 'Class 10 Science Sample Paper 2023-24', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_10('2023-24'), paperType: 'sample', isOfficial: true, hasMarkingScheme: true },
  { id: 'sq10-math-2023', classLevel: 10, subject: 'Math', year: 2023, title: 'Class 10 Mathematics Sample Paper 2023-24', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_10('2023-24'), paperType: 'sample', isOfficial: true, hasMarkingScheme: true },
  { id: 'sq10-sci-2022', classLevel: 10, subject: 'Science', year: 2022, title: 'Class 10 Science Sample Paper 2022-23', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_10('2022-23'), paperType: 'sample', isOfficial: true },
  { id: 'sq10-math-2022', classLevel: 10, subject: 'Math', year: 2022, title: 'Class 10 Mathematics Sample Paper 2022-23', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_10('2022-23'), paperType: 'sample', isOfficial: true },
  { id: 'sq10-sci-2021', classLevel: 10, subject: 'Science', year: 2021, title: 'Class 10 Science Sample Paper 2021-22', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_10('2021-22'), paperType: 'sample', isOfficial: true },
  { id: 'sq10-sci-2020', classLevel: 10, subject: 'Science', year: 2020, title: 'Class 10 Science Sample Paper 2020-21', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_10('2020-21'), paperType: 'sample', isOfficial: true },
  { id: 'sq10-sci-2019', classLevel: 10, subject: 'Science', year: 2019, title: 'Class 10 Science Sample Paper 2019-20', duration: '3 Hours', totalMarks: 80, url: CBSE_SQP_10('2019-20'), paperType: 'sample', isOfficial: true },
];

// ============================================================
// COMPARTMENT PAPERS
// ============================================================

const compartmentPapers: PaperEntry[] = [
  // ── Class 12 Compartment ──────────────────────────────────
  { id: 'comp12-phy-2025', classLevel: 12, subject: 'Physics', year: 2025, title: 'Class 12 Physics Compartment Paper 2025', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-chem-2025', classLevel: 12, subject: 'Chemistry', year: 2025, title: 'Class 12 Chemistry Compartment Paper 2025', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-bio-2025', classLevel: 12, subject: 'Biology', year: 2025, title: 'Class 12 Biology Compartment Paper 2025', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-math-2025', classLevel: 12, subject: 'Math', year: 2025, title: 'Class 12 Mathematics Compartment Paper 2025', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-phy-2024', classLevel: 12, subject: 'Physics', year: 2024, title: 'Class 12 Physics Compartment Paper 2024', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-chem-2024', classLevel: 12, subject: 'Chemistry', year: 2024, title: 'Class 12 Chemistry Compartment Paper 2024', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-bio-2024', classLevel: 12, subject: 'Biology', year: 2024, title: 'Class 12 Biology Compartment Paper 2024', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-math-2024', classLevel: 12, subject: 'Math', year: 2024, title: 'Class 12 Mathematics Compartment Paper 2024', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-phy-2023', classLevel: 12, subject: 'Physics', year: 2023, title: 'Class 12 Physics Compartment Paper 2023', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-chem-2023', classLevel: 12, subject: 'Chemistry', year: 2023, title: 'Class 12 Chemistry Compartment Paper 2023', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-bio-2023', classLevel: 12, subject: 'Biology', year: 2023, title: 'Class 12 Biology Compartment Paper 2023', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-math-2023', classLevel: 12, subject: 'Math', year: 2023, title: 'Class 12 Mathematics Compartment Paper 2023', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-phy-2022', classLevel: 12, subject: 'Physics', year: 2022, title: 'Class 12 Physics Compartment Paper 2022', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-chem-2022', classLevel: 12, subject: 'Chemistry', year: 2022, title: 'Class 12 Chemistry Compartment Paper 2022', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-bio-2022', classLevel: 12, subject: 'Biology', year: 2022, title: 'Class 12 Biology Compartment Paper 2022', duration: '3 Hours', totalMarks: 70, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },
  { id: 'comp12-math-2022', classLevel: 12, subject: 'Math', year: 2022, title: 'Class 12 Mathematics Compartment Paper 2022', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_12, paperType: 'compartment', isOfficial: true },

  // ── Class 10 Compartment ──────────────────────────────────
  { id: 'comp10-sci-2025', classLevel: 10, subject: 'Science', year: 2025, title: 'Class 10 Science Compartment Paper 2025', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'compartment', isOfficial: true },
  { id: 'comp10-math-2025', classLevel: 10, subject: 'Math', year: 2025, title: 'Class 10 Mathematics Compartment Paper 2025', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'compartment', isOfficial: true },
  { id: 'comp10-sci-2024', classLevel: 10, subject: 'Science', year: 2024, title: 'Class 10 Science Compartment Paper 2024', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'compartment', isOfficial: true },
  { id: 'comp10-math-2024', classLevel: 10, subject: 'Math', year: 2024, title: 'Class 10 Mathematics Compartment Paper 2024', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'compartment', isOfficial: true },
  { id: 'comp10-sci-2023', classLevel: 10, subject: 'Science', year: 2023, title: 'Class 10 Science Compartment Paper 2023', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'compartment', isOfficial: true },
  { id: 'comp10-math-2023', classLevel: 10, subject: 'Math', year: 2023, title: 'Class 10 Mathematics Compartment Paper 2023', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'compartment', isOfficial: true },
  { id: 'comp10-sci-2022', classLevel: 10, subject: 'Science', year: 2022, title: 'Class 10 Science Compartment Paper 2022', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'compartment', isOfficial: true },
  { id: 'comp10-math-2022', classLevel: 10, subject: 'Math', year: 2022, title: 'Class 10 Mathematics Compartment Paper 2022', duration: '3 Hours', totalMarks: 80, url: CBSE_QP_10, paperType: 'compartment', isOfficial: true },
];

// ============================================================
// ENGLISH ROLLOUT PAPERS (Class 10 + Class 12)
// ============================================================

const englishBoardYears = [2025, 2024, 2023, 2022, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009];
const englishSampleYears = [2025, 2024, 2023, 2022, 2021, 2020, 2019];
const englishCompartmentYears = [2025, 2024, 2023, 2022];
const commerceBoardYears = [2025, 2024, 2023, 2022, 2019, 2018, 2017, 2016, 2015, 2014, 2013];
const commerceSampleYears = [2025, 2024, 2023, 2022, 2021, 2020, 2019];
const commerceCompartmentYears = [2025, 2024, 2023, 2022];

const englishBoardPapers: PaperEntry[] = [
  ...englishBoardYears.map((year) => ({
    id: `b10-eng-${year}`,
    classLevel: 10 as const,
    subject: 'English Core',
    year,
    title: `Class 10 English Board Paper ${year}`,
    duration: '3 Hours',
    totalMarks: 80,
    url: CBSE_QP_10,
    paperType: 'board' as const,
    set: 'All India' as const,
    isOfficial: true,
  })),
  ...englishBoardYears.map((year) => ({
    id: `b12-eng-${year}`,
    classLevel: 12 as const,
    subject: 'English Core',
    year,
    title: `Class 12 English Core Board Paper ${year}`,
    duration: '3 Hours',
    totalMarks: 80,
    url: CBSE_QP_12,
    paperType: 'board' as const,
    set: 'All India' as const,
    isOfficial: true,
  })),
];

const englishSamplePapers: PaperEntry[] = [
  ...englishSampleYears.map((year) => ({
    id: `sq10-eng-${year}`,
    classLevel: 10 as const,
    subject: 'English Core',
    year,
    title: `Class 10 English Sample Paper ${year}-${String(year + 1).slice(2)}`,
    duration: '3 Hours',
    totalMarks: 80,
    url: CBSE_SQP_10(`${year}-${String(year + 1).slice(2)}`),
    paperType: 'sample' as const,
    isOfficial: true,
  })),
  ...englishSampleYears.map((year) => ({
    id: `sq12-eng-${year}`,
    classLevel: 12 as const,
    subject: 'English Core',
    year,
    title: `Class 12 English Core Sample Paper ${year}-${String(year + 1).slice(2)}`,
    duration: '3 Hours',
    totalMarks: 80,
    url: CBSE_SQP_12(`${year}-${String(year + 1).slice(2)}`),
    paperType: 'sample' as const,
    isOfficial: true,
  })),
];

const englishCompartmentPapers: PaperEntry[] = [
  ...englishCompartmentYears.map((year) => ({
    id: `comp10-eng-${year}`,
    classLevel: 10 as const,
    subject: 'English Core',
    year,
    title: `Class 10 English Compartment Paper ${year}`,
    duration: '3 Hours',
    totalMarks: 80,
    url: CBSE_QP_10,
    paperType: 'compartment' as const,
    isOfficial: true,
  })),
  ...englishCompartmentYears.map((year) => ({
    id: `comp12-eng-${year}`,
    classLevel: 12 as const,
    subject: 'English Core',
    year,
    title: `Class 12 English Core Compartment Paper ${year}`,
    duration: '3 Hours',
    totalMarks: 80,
    url: CBSE_QP_12,
    paperType: 'compartment' as const,
    isOfficial: true,
  })),
];

const commerceBoardPapers: PaperEntry[] = [
  ...commerceBoardYears.flatMap((year) => ([
    {
      id: `b12-acc-${year}`,
      classLevel: 12 as const,
      subject: 'Accountancy',
      year,
      title: `Class 12 Accountancy Board Paper ${year}`,
      duration: '3 Hours',
      totalMarks: 80,
      url: CBSE_QP_12,
      paperType: 'board' as const,
      set: 'All India' as const,
      isOfficial: true,
    },
    {
      id: `b12-bst-${year}`,
      classLevel: 12 as const,
      subject: 'Business Studies',
      year,
      title: `Class 12 Business Studies Board Paper ${year}`,
      duration: '3 Hours',
      totalMarks: 80,
      url: CBSE_QP_12,
      paperType: 'board' as const,
      set: 'All India' as const,
      isOfficial: true,
    },
    {
      id: `b12-eco-${year}`,
      classLevel: 12 as const,
      subject: 'Economics',
      year,
      title: `Class 12 Economics Board Paper ${year}`,
      duration: '3 Hours',
      totalMarks: 80,
      url: CBSE_QP_12,
      paperType: 'board' as const,
      set: 'All India' as const,
      isOfficial: true,
    },
  ])),
];

const commerceSamplePapers: PaperEntry[] = [
  ...commerceSampleYears.flatMap((year) => ([
    {
      id: `sq12-acc-${year}`,
      classLevel: 12 as const,
      subject: 'Accountancy',
      year,
      title: `Class 12 Accountancy Sample Paper ${year}-${String(year + 1).slice(2)}`,
      duration: '3 Hours',
      totalMarks: 80,
      url: CBSE_SQP_12(`${year}-${String(year + 1).slice(2)}`),
      paperType: 'sample' as const,
      isOfficial: true,
    },
    {
      id: `sq12-bst-${year}`,
      classLevel: 12 as const,
      subject: 'Business Studies',
      year,
      title: `Class 12 Business Studies Sample Paper ${year}-${String(year + 1).slice(2)}`,
      duration: '3 Hours',
      totalMarks: 80,
      url: CBSE_SQP_12(`${year}-${String(year + 1).slice(2)}`),
      paperType: 'sample' as const,
      isOfficial: true,
    },
    {
      id: `sq12-eco-${year}`,
      classLevel: 12 as const,
      subject: 'Economics',
      year,
      title: `Class 12 Economics Sample Paper ${year}-${String(year + 1).slice(2)}`,
      duration: '3 Hours',
      totalMarks: 80,
      url: CBSE_SQP_12(`${year}-${String(year + 1).slice(2)}`),
      paperType: 'sample' as const,
      isOfficial: true,
    },
  ])),
];

const commerceCompartmentPapers: PaperEntry[] = [
  ...commerceCompartmentYears.flatMap((year) => ([
    {
      id: `comp12-acc-${year}`,
      classLevel: 12 as const,
      subject: 'Accountancy',
      year,
      title: `Class 12 Accountancy Compartment Paper ${year}`,
      duration: '3 Hours',
      totalMarks: 80,
      url: CBSE_QP_12,
      paperType: 'compartment' as const,
      isOfficial: true,
    },
    {
      id: `comp12-bst-${year}`,
      classLevel: 12 as const,
      subject: 'Business Studies',
      year,
      title: `Class 12 Business Studies Compartment Paper ${year}`,
      duration: '3 Hours',
      totalMarks: 80,
      url: CBSE_QP_12,
      paperType: 'compartment' as const,
      isOfficial: true,
    },
    {
      id: `comp12-eco-${year}`,
      classLevel: 12 as const,
      subject: 'Economics',
      year,
      title: `Class 12 Economics Compartment Paper ${year}`,
      duration: '3 Hours',
      totalMarks: 80,
      url: CBSE_QP_12,
      paperType: 'compartment' as const,
      isOfficial: true,
    },
  ])),
];

// ============================================================
// MARKING SCHEMES & RESOURCES
// ============================================================

const resources: PaperEntry[] = [
  { id: 'ms-all-2025', classLevel: 'all', subject: 'Marking Scheme', year: 2025, title: 'CBSE Marking Schemes 2025 - All Classes', duration: '-', totalMarks: 0, url: CBSE_MS, paperType: 'board', isOfficial: true },
  { id: 'ms-all-2024', classLevel: 'all', subject: 'Marking Scheme', year: 2024, title: 'CBSE Marking Schemes 2024 - All Classes', duration: '-', totalMarks: 0, url: CBSE_MS, paperType: 'board', isOfficial: true },
  { id: 'ms-all-2023', classLevel: 'all', subject: 'Marking Scheme', year: 2023, title: 'CBSE Marking Schemes 2023 - All Classes', duration: '-', totalMarks: 0, url: CBSE_MS, paperType: 'board', isOfficial: true },
];

function buildDiscoveredHfPapers(): PaperEntry[] {
  const hfIndex = HF_PAPER_INDEX as Record<string, string>;
  const out: PaperEntry[] = [];
  for (const [key, relativePath] of Object.entries(hfIndex)) {
    const [paperTypeRaw, yearRaw, classRaw, subjectRaw = 'Unknown Subject', variantRaw = 'default'] = key.split('|');
    const classLevel = parseClassLevel(classRaw);
    const year = Number(yearRaw);
    if (!classLevel || !Number.isFinite(year) || !relativePath) continue;
    const paperType = parseHfPaperType(paperTypeRaw);
    const subject = subjectRaw.trim() || 'Unknown Subject';
    const variant = variantRaw.trim() || 'default';
    const set = inferSetFromVariant(variant);

    out.push({
      id: `hf-${paperType}-${classLevel}-${slugifyId(subject)}-${year}-${slugifyId(variant)}`,
      classLevel,
      subject,
      year,
      title: `Class ${classLevel} ${subject} ${paperType[0].toUpperCase()}${paperType.slice(1)} Paper ${year}`,
      duration: '3 Hours',
      totalMarks: estimateTotalMarks(classLevel, subject),
      url: hf(relativePath),
      paperType,
      set,
      isOfficial: false,
      isFromHF: true,
    });
  }
  return out;
}

function slugifyId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function paperFingerprint(paper: PaperEntry): string {
  const normalizedSubject = paper.subject.trim().toLowerCase();
  const variant = paper.subject === 'Math' && paper.classLevel === 10 ? getMathVariant(paper) : 'default';
  return [paper.paperType, String(paper.classLevel), normalizedSubject, String(paper.year), variant].join('|');
}

// ============================================================
// COMBINED EXPORT
// ============================================================

const manualPapers: PaperEntry[] = [
  ...boardPapers12,
  ...boardPapers10,
  ...englishBoardPapers,
  ...commerceBoardPapers,
  ...samplePapers,
  ...englishSamplePapers,
  ...commerceSamplePapers,
  ...compartmentPapers,
  ...englishCompartmentPapers,
  ...commerceCompartmentPapers,
  ...resources,
];

const manualFingerprints = new Set(
  manualPapers
    .filter((paper) => paper.classLevel === 10 || paper.classLevel === 12)
    .map((paper) => paperFingerprint(paper))
);

const discoveredHfPapers = buildDiscoveredHfPapers().filter((paper) => {
  const fp = paperFingerprint(paper);
  if (manualFingerprints.has(fp)) return false;
  manualFingerprints.add(fp);
  return true;
});

export const ALL_PAPERS: PaperEntry[] = [
  ...manualPapers,
  ...discoveredHfPapers,
];

/** Years covered across all papers */
export const PAPER_YEARS = Array.from(new Set(ALL_PAPERS.map((p) => p.year))).sort((a, b) => b - a);

/** Get papers filtered by class, subject, type, year */
export function filterPapers(opts: {
  classLevel?: 10 | 12 | 'all';
  subject?: string;
  paperType?: PaperType | 'all';
  year?: number | 'all';
}): PaperEntry[] {
  return ALL_PAPERS
    .filter((p) => {
      if (opts.classLevel !== undefined && opts.classLevel !== 'all' && p.classLevel !== opts.classLevel) return false;
      if (opts.subject && opts.subject !== 'All' && p.subject !== opts.subject) return false;
      if (opts.paperType && opts.paperType !== 'all' && p.paperType !== opts.paperType) return false;
      if (opts.year && opts.year !== 'all' && p.year !== opts.year) return false;
      return true;
    })
    .map((paper) => {
      const resolved = resolvePaperUrl(paper);
      return {
        ...paper,
        url: resolved.url,
        isFromHF: resolved.isFromHF,
      };
    });
}

/** Stats: total papers by type */
export function getPaperStats() {
  return {
    total: ALL_PAPERS.length,
    board: ALL_PAPERS.filter((p) => p.paperType === 'board').length,
    sample: ALL_PAPERS.filter((p) => p.paperType === 'sample').length,
    compartment: ALL_PAPERS.filter((p) => p.paperType === 'compartment').length,
    yearsSpanned: PAPER_YEARS.length,
    withMarkingScheme: ALL_PAPERS.filter((p) => p.hasMarkingScheme).length,
  };
}
