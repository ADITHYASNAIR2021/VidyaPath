interface RetrievalExpansionInput {
  query: string;
  subject: string;
  classLevel: number;
  chapterTitle?: string;
  chapterTopics?: string[];
  pyqTopics?: string[];
}

const QUERY_SYNONYM_GROUPS: Array<{
  keys: string[];
  expansions: string[];
}> = [
  // Class 10 – Biology
  {
    keys: ['osmosis', 'diffusion'],
    expansions: ['semipermeable membrane', 'water movement', 'concentration gradient', 'cell transport'],
  },
  {
    keys: ['photosynthesis'],
    expansions: ['chlorophyll', 'light reaction', 'dark reaction', 'carbon dioxide', 'glucose', 'nadph', 'atp'],
  },
  {
    keys: ['transpiration', 'prachalan'],
    expansions: ['stomata', 'water loss', 'xylem', 'leaf surface', 'pull of water'],
  },
  {
    keys: ['mitosis', 'meiosis'],
    expansions: ['prophase', 'metaphase', 'anaphase', 'telophase', 'cell division'],
  },
  {
    keys: ['genetics', 'inheritance'],
    expansions: ['genotype', 'phenotype', 'monohybrid cross', 'dihybrid cross', 'punnett square'],
  },
  // Class 10 – Chemistry
  {
    keys: ['combination reaction', 'samavayavi pratikrya'],
    expansions: ['addition reaction', 'single product', 'reactants combine', 'balanced equation'],
  },
  {
    keys: ['displacement reaction'],
    expansions: ['reactivity series', 'metal replaces metal', 'metal acid reaction'],
  },
  // Class 10 – Physics
  {
    keys: ['electric current', 'circuit'],
    expansions: ['voltage', 'resistance', 'ohms law', 'series circuit', 'parallel circuit'],
  },
  {
    keys: ['lens', 'ray optics'],
    expansions: ['focal length', 'image formation', 'sign convention', 'magnification'],
  },
  // Class 12 – Physics
  {
    keys: ['electric field', 'gauss law', 'coulomb'],
    expansions: ['electric flux', 'charge distribution', 'field lines', 'permittivity', 'epsilon naught'],
  },
  {
    keys: ['capacitor', 'capacitance'],
    expansions: ['parallel plate', 'dielectric', 'farad', 'charge stored', 'energy stored', 'series combination'],
  },
  {
    keys: ['magnetic field', 'biot savart', 'ampere'],
    expansions: ['tesla', 'solenoid', 'toroid', 'current loop', 'magnetic flux', 'permeability'],
  },
  {
    keys: ['electromagnetic induction', 'faraday', 'lenz'],
    expansions: ['induced emf', 'flux change', 'eddy current', 'back emf', 'self inductance', 'mutual inductance'],
  },
  {
    keys: ['alternating current', 'ac circuit', 'lcr'],
    expansions: ['impedance', 'reactance', 'resonance', 'power factor', 'rms value', 'phasor'],
  },
  {
    keys: ['semiconductor', 'diode', 'transistor'],
    expansions: ['p-type', 'n-type', 'depletion layer', 'forward bias', 'reverse bias', 'amplifier', 'logic gate'],
  },
  {
    keys: ['photoelectric effect'],
    expansions: ['work function', 'threshold frequency', 'kinetic energy', 'photon', 'einstein equation'],
  },
  {
    keys: ['nucleus', 'radioactivity', 'nuclear'],
    expansions: ['alpha decay', 'beta decay', 'gamma ray', 'half life', 'binding energy', 'mass defect'],
  },
  {
    keys: ['wave optics', 'interference', 'diffraction'],
    expansions: ['youngs double slit', 'fringe width', 'coherent source', 'polarisation', 'huygensm principle'],
  },
  // Class 12 – Chemistry
  {
    keys: ['electrochemistry', 'electrolysis'],
    expansions: ['faraday law', 'electrode potential', 'emf cell', 'galvanic cell', 'kohlrausch', 'conductance'],
  },
  {
    keys: ['chemical kinetics', 'rate of reaction'],
    expansions: ['order reaction', 'rate constant', 'activation energy', 'arrhenius equation', 'half life'],
  },
  {
    keys: ['coordination compound', 'complex'],
    expansions: ['ligand', 'oxidation state', 'cfse', 'isomerism', 'iupac name', 'stability constant'],
  },
  {
    keys: ['organic chemistry', 'iupac'],
    expansions: ['functional group', 'nomenclature', 'substitution', 'elimination', 'addition', 'condensation'],
  },
  {
    keys: ['alcohol', 'aldehyde', 'ketone', 'carboxylic acid'],
    expansions: ['oxidation', 'reduction', 'esterification', 'nucleophilic addition', 'fehling test', 'tollens'],
  },
  {
    keys: ['solid state', 'crystal'],
    expansions: ['unit cell', 'bcc', 'fcc', 'packing efficiency', 'defect', 'conductivity'],
  },
  {
    keys: ['solution', 'colligative'],
    expansions: ['molarity', 'molality', 'osmotic pressure', 'elevation boiling point', 'depression freezing'],
  },
  // Class 12 – Biology
  {
    keys: ['dna replication', 'transcription', 'translation'],
    expansions: ['rna polymerase', 'mrna', 'trna', 'ribosome', 'codon', 'anticodon', 'central dogma'],
  },
  {
    keys: ['genetics', 'mendelian'],
    expansions: ['genotype', 'phenotype', 'dominant', 'recessive', 'linkage', 'crossing over', 'chromosome'],
  },
  {
    keys: ['evolution', 'natural selection'],
    expansions: ['darwin', 'mutation', 'adaptation', 'speciation', 'gene pool', 'hardy weinberg'],
  },
  {
    keys: ['immune system', 'immunity'],
    expansions: ['antibody', 'antigen', 'lymphocyte', 'innate', 'adaptive', 'vaccination', 'interferon'],
  },
  {
    keys: ['biotechnology', 'recombinant dna'],
    expansions: ['plasmid', 'restriction enzyme', 'pcr', 'gel electrophoresis', 'gene cloning', 'transgenic'],
  },
  {
    keys: ['ecosystem', 'food chain'],
    expansions: ['producer', 'consumer', 'decomposer', 'trophic level', 'energy flow', 'biomass', 'succession'],
  },
];

