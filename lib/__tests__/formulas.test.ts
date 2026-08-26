import { describe, expect, it } from 'vitest';
import { getAllFormulaEntries, getFormulaEntriesForChapter } from '@/lib/formulas';

describe('formula handbook coverage', () => {
  it('keeps corrected handbook formulas mapped to the right chapters', () => {
    expect(getFormulaEntriesForChapter('c12-phy-7').some((entry) => entry.name === 'AC RMS Current')).toBe(true);
    expect(getFormulaEntriesForChapter('c12-chem-3').some((entry) => entry.name === 'Nernst Equation')).toBe(true);
    expect(getFormulaEntriesForChapter('c10-phy-3').some((entry) => entry.name === 'Electrical Power')).toBe(true);
  });

  it('keeps broad formula coverage for the public formula pages', () => {
    const visibleEntries = getAllFormulaEntries().filter((entry) => entry.classLevel !== 11);
    expect(visibleEntries.length).toBeGreaterThan(80);
    expect(new Set(visibleEntries.map((entry) => entry.chapterId)).size).toBeGreaterThan(20);
  });

  it('builds traceability and study support for merged formula cards', () => {
    const acRms = getFormulaEntriesForChapter('c12-phy-7').find((entry) => entry.name === 'AC RMS Current');
    expect(acRms?.sourceLocator).toContain('Class 12');
    expect(acRms?.sourceLocator).not.toContain('â€¢');
    expect(acRms?.sourceDetail.length).toBeGreaterThan(20);
    expect(acRms?.sourcePageHint?.length).toBeGreaterThan(20);
    expect(acRms?.usageNote.length).toBeGreaterThan(20);
    expect(acRms?.pitfallNote.length).toBeGreaterThan(20);
    expect((acRms?.variableGuide.length ?? 0)).toBeGreaterThan(0);
  });

  it('does not confuse accounting ratios with electric current units', () => {
    const currentRatio = getFormulaEntriesForChapter('c12-acc-4').find((entry) => entry.name === 'Current Ratio');
    const debtEquity = getFormulaEntriesForChapter('c12-acc-4').find((entry) => entry.name === 'Debt-Equity Ratio');
    expect(currentRatio?.siUnitHint).toBe('Dimensionless (ratio or index)');
    expect(debtEquity?.siUnitHint).toBe('Dimensionless (ratio or index)');
  });
});
