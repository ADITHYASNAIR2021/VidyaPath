import { ALL_CHAPTERS, type Chapter } from '@/lib/data';
import { EXTERNAL_FORMULA_ENTRIES, FORMULA_SOURCE_DOCS } from '@/lib/formula-handbook';

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
  sourceLocator: string;
  sourceDetail: string;
  sourcePageHint?: string;
  usageNote: string;
  pitfallNote: string;
  variableGuide: string[];
  sourceName?: string;
  sourceUrl?: string;
}

let cachedFormulaEntries: FormulaEntry[] | null = null;
const SOURCE_DOC_BY_NAME = new Map(FORMULA_SOURCE_DOCS.map((doc) => [doc.sourceName, doc]));

const UNIT_HINTS: Array<{ matcher: RegExp; unit: string }> = [
  { matcher: /current ratio|quick ratio|debt[- ]equity ratio|return on capital employed|probability|multiplier|\bmpc\b|\bmps\b|pH|pOH|van'?t hoff factor/i, unit: 'Dimensionless (ratio or index)' },
  { matcher: /break-even point.*units/i, unit: 'units (count)' },
  { matcher: /break-even sales value|cash flow|gross domestic product|\bgdp\b|fiscal deficit|balance of trade/i, unit: 'Currency (use the unit stated in the question)' },
  { matcher: /power of lens/i, unit: 'D (dioptre)' },
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
  // Match the formula itself, not the chapter title. A chapter such as "Current
  // Electricity" must not turn every formula into amperes, and "Current Ratio"
  // is an accounting ratio rather than electric current.
  const source = `${formulaName} ${latex}`;
  const hit = UNIT_HINTS.find((item) => item.matcher.test(source));
  return hit?.unit ?? 'Depends on variables; write final SI unit explicitly in answers.';
}

type FormulaStudyHint = {
  matcher: RegExp;
  usageNote: string;
  pitfallNote: string;
  variableGuide: string[];
};

const FORMULA_STUDY_HINTS: FormulaStudyHint[] = [
  {
    matcher: /mirror formula/i,
    usageNote: 'Use when object distance, image distance, and focal length are related for spherical mirrors.',
    pitfallNote: 'Follow the NCERT sign convention consistently for u, v, and f.',
    variableGuide: ['u = object distance', 'v = image distance', 'f = focal length'],
  },
  {
    matcher: /lens formula/i,
    usageNote: 'Use for thin-lens image formation when object distance, image distance, and focal length are known.',
    pitfallNote: 'Do not mix lens sign convention with mirror convention while substituting values.',
    variableGuide: ['u = object distance', 'v = image distance', 'f = focal length'],
  },
  {
    matcher: /magnification/i,
    usageNote: 'Use to compare image size with object size after solving the basic image-formation relation.',
    pitfallNote: 'Keep the sign of magnification meaningful while interpreting upright or inverted images.',
    variableGuide: ['m = magnification', 'h_i = image height', 'h_o = object height'],
  },
  {
    matcher: /power of lens/i,
    usageNote: 'Use when the focal length is expressed in metres and you need optical power directly.',
    pitfallNote: 'Convert focal length to metres before taking the reciprocal.',
    variableGuide: ['P = power of lens', 'f = focal length in metres'],
  },
  {
    matcher: /ohm'?s law/i,
    usageNote: 'Use for linear current-voltage relations in conductors at constant temperature.',
    pitfallNote: 'This does not apply once resistance changes significantly with temperature.',
    variableGuide: ['V = potential difference', 'I = current', 'R = resistance'],
  },
  {
    matcher: /electrical power/i,
    usageNote: 'Use to relate current, voltage, and resistance while solving domestic electricity or circuit questions.',
    pitfallNote: 'Choose the form that matches the given values instead of converting unnecessarily.',
    variableGuide: ['P = power', 'V = potential difference', 'I = current', 'R = resistance'],
  },
  {
    matcher: /resistivity relation/i,
    usageNote: 'Use when resistance depends on material, length, and area of cross section.',
    pitfallNote: 'Area must be in square metres when using SI values.',
    variableGuide: ['R = resistance', 'rho = resistivity', 'l = length', 'A = area'],
  },
  {
    matcher: /coulomb'?s law/i,
    usageNote: 'Use for electrostatic force between two point charges separated by a distance.',
    pitfallNote: 'Distance is squared, and the force direction depends on whether charges are like or unlike.',
    variableGuide: ['F = electrostatic force', 'q1, q2 = charges', 'r = separation'],
  },
  {
    matcher: /electric field due to point charge/i,
    usageNote: 'Use to find the electric field strength created by one isolated point charge.',
    pitfallNote: 'Treat the field as a vector even when only magnitude is asked.',
    variableGuide: ['E = electric field', 'q = source charge', 'r = distance from charge'],
  },
  {
    matcher: /gauss'?s law|electric flux/i,
    usageNote: 'Use when field lines through a closed surface are being related to enclosed charge.',
    pitfallNote: 'Only the enclosed charge contributes to the net flux through the closed surface.',
    variableGuide: ['Phi = electric flux', 'E = electric field', 'A = area vector'],
  },
  {
    matcher: /capacitance|parallel plate capacitance|energy stored in capacitor/i,
    usageNote: 'Use in capacitor, dielectric, and electrostatic energy questions.',
    pitfallNote: 'Check whether the capacitor is isolated or connected to a battery before applying changes.',
    variableGuide: ['C = capacitance', 'Q = charge', 'V = potential difference'],
  },
  {
    matcher: /magnetic force on a charge|magnetic force on a conductor/i,
    usageNote: 'Use when motion or current is perpendicular or oblique to a magnetic field.',
    pitfallNote: 'The sine term matters; force becomes zero in the parallel case.',
    variableGuide: ['F = magnetic force', 'B = magnetic field', 'theta = angle with field'],
  },
  {
    matcher: /magnetic field around|solenoid/i,
    usageNote: 'Use for field strength due to long conductors, loops, or solenoids in magnetism chapters.',
    pitfallNote: 'Match the geometry carefully before choosing the straight-wire or solenoid form.',
    variableGuide: ['B = magnetic field', 'I = current', 'r or n = geometry term'],
  },
  {
    matcher: /faraday'?s law|self-inductance|energy in inductor/i,
    usageNote: 'Use for electromagnetic induction, induced emf, and inductive energy storage.',
    pitfallNote: 'Keep the negative sign in Faraday law for direction, even if only magnitude is later used.',
    variableGuide: ['E = induced emf', 'Phi = magnetic flux', 'L = inductance'],
  },
  {
    matcher: /rms|reactance|impedance|average ac power|transformer ratio/i,
    usageNote: 'Use in alternating current and transformer problems where peak and rms quantities must be separated.',
    pitfallNote: 'Do not mix peak values with rms values in the same power or impedance step.',
    variableGuide: ['I_rms or V_rms = rms quantity', 'I_0 or V_0 = peak quantity', 'omega = angular frequency'],
  },
  {
    matcher: /fringe width|brewster|malus/i,
    usageNote: 'Use for wave-optics and polarization questions after identifying the correct optical setup.',
    pitfallNote: 'Check whether the question is about interference spacing, polarization angle, or reflected light.',
    variableGuide: ['beta = fringe width', 'lambda = wavelength', 'D or d = apparatus distances'],
  },
  {
    matcher: /de broglie|photoelectric|bohr|rydberg|half-life|radioactive|mass-energy/i,
    usageNote: 'Use for modern-physics problems where microscopic quantities or decay relations are central.',
    pitfallNote: 'Keep constants and units consistent, especially electron-volts versus joules.',
    variableGuide: ['lambda = wavelength or decay constant context', 'n = energy level or electron count context'],
  },
  {
    matcher: /pH|pOH|ionic product/i,
    usageNote: 'Use in acid-base calculations after identifying whether the question provides concentration or logarithmic form.',
    pitfallNote: 'The logarithm is base 10 here, and concentrations must stay positive.',
    variableGuide: ['[H+] = hydrogen ion concentration', '[OH-] = hydroxide ion concentration'],
  },
  {
    matcher: /molarity|molality|henry|osmotic|raoult|van'?t hoff|boiling point|freezing point/i,
    usageNote: 'Use in solution and colligative-property questions after checking which concentration unit the chapter expects.',
    pitfallNote: 'Temperature goes in kelvin, and molarity and molality are not interchangeable.',
    variableGuide: ['M = molarity', 'm = molality', 'i = van t Hoff factor'],
  },
  {
    matcher: /nernst|cell potential|gibbs energy|molar conductivity|faraday'?s first law/i,
    usageNote: 'Use in electrochemistry when emf, conductance, or electrolysis relations are being asked.',
    pitfallNote: 'Log terms and electron counts must match the balanced reaction.',
    variableGuide: ['E = cell potential', 'n = electrons transferred', 'Q = reaction quotient or charge context'],
  },
  {
    matcher: /rate law|arrhenius|half-life|integrated first-order/i,
    usageNote: 'Use in chemical kinetics once the reaction order and the requested rate relation are known.',
    pitfallNote: 'Do not apply first-order half-life relations to zero-order or second-order cases.',
    variableGuide: ['k = rate constant', 'r = reaction rate', 'E_a = activation energy'],
  },
  {
    matcher: /quadratic formula|discriminant/i,
    usageNote: 'Use for quadratic equations once the expression is arranged in standard ax^2 + bx + c = 0 form.',
    pitfallNote: 'Check the sign of b carefully before substituting into the formula.',
    variableGuide: ['a, b, c = quadratic coefficients', 'D = discriminant'],
  },
  {
    matcher: /nth term of AP|sum of n terms of AP/i,
    usageNote: 'Use for arithmetic progression terms and sums after identifying first term and common difference.',
    pitfallNote: 'Do not confuse the last term l with the common difference d.',
    variableGuide: ['a = first term', 'd = common difference', 'n = number of terms'],
  },
  {
    matcher: /distance formula|section formula|midpoint formula|area of triangle in coordinates/i,
    usageNote: 'Use after plotting or identifying the coordinate points clearly from the question.',
    pitfallNote: 'Maintain the correct point order while substituting coordinate pairs.',
    variableGuide: ['(x1, y1), (x2, y2) = point coordinates'],
  },
  {
    matcher: /trig identity|tan theta|sec-tan|cosec-cot|inverse trig/i,
    usageNote: 'Use to simplify trigonometric expressions or convert one ratio form into another.',
    pitfallNote: 'Angles should stay in the expected unit and domain for inverse trigonometric steps.',
    variableGuide: ['theta = angle variable'],
  },
  {
    matcher: /integration by parts|standard integral|area under curve|area between two curves/i,
    usageNote: 'Use in integration and application-of-integrals problems after deciding the right algebraic form.',
    pitfallNote: 'Keep constants of integration or limits consistent with whether the question is definite or indefinite.',
    variableGuide: ['u, v = chosen integration terms', 'a, b = interval limits'],
  },
  {
    matcher: /integrating factor|variable separable/i,
    usageNote: 'Use after identifying whether the differential equation is linear or separable.',
    pitfallNote: 'Do not mix the linear-form method with separable-form integration in the same step.',
    variableGuide: ['P(x) = coefficient of y', 'IF = integrating factor'],
  },
  {
    matcher: /dot product|cross product|magnitude of vector|line in vector form|plane equation/i,
    usageNote: 'Use for vector geometry, projections, and 3D relations after identifying the correct geometric form.',
    pitfallNote: 'Check whether the problem needs a scalar result, a vector result, or a geometric interpretation.',
    variableGuide: ['vec a, vec b = vectors', 'vec n = normal vector', 'lambda = scalar parameter'],
  },
  {
    matcher: /bayes|probability|classical probability/i,
    usageNote: 'Use only after defining the sample space and the relevant event conditions clearly.',
    pitfallNote: 'Conditional probability changes the denominator, so define the conditioning event first.',
    variableGuide: ['P(E) = probability of event E', 'A_i, B = events'],
  },
  {
    matcher: /current ratio|quick ratio|debt-equity|return on capital employed|cash flow|break-even|gdp|mpc|mps|multiplier|fiscal deficit|balance of trade/i,
    usageNote: 'Use after reading the exact accounting or macroeconomics definition expected in the chapter.',
    pitfallNote: 'Do not change the numerator or denominator labels casually; the chapter definition matters.',
    variableGuide: ['Read each numerator and denominator exactly as defined in the chapter statement.'],
  },
  {
    matcher: /population growth|logistic growth|dna composition|biomass pyramid/i,
    usageNote: 'Use these as chapter-grounded biology relations or trends rather than purely numerical laws.',
    pitfallNote: 'State the biological meaning of each term, not just the equation form.',
    variableGuide: ['N = population size where relevant', 'r = intrinsic growth rate', 'K = carrying capacity'],
  },
];

function inferSourceLocator(chapter: Chapter): string {
  return `Class ${chapter.classLevel} • ${chapter.subject} • Chapter ${chapter.chapterNumber} • ${chapter.title}`;
}

function buildSourceLocator(chapter: Chapter): string {
  return `Class ${chapter.classLevel} - ${chapter.subject} - Chapter ${chapter.chapterNumber} - ${chapter.title}`;
}

function inferSourcePageHint(chapter: Chapter, sourceName?: string, sourceUrl?: string): string {
  if (sourceUrl) {
    return `Open the linked reference for the ${chapter.title} topic; exact pagination can vary by site or PDF edition.`;
  }
  if (sourceName && sourceName !== 'NCERT chapter mapping' && sourceName !== 'NCERT formula set (curated)') {
    return `Use the ${chapter.title} formula summary or worked-example section in ${sourceName}; exact page numbers can differ by edition.`;
  }
  return `Use the ${chapter.title} chapter summary, formula box, or worked examples; exact textbook pagination can vary by edition.`;
}

function inferSourceDetail(chapter: Chapter, sourceName?: string, sourceUrl?: string): string {
  const doc = sourceName ? SOURCE_DOC_BY_NAME.get(sourceName) : undefined;
  if (sourceUrl) {
    return `Cross-checked with the linked reference and aligned back to ${buildSourceLocator(chapter)}.`;
  }
  if (doc && doc.localPath !== 'Web reference') {
    return `Mapped from ${doc.sourceName} and aligned to the textbook flow of ${buildSourceLocator(chapter)}.`;
  }
  if (sourceName && sourceName !== 'NCERT chapter mapping') {
    return `Curated from ${sourceName} and aligned to ${buildSourceLocator(chapter)} for revision use.`;
  }
  return `Mapped directly to ${buildSourceLocator(chapter)} so the formula stays tied to the chapter sequence students study from.`;
}

function inferFallbackUsage(chapter: Chapter): string {
  switch (chapter.subject) {
    case 'Physics':
      return 'Use after identifying the physical quantity, the chapter model, and the sign convention being used.';
    case 'Chemistry':
      return 'Use after checking concentration units, reaction conditions, and whether the chapter expects a logarithmic or algebraic relation.';
    case 'Math':
      return 'Use after rewriting the problem in the standard form taught in this chapter.';
    case 'Biology':
      return 'Use as a chapter-grounded relation or trend while explaining the biological meaning in words.';
    default:
      return 'Use only after matching each symbol with the exact chapter definition before substitution.';
  }
}

function inferFallbackPitfall(chapter: Chapter): string {
  switch (chapter.subject) {
    case 'Physics':
      return 'Most mistakes here come from sign convention slips or unit mismatch between chapter quantities.';
    case 'Chemistry':
      return 'Keep temperature, logarithms, and concentration units consistent across the full solution.';
    case 'Math':
      return 'Most mistakes come from missing the standard form or skipping domain and sign checks.';
    case 'Biology':
      return 'Explain what the relation means biologically instead of writing only the symbolic form.';
    default:
      return 'Write the definition in words before substituting values so the ratio or expression stays chapter-correct.';
  }
}

function inferFallbackVariableGuide(chapter: Chapter): string[] {
  switch (chapter.subject) {
    case 'Physics':
      return ['Match every symbol with the NCERT quantity name before substitution.'];
    case 'Chemistry':
      return ['Keep each concentration, temperature, or reaction term in the unit expected by the chapter.'];
    case 'Math':
      return ['Identify what each symbol stands for in the standard form used in this chapter.'];
    case 'Biology':
      return ['State the biological meaning of each symbol or trend while writing the answer.'];
    default:
      return ['Read the numerator and denominator labels exactly as the chapter defines them.'];
  }
}

function inferStudyHint(chapter: Chapter, formulaName: string, latex: string) {
  const searchText = `${formulaName} ${latex}`;
  const matched = FORMULA_STUDY_HINTS.find((hint) => hint.matcher.test(searchText));
  return {
    usageNote: matched?.usageNote ?? inferFallbackUsage(chapter),
    pitfallNote: matched?.pitfallNote ?? inferFallbackPitfall(chapter),
    variableGuide: matched?.variableGuide ?? inferFallbackVariableGuide(chapter),
  };
}

export function getAllFormulaEntries(): FormulaEntry[] {
  if (cachedFormulaEntries) return cachedFormulaEntries;
  const entries: FormulaEntry[] = [];
  const seen = new Set<string>();

  for (const chapter of ALL_CHAPTERS) {
    if (!chapter.formulas || chapter.formulas.length === 0) continue;
    for (const formula of chapter.formulas) {
      const key = `${chapter.id}:${formula.name.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const studyHint = inferStudyHint(chapter, formula.name, formula.latex);

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
        sourceLocator: buildSourceLocator(chapter),
        sourceDetail: inferSourceDetail(chapter, 'NCERT chapter mapping'),
        sourcePageHint: inferSourcePageHint(chapter, 'NCERT chapter mapping'),
        usageNote: studyHint.usageNote,
        pitfallNote: studyHint.pitfallNote,
        variableGuide: studyHint.variableGuide,
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
    const studyHint = inferStudyHint(chapter, item.name, item.latex);

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
      sourceLocator: buildSourceLocator(chapter),
      sourceDetail: item.sourceDetail ?? inferSourceDetail(chapter, item.sourceName, item.sourceUrl),
      sourcePageHint: item.sourcePageHint ?? inferSourcePageHint(chapter, item.sourceName, item.sourceUrl),
      usageNote: item.usageNote ?? studyHint.usageNote,
      pitfallNote: item.pitfallNote ?? studyHint.pitfallNote,
      variableGuide: item.variableGuide ?? studyHint.variableGuide,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
    });
  }

  cachedFormulaEntries = entries.sort((a, b) => {
    if (a.classLevel !== b.classLevel) return a.classLevel - b.classLevel;
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
    return a.name.localeCompare(b.name);
  });
  return cachedFormulaEntries;
}

export function getFormulaEntriesForChapter(chapterId: string): FormulaEntry[] {
  if (!chapterId) return [];
  return getAllFormulaEntries().filter((entry) => entry.chapterId === chapterId);
}
