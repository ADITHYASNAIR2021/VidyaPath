import { ALL_CHAPTERS, type Chapter } from '@/lib/data';
import { EXTERNAL_FORMULA_ENTRIES } from '@/lib/formula-handbook';

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
  sourceName?: string;
  sourceUrl?: string;
}

const UNIT_HINTS: Array<{ matcher: RegExp; unit: string }> = [
  { matcher: /force|newton|f=|gravitation|coulomb/i, unit: 'N (newton)' },
  { matcher: /energy|work|enthalpy|gibbs/i, unit: 'J (joule)' },
  { matcher: /power|watt|p=/i, unit: 'W (watt)' },
  { matcher: /current|ampere|i=/i, unit: 'A (ampere)' },
  { matcher: /potential|voltage|emf|e=/i, unit: 'V (volt)' },
  { matcher: /pressure|osmotic|p=/i, unit: 'Pa (pascal)' },
  { matcher: /molar|concentration|mole|n=/i, unit: 'mol or mol/L' },
  { matcher: /resistance|ohm|r=/i, unit: 'ohm (Ohm)' },
  { matcher: /frequency|wave number|nu/i, unit: 'Hz (s^-1)' },
];

function inferSiUnitHint(chapter: Chapter, formulaName: string, latex: string): string {
  const source = `${chapter.subject} ${chapter.title} ${formulaName} ${latex}`;
  const hit = UNIT_HINTS.find((item) => item.matcher.test(source));
  return hit?.unit ?? 'Depends on variables; write final SI unit explicitly in answers.';
}

export function getAllFormulaEntries(): FormulaEntry[] {
  const entries: FormulaEntry[] = [];
  const seen = new Set<string>();

  for (const chapter of ALL_CHAPTERS) {
    if (!chapter.formulas || chapter.formulas.length === 0) continue;
    for (const formula of chapter.formulas) {
      const key = `${chapter.id}:${formula.name.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);

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
        sourceName: 'NCERT chapter mapping',
      });
    }
  }

  for (const item of EXTERNAL_FORMULA_ENTRIES) {
    const chapter = ALL_CHAPTERS.find((entry) => entry.id === item.chapterId);
    if (!chapter) continue;

    const key = `${chapter.id}:${item.name.toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({
      id: `${chapter.id}:${item.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: item.name,
      latex: item.latex,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterNumber: chapter.chapterNumber,
      classLevel: chapter.classLevel,
      subject: chapter.subject,
      marksWeight: chapter.marks,
      appearsInJee: (chapter.examRelevance ?? []).includes('JEE'),
      siUnitHint: inferSiUnitHint(chapter, item.name, item.latex),
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
    });
  }

  return entries.sort((a, b) => {
    if (a.classLevel !== b.classLevel) return a.classLevel - b.classLevel;
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
    return a.name.localeCompare(b.name);
  });
}
