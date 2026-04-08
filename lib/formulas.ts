import { ALL_CHAPTERS, type Chapter } from '@/lib/data';

export interface FormulaEntry {
  id: string;
  name: string;
  latex: string;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  classLevel: 10 | 11 | 12;
  subject: string;
  marksWeight: number;
  appearsInJee: boolean;
  siUnitHint: string;
}

const UNIT_HINTS: Array<{ matcher: RegExp; unit: string }> = [
  { matcher: /force|newton|f=|gravitation|coulomb/i, unit: 'N (newton)' },
  { matcher: /energy|work|enthalpy|gibbs/i, unit: 'J (joule)' },
  { matcher: /power|watt|p=/i, unit: 'W (watt)' },
  { matcher: /current|ampere|i=/i, unit: 'A (ampere)' },
  { matcher: /potential|voltage|emf|e=/i, unit: 'V (volt)' },
  { matcher: /pressure|osmotic|p=/i, unit: 'Pa (pascal)' },
  { matcher: /molar|concentration|mole|n=/i, unit: 'mol or mol/L' },
  { matcher: /resistance|ohm|r=/i, unit: 'ohm (Ω)' },
  { matcher: /frequency|wave number|nu/i, unit: 'Hz (s^-1)' },
];

function inferSiUnitHint(chapter: Chapter, formulaName: string, latex: string): string {
  const source = `${chapter.subject} ${chapter.title} ${formulaName} ${latex}`;
  const hit = UNIT_HINTS.find((item) => item.matcher.test(source));
  return hit?.unit ?? 'Depends on variables; write final SI unit explicitly in answers.';
}

export function getAllFormulaEntries(): FormulaEntry[] {
  const entries: FormulaEntry[] = [];
  for (const chapter of ALL_CHAPTERS) {
    if (!chapter.formulas || chapter.formulas.length === 0) continue;
    for (const formula of chapter.formulas) {
      entries.push({
        id: `${chapter.id}:${formula.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: formula.name,
        latex: formula.latex,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterNumber: chapter.chapterNumber,
        classLevel: chapter.classLevel,
        subject: chapter.subject,
        marksWeight: chapter.marks,
        appearsInJee: (chapter.examRelevance ?? []).includes('JEE'),
        siUnitHint: inferSiUnitHint(chapter, formula.name, formula.latex),
      });
    }
  }
  return entries.sort((a, b) => {
    if (a.classLevel !== b.classLevel) return a.classLevel - b.classLevel;
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
    return a.name.localeCompare(b.name);
  });
}
