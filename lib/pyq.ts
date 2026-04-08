// ============================================================
// VidyaPath — PYQ (Previous Year Questions) Analysis
// Maps each chapter ID → years it prominently appeared in board exams
// Also stores important PYQ topics per chapter
// ============================================================

export interface PYQEntry {
  chapterId: string;
  yearsAsked: number[];        // Years this chapter appeared in boards
  importantTopics: string[];   // Topics most frequently asked in PYQs
  avgMarks: number;            // Average marks asked from this chapter per paper
}

const pyqData: PYQEntry[] = [
  // ════════════════════ CLASS 10 SCIENCE ════════════════════

  // Chemistry
  { chapterId: 'c10-chem-1', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Balancing chemical equations','Decomposition reactions','Displacement reactions','Oxidation & reduction'], avgMarks: 7 },
  { chapterId: 'c10-chem-2', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['pH scale & indicators','Reaction of acids with metals','Properties of salts','Baking soda vs washing soda'], avgMarks: 8 },
  { chapterId: 'c10-chem-3', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Reactivity series','Extraction of metals','Corrosion & prevention','Properties of metals vs non-metals'], avgMarks: 8 },
  { chapterId: 'c10-chem-4', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Homologous series','Properties of ethanol & ethanoic acid','Saponification','Carbon bonding'], avgMarks: 9 },
  { chapterId: 'c10-chem-5', yearsAsked: [2016,2017,2018,2019,2022,2023], importantTopics: ['Döbereiner triads','Newlands law','Mendeleev\'s table','Modern periodic law'], avgMarks: 4 },

  // Biology
  { chapterId: 'c10-bio-1', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Nutrition in plants vs animals','Respiration equations','Transpiration','Excretion in plants'], avgMarks: 9 },
  { chapterId: 'c10-bio-2', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Nervous system diagram','Reflex arc','Hormones & endocrine glands','Plant tropisms'], avgMarks: 8 },
  { chapterId: 'c10-bio-3', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Sexual vs asexual reproduction','Pollination & fertilization','Human reproductive system','DNA replication'], avgMarks: 9 },
  { chapterId: 'c10-bio-4', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024], importantTopics: ['Mendel\'s laws','Genotype vs phenotype','Evolution & speciation','Homologous vs analogous organs'], avgMarks: 7 },
  { chapterId: 'c10-bio-5', yearsAsked: [2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Food chain & food web','Trophic levels','Biodegradable waste','Ozone depletion'], avgMarks: 5 },

  // Physics
  { chapterId: 'c10-phy-1', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Mirror formula & ray diagrams','Refraction laws','Lens formula','Power of lens'], avgMarks: 10 },
  { chapterId: 'c10-phy-2', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Dispersion of white light','Human eye defects','Power of accommodation','Scattering of light'], avgMarks: 7 },
  { chapterId: 'c10-phy-3', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Ohm\'s law','Resistors in series & parallel','Electric power','Heating effect of current'], avgMarks: 11 },
  { chapterId: 'c10-phy-4', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Fleming\'s left-hand rule','AC vs DC generator','Electric motor','Faraday\'s law'], avgMarks: 8 },
  { chapterId: 'c10-phy-5', yearsAsked: [2016,2017,2018,2019,2022,2023,2024], importantTopics: ['Renewable vs non-renewable','Solar energy','Biogas','Nuclear energy pros & cons'], avgMarks: 4 },

  // CLASS 10 MATH
  { chapterId: 'c10-math-1', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['HCF & LCM using prime factorization','Irrational numbers proof','Euclid\'s division lemma'], avgMarks: 5 },
  { chapterId: 'c10-math-2', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Zeros of polynomial','Relationship between zeros and coefficients','Quadratic polynomial graph'], avgMarks: 5 },
  { chapterId: 'c10-math-4', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Quadratic formula','Nature of roots','Completing the square','Word problems'], avgMarks: 8 },
  { chapterId: 'c10-math-5', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['nth term formula','Sum of AP formula','Finding common difference','Word problems on AP'], avgMarks: 7 },
  { chapterId: 'c10-math-6', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Pythagoras theorem','Basic proportionality theorem (BPT)','Similarity criteria','Area of similar triangles'], avgMarks: 8 },
  { chapterId: 'c10-math-7', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Distance formula','Section formula','Area of triangle by coordinates'], avgMarks: 6 },
  { chapterId: 'c10-math-8', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Trigonometric ratios','Complementary angles','Trigonometric identities'], avgMarks: 8 },
  { chapterId: 'c10-math-9', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Angle of elevation & depression','Height and distance word problems'], avgMarks: 5 },
  { chapterId: 'c10-math-13', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Surface area of combination solids','Volume of combination solids','Frustum'], avgMarks: 8 },
  { chapterId: 'c10-math-14', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Classical probability','Probability of complementary events','Playing cards problems'], avgMarks: 5 },

  // ════════════════════ CLASS 12 PHYSICS ════════════════════
  { chapterId: 'c12-phy-1', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Coulomb\'s law','Electric field & field lines','Gauss\'s law applications'], avgMarks: 6 },
  { chapterId: 'c12-phy-2', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Potential due to point charge','Equipotential surfaces','Relation between E and V'], avgMarks: 6 },
  { chapterId: 'c12-phy-3', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Capacitors in series & parallel','Dielectrics','Energy stored in capacitor'], avgMarks: 5 },
  { chapterId: 'c12-phy-4', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Drift velocity & mobility','Kirchhoff\'s laws','Wheatstone bridge','Metre bridge'], avgMarks: 8 },
  { chapterId: 'c12-phy-5', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Biot-Savart law','Ampere\'s circuital law','Force between parallel conductors','Torque on current loop'], avgMarks: 7 },
  { chapterId: 'c12-phy-7', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Faraday\'s laws','Lenz\'s law','Mutual & self inductance','AC generator'], avgMarks: 8 },
  { chapterId: 'c12-phy-8', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['LC resonance','Power factor','Transformer','RMS values'], avgMarks: 7 },
  { chapterId: 'c12-phy-10', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Reflection & refraction at curved surfaces','Lens maker\'s equation','Optical instruments','Total internal reflection'], avgMarks: 9 },
  { chapterId: 'c12-phy-12', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Energy levels of hydrogen','Photoelectric effect','de Broglie wavelength'], avgMarks: 6 },
  { chapterId: 'c12-phy-14', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['p-n junction diode','Zener diode','Logic gates (AND/OR/NAND/NOR)','Rectifier circuits'], avgMarks: 7 },

  // ════════════════════ CLASS 12 CHEMISTRY ════════════════════
  { chapterId: 'c12-chem-1', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Henry\'s law','Raoult\'s law','Colligative properties','Osmotic pressure'], avgMarks: 7 },
  { chapterId: 'c12-chem-2', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Kohlrausch\'s law','Faraday\'s laws of electrolysis','Nernst equation','Cell potential'], avgMarks: 8 },
  { chapterId: 'c12-chem-3', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Rate of reaction','Rate constant & Arrhenius equation','Order of reaction','Half-life'], avgMarks: 7 },
  { chapterId: 'c12-chem-7', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Crystal field theory','CFSE','Magnetic properties','Naming coordination compounds'], avgMarks: 6 },
  { chapterId: 'c12-chem-9', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['SN1 vs SN2 mechanisms','Nucleophilic substitution','Elimination reactions','Grignard reagent'], avgMarks: 7 },
  { chapterId: 'c12-chem-10', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Lucas test','Oxidation of alcohols','Ether preparation','Reaction with PCl5'], avgMarks: 7 },
  { chapterId: 'c12-chem-12', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Aldol condensation','Cannizzaro reaction','Comparison of aldehydes & ketones','Oxidation tests'], avgMarks: 8 },
  { chapterId: 'c12-chem-13', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Amines basicity','Diazonium salts reactions','Hofmann bromamide reaction','Coupling reaction'], avgMarks: 7 },

  // ════════════════════ CLASS 12 BIOLOGY ════════════════════
  { chapterId: 'c12-bio-3', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Spermatogenesis & oogenesis','Menstrual cycle','Placenta functions','Implantation'], avgMarks: 8 },
  { chapterId: 'c12-bio-5', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Mendelian inheritance','Codominance & incomplete dominance','Sex determination','Chromosomal disorders'], avgMarks: 8 },
  { chapterId: 'c12-bio-6', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['DNA structure','Replication fork','Transcription & translation','Central dogma','lac operon'], avgMarks: 9 },
  { chapterId: 'c12-bio-7', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Darwin\'s theory','Adaptive radiation','Hardy-Weinberg theorem','Evidences of evolution'], avgMarks: 6 },
  { chapterId: 'c12-bio-11', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Recombinant DNA technology','PCR & gel electrophoresis','Gene cloning vectors','Transgenic organisms'], avgMarks: 8 },
  { chapterId: 'c12-bio-13', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Biogeochemical cycles','Energy flow pyramid','Ecosystem services','Productivity'], avgMarks: 6 },
  { chapterId: 'c12-bio-15', yearsAsked: [2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Biodiversity hotspots','IUCN categories','In-situ vs ex-situ conservation','Threat to biodiversity'], avgMarks: 5 },

  // ════════════════════ CLASS 12 MATH ════════════════════
  { chapterId: 'c12-math-3', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Matrix operations','Transpose & inverse','Row reduction','Properties of matrix multiplication'], avgMarks: 8 },
  { chapterId: 'c12-math-4', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Properties of determinants','Adjoint & inverse using cofactors','Cramer\'s rule','Area of triangle'], avgMarks: 8 },
  { chapterId: 'c12-math-5', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Continuity at a point','Differentiability','Implicit differentiation','Chain rule'], avgMarks: 8 },
  { chapterId: 'c12-math-6', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Increasing/decreasing functions','Tangent & normal','Maxima/minima','Approximation'], avgMarks: 8 },
  { chapterId: 'c12-math-7', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Substitution method','By parts (ILATE)','Partial fractions','Standard integrals'], avgMarks: 9 },
  { chapterId: 'c12-math-8', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Area between two curves','Area under a curve','Definite integral as area'], avgMarks: 6 },
  { chapterId: 'c12-math-9', yearsAsked: [2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Variable separable','Homogeneous differential equations','Linear first-order DE'], avgMarks: 7 },
  { chapterId: 'c12-math-13', yearsAsked: [2013,2014,2015,2016,2017,2018,2019,2022,2023,2024,2025], importantTopics: ['Bayes\' theorem','Random variable & distribution','Binomial distribution','Probability of events'], avgMarks: 8 },
];

// ── Build a fast lookup map ──────────────────────────────────
const PYQ_MAP = new Map<string, PYQEntry>(pyqData.map((e) => [e.chapterId, e]));

export function getPYQData(chapterId: string): PYQEntry | null {
  return PYQ_MAP.get(chapterId) ?? null;
}

/** How many consecutive recent years (2022–2025) was this chapter asked? */
export function getRecentStreak(chapterId: string): number {
  const entry = getPYQData(chapterId);
  if (!entry) return 0;
  const recent = [2025, 2024, 2023, 2022];
  let streak = 0;
  for (const yr of recent) {
    if (entry.yearsAsked.includes(yr)) streak++;
    else break;
  }
  return streak;
}

/** Returns a label like "High frequency" / "Regular" / "Occasional" */
export function getFrequencyLabel(chapterId: string): { label: string; color: string } | null {
  const entry = getPYQData(chapterId);
  if (!entry) return null;
  const count = entry.yearsAsked.length;
  if (count >= 9) return { label: 'Very High Frequency', color: 'text-red-600 bg-red-50 border-red-200' };
  if (count >= 7) return { label: 'High Frequency', color: 'text-orange-600 bg-orange-50 border-orange-200' };
  if (count >= 4) return { label: 'Regular', color: 'text-amber-600 bg-amber-50 border-amber-200' };
  return { label: 'Occasional', color: 'text-blue-600 bg-blue-50 border-blue-200' };
}