const SUBJECT_EXPANSIONS: Record<string, string[]> = {
  chemistry: ['reaction mechanism', 'balanced equation', 'iupac naming', 'oxidation state', 'products reagents'],
  physics: ['formula substitution', 'si unit', 'numerical application', 'graph interpretation', 'sign convention'],
  biology: ['label the parts', 'process sequence', 'assertion reason', 'diagram based', 'ncert terminology'],
  science: ['physics chemistry biology', 'ncert explanation', 'board application'],
  mathematics: ['formula', 'substitution', 'worked example', 'calculation steps'],
  accountancy: ['journal entry', 'ledger', 'ratio analysis', 'partnership accounting'],
  economics: ['multiplier', 'elasticity', 'aggregate demand', 'government budget'],
};

function normalizeSubject(subject: string): string {
  const lower = subject.trim().toLowerCase();
  if (lower.includes('chem')) return 'chemistry';
  if (lower.includes('phy')) return 'physics';
  if (lower.includes('bio')) return 'biology';
  if (lower.includes('math')) return 'mathematics';
  if (lower.includes('account')) return 'accountancy';
  if (lower.includes('econom')) return 'economics';
  if (lower.includes('science')) return 'science';
  return lower;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

const SCIENCE_NOTATION_EXPANSIONS: Record<string, string[]> = {
  co2: ['carbon dioxide', 'co2'],
  h2o: ['water', 'h2o'],
  o2: ['oxygen', 'o2'],
  n2: ['nitrogen', 'n2'],
  h2: ['hydrogen', 'h2'],
  hcl: ['hydrochloric acid', 'hcl'],
  h2so4: ['sulphuric acid', 'h2so4'],
  naoh: ['sodium hydroxide', 'naoh'],
  nacl: ['sodium chloride', 'nacl'],
  caco3: ['calcium carbonate', 'caco3'],
  feso4: ['ferrous sulphate', 'feso4'],
  fe2o3: ['ferric oxide', 'iron oxide', 'fe2o3'],
  agno3: ['silver nitrate', 'agno3'],
  cucl2: ['copper chloride', 'cucl2'],
  na2co3: ['sodium carbonate', 'na2co3'],
  nahco3: ['sodium bicarbonate', 'nahco3'],
  ca: ['calcium', 'ca'],
  fe: ['iron', 'fe'],
  cu: ['copper', 'cu'],
  zn: ['zinc', 'zn'],
  al: ['aluminium', 'al'],
  mg: ['magnesium', 'mg'],
  na: ['sodium', 'na'],
  ph: ['ph', 'acidity', 'alkalinity'],
};

function normalizeChemicalFormula(text: string): string {
  return text
    .replace(/[\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089]/g, (ch) => String('\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089'.indexOf(ch)))
    .replace(/[\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079\u207a\u207b]/g, (ch) => {
      const sup = '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079\u207a\u207b';
      const idx = sup.indexOf(ch);
      return idx >= 0 ? (idx < 10 ? String(idx) : idx === 10 ? '+' : '-') : ch;
    })
    .replace(/[\u00b2\u00b3]/g, (ch) => (ch === '\u00b2' ? '2' : '3'));
}

function tokenize(text: string): string[] {
  const normalized = normalizeChemicalFormula(text);
  const base = (normalized.toLowerCase().match(/[a-z0-9]{2,}|[\u0900-\u097f]{2,}/g) ?? []).filter(Boolean);
  const expanded: string[] = [];
  for (const token of base) {
    expanded.push(token);
    const extras = SCIENCE_NOTATION_EXPANSIONS[token];
    if (extras) expanded.push(...extras);
  }
  return expanded;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function computeRecommendedTopK(questionCount: number, minimum = 8, maximum = 14): number {
  const count = Math.max(1, Math.floor(Number(questionCount) || minimum));
  return Math.min(maximum, Math.max(minimum, Math.ceil(count * 0.4)));
}

export function expandRetrievalQuery(input: RetrievalExpansionInput): string {
  const baseParts = [
    input.query || '',
    input.chapterTitle || '',
    ...(input.chapterTopics ?? []),
    ...(input.pyqTopics ?? []),
  ].filter(Boolean);
  const joined = baseParts.join(' ').trim();
  const queryTokens = new Set(tokenize(joined));
  const additions: string[] = [];

  for (const group of QUERY_SYNONYM_GROUPS) {
    const matches = group.keys.some((key) => {
      const keyTokens = tokenize(key);
      return keyTokens.every((token) => queryTokens.has(token)) || joined.toLowerCase().includes(key.toLowerCase());
    });
    if (matches) additions.push(...group.expansions);
  }

  const subjectKey = normalizeSubject(input.subject);
  additions.push(...(SUBJECT_EXPANSIONS[subjectKey] ?? []));

  const boostedTopics = unique([...(input.chapterTopics ?? []), ...(input.pyqTopics ?? [])])
    .map((topic) => topic.trim())
    .filter(Boolean)
    .slice(0, 10);

  return unique([...baseParts, ...boostedTopics, ...additions]).join(' ').replace(/\s+/g, ' ').trim();
}

export function compressSnippetText(text: string, focusText: string, maxChars = 900): string {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length <= maxChars) return cleaned;

  const sentences = splitSentences(cleaned);
  if (sentences.length <= 2) return cleaned.slice(0, maxChars);

  const focusTokens = new Set(tokenize(focusText));
  const ranked = sentences.map((sentence, index) => {
    const sentenceTokens = tokenize(sentence);
    const overlap = sentenceTokens.reduce((sum, token) => sum + (focusTokens.has(token) ? 1 : 0), 0);
    const formulaBonus = /[=+\-*/^]|mol|volt|ohm|ampere|equation|reaction|phase|diagram|step/i.test(sentence) ? 2 : 0;
    const headingBonus = /^(definition|formula|law|reaction|process|example|steps?)[:\-]/i.test(sentence) ? 2 : 0;
    return {
      index,
      sentence,
      score: overlap * 4 + formulaBonus + headingBonus + Math.min(2, sentence.length / 140),
    };
  });

  const selected = ranked
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.min(4, sentences.length))
    .sort((a, b) => a.index - b.index);

  let compressed = '';
  for (const item of selected) {
    const next = compressed ? `${compressed} ${item.sentence}` : item.sentence;
    if (next.length > maxChars && compressed) break;
    compressed = next.slice(0, maxChars);
  }

  if (!compressed) return cleaned.slice(0, maxChars);
  return compressed;
}
