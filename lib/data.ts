// ============================================================
// VidyaPath — Complete Data Layer
// ALL chapters: Class 10 (Science + Math), Class 11, Class 12
// ============================================================

import type { SupportedSubject } from '@/lib/academic-taxonomy';

export type Subject = SupportedSubject;
export type ClassLevel = 10 | 11 | 12;

export interface Chapter {
  id: string;
  classLevel: ClassLevel;
  subject: Subject;
  chapterNumber: number;     // Actual NCERT chapter number
  title: string;
  description: string;
  marks: number;             // Approx. board exam marks
  topics: string[];
  ncertPdfUrl: string;
  ncertExemplarUrl?: string;
  googleFormUrl?: string;    // Teacher can add quiz link here
  examRelevance?: string[];  // e.g. ['JEE', 'NEET', 'Board']
  formulas?: { name: string; latex: string }[];
  mermaidDiagram?: string;
  quizzes?: {
    question: string;
    options: string[];
    correctAnswerIndex: number;
    explanation?: string;
  }[];
  flashcards?: {
    front: string;
    back: string;
  }[];
}

export interface Paper {
  id: string;
  classLevel: ClassLevel | 'all';
  subject: string;
  year: number;
  title: string;
  duration: string;
  totalMarks: number;
  url: string;
}

export interface EntranceExam {
  id: string;
  name: string;
  stream: 'PCM' | 'PCB' | 'Commerce' | 'Both';
  forColleges: string;
  eligibility: string;
  pattern: string;
  dates: string;
  officialUrl: string;
  topColleges: string[];
  prepTip: string;
}

export interface College {
  name: string;
  tier: 'Elite' | 'Top' | 'Good';
  stream: 'PCM' | 'PCB' | 'Commerce' | 'Both';
  url: string;
}

export interface Scholarship {
  name: string;
  description: string;
  url: string;
}

// ============================================================
// CLASS 10 — SCIENCE (15 chapters)
// ============================================================

const class10Science: Chapter[] = [
  // ── CHEMISTRY (Ch 1–5) ────────────────────────────────
  {
    id: 'c10-chem-1', classLevel: 10, subject: 'Chemistry', chapterNumber: 1,
    title: 'Chemical Reactions and Equations',
    description: 'Learn to write, balance, and classify chemical equations. This is the foundation of all Chemistry in Class 11 and 12.',
    marks: 7,
    topics: ['Chemical Equations', 'Balancing Chemical Equations', 'Combination Reactions', 'Decomposition Reactions', 'Displacement Reactions', 'Double Displacement Reactions', 'Oxidation and Reduction', 'Exothermic and Endothermic Reactions', 'Effects of Oxidation in Daily Life'],
    ncertPdfUrl: 'https://ncert.nic.in/ncerts/l/jesc101.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep101.pdf',
    examRelevance: ['Board'],
    formulas: [
      { name: 'Photosynthesis Reaction', latex: '6CO_2 + 6H_2O \\xrightarrow{\\text{Sunlight}} C_6H_{12}O_6 + 6O_2' },
      { name: 'Neutralization Reaction', latex: 'Acid + Base \\rightleftharpoons Salt + Water' }
    ],
    mermaidDiagram: `
graph TD
    A[Chemical Reactions] --> B(Combination)
    A --> C(Decomposition)
    A --> D(Displacement)
    A --> E(Double Displacement)
    C --> F[Thermal]
    C --> G[Electrolytic]
    C --> H[Photolytic]
    `,
    quizzes: [
      {
        question: 'Which of the following is a physical change?',
        options: ['Rusting of iron', 'Melting of ice', 'Burning of magnesium ribbon', 'Digestion of food'],
        correctAnswerIndex: 1,
        explanation: 'Melting of ice is a physical change because no new substance is formed, only the state changes.',
      },
      {
        question: 'Identify the type of reaction: 2H2 + O2 → 2H2O',
        options: ['Decomposition', 'Displacement', 'Combination', 'Double Displacement'],
        correctAnswerIndex: 2,
        explanation: 'Two elements (H2 and O2) are combining to form a single product (H2O), which is a combination reaction.',
      }
    ],
    flashcards: [
      { front: 'Exothermic Reaction', back: 'A reaction in which heat is released along with the formation of products.' },
      { front: 'Endothermic Reaction', back: 'A reaction which requires energy (in the form of heat, light or electricity) to proceed.' },
      { front: 'Oxidation', back: 'The addition of oxygen to a substance or the removal of hydrogen from a substance.' },
      { front: 'Reduction', back: 'The addition of hydrogen to a substance or the removal of oxygen from a substance.' }
    ]
  },
  {
    id: 'c10-chem-2', classLevel: 10, subject: 'Chemistry', chapterNumber: 2,
    title: 'Acids, Bases and Salts',
    description: 'Master the pH scale, indicators, and how acids react with bases. Common salts like baking soda and bleach are explained here.',
    marks: 7,
    topics: ['Properties of Acids', 'Properties of Bases', 'How Acids and Bases React', 'pH Scale', 'Importance of pH in Daily Life', 'Common Salt (NaCl)', 'Baking Soda', 'Washing Soda', 'Bleaching Powder', 'Plaster of Paris'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc102.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep102.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c10-chem-3', classLevel: 10, subject: 'Chemistry', chapterNumber: 3,
    title: 'Metals and Non-Metals',
    description: 'Compare metals and non-metals, understand the reactivity series, ionic bonding, and everyday phenomena like rusting.',
    marks: 7,
    topics: ['Physical Properties of Metals', 'Physical Properties of Non-Metals', 'Chemical Properties of Metals', 'Reactivity Series', 'Ionic Bonding', 'Occurrence of Metals', 'Extraction of Metals', 'Refining', 'Corrosion and its Prevention', 'Alloys'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc103.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep103.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c10-chem-4', classLevel: 10, subject: 'Chemistry', chapterNumber: 4,
    title: 'Carbon and its Compounds',
    description: 'Discover organic chemistry basics — from carbon chains and functional groups to the soaps that clean your clothes.',
    marks: 7,
    topics: ['Bonding in Carbon (Covalent Bonds)', 'Allotropes of Carbon', 'Saturated and Unsaturated Compounds', 'Homologous Series', 'Functional Groups', 'Nomenclature of Carbon Compounds', 'Chemical Properties', 'Ethanol', 'Ethanoic Acid', 'Soaps and Detergents'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc104.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep104.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c10-chem-5', classLevel: 10, subject: 'Chemistry', chapterNumber: 5,
    title: 'Periodic Classification of Elements',
    description: 'Journey from Döbereiner and Newlands to Mendeleev\'s table and the modern periodic table — the story of organising all elements.',
    marks: 5,
    topics: ["Döbereiner's Triads", "Newlands' Law of Octaves", "Mendeleev's Periodic Table", 'Achievements and Limitations of Mendeleev', 'Modern Periodic Table', 'Periods and Groups', 'Properties of Periods', 'Properties of Groups', 'Valence Electrons and Valency', 'Metallic and Non-Metallic Character'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc105.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep105.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  // ── BIOLOGY (Ch 6–9, 15) ─────────────────────────────
  {
    id: 'c10-bio-1', classLevel: 10, subject: 'Biology', chapterNumber: 6,
    title: 'Life Processes',
    description: 'The highest-weightage chapter. Understand nutrition, photosynthesis, respiration, and how living organisms sustain themselves.',
    marks: 10,
    topics: ['What are Life Processes?', 'Autotrophic Nutrition', 'Photosynthesis', 'Heterotrophic Nutrition', 'Nutrition in Human Beings', 'Aerobic Respiration', 'Anaerobic Respiration', 'Transportation in Plants (Xylem, Phloem)', 'Transportation in Humans (Blood, Heart)', 'Excretion in Humans', 'Excretion in Plants'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc106.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep106.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c10-bio-2', classLevel: 10, subject: 'Biology', chapterNumber: 7,
    title: 'Control and Coordination',
    description: 'Explore how your nervous system and hormones keep your body in perfect harmony — from reflexes to plant movements.',
    marks: 8,
    topics: ['Nervous System in Animals', 'Structure of a Neuron', 'Reflex Actions and Reflex Arc', 'Human Brain Structure', 'Coordination in Plants', 'Plant Hormones: Auxin, Gibberellin, Cytokinin, ABA', 'Phototropism and Geotropism', 'Animal Hormones', 'Endocrine Glands', 'Feedback Mechanism'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc107.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep107.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c10-bio-3', classLevel: 10, subject: 'Biology', chapterNumber: 8,
    title: 'How do Organisms Reproduce?',
    description: 'From bacteria splitting in two to flowers and their pollinators — understand how life continues across generations.',
    marks: 8,
    topics: ['Importance of Variation', 'Asexual Reproduction: Fission, Fragmentation, Regeneration, Budding', 'Vegetative Propagation', 'Spore Formation', 'Sexual Reproduction in Flowering Plants', 'Pollination and Fertilisation', 'Fruit and Seed Formation', 'Reproduction in Human Beings', 'Reproductive Health', 'Contraception'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc108.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep108.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c10-bio-4', classLevel: 10, subject: 'Biology', chapterNumber: 9,
    title: 'Heredity and Evolution',
    description: "Trace the origin of traits from parents to children using Mendel's laws, and explore Darwin's theory of how species change over time.",
    marks: 8,
    topics: ['Accumulation of Variation', "Mendel's Experiments", 'Dominant and Recessive Traits', 'Monohybrid Cross', 'Dihybrid Cross', 'Sex Determination', "Darwin's Theory of Natural Selection", 'Evolution', 'Speciation', 'Evolution and Classification', 'Molecular Phylogeny'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc109.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep109.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c10-bio-5', classLevel: 10, subject: 'Biology', chapterNumber: 15,
    title: 'Our Environment',
    description: 'Understand ecosystems, food chains, and the environmental challenges we face — important for both boards and career awareness.',
    marks: 7,
    topics: ['Ecosystem and its Components', 'Food Chains and Food Webs', 'Trophic Levels', 'Energy Flow in Ecosystems', 'Biological Magnification', 'Biodegradable vs Non-Biodegradable', 'Ozone Layer Depletion', 'Waste Management', 'Protected Areas'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc115.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep115.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  // ── PHYSICS (Ch 10–14) ───────────────────────────────
  {
    id: 'c10-phy-1', classLevel: 10, subject: 'Physics', chapterNumber: 10,
    title: 'Light – Reflection and Refraction',
    description: 'Study how light bounces off mirrors and bends through lenses. Core topic for both board exams and JEE entrance.',
    marks: 7,
    topics: ['Laws of Reflection', 'Concave and Convex Mirrors', 'Mirror Formula', 'Sign Convention', 'Refraction of Light', "Snell's Law", 'Concave and Convex Lenses', 'Lens Formula', 'Power of a Lens', 'Total Internal Reflection'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc110.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep110.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c10-phy-2', classLevel: 10, subject: 'Physics', chapterNumber: 11,
    title: 'The Human Eye and the Colourful World',
    description: 'Understand how the human eye works, defects and their corrections, and why the sky is blue and the sunset is red.',
    marks: 4,
    topics: ['Structure of the Human Eye', 'Power of Accommodation', 'Myopia and its Correction', 'Hypermetropia and its Correction', 'Presbyopia', 'Dispersion of Light (Prism)', 'Atmospheric Refraction', 'Rainbow Formation', 'Tyndall Effect', 'Why Sky is Blue'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc111.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep111.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c10-phy-3', classLevel: 10, subject: 'Physics', chapterNumber: 12,
    title: 'Electricity',
    description: "One of the highest-weightage chapters. Master Ohm's Law, circuits, and electrical power calculations that appear in every board paper.",
    marks: 7,
    topics: ['Electric Current and Circuit', 'Electric Potential and Potential Difference', "Ohm's Law", 'Resistance and Resistivity', 'Factors Affecting Resistance', 'Series Combination of Resistors', 'Parallel Combination of Resistors', "Joule's Law of Heating", 'Electric Power', 'Commercial Unit of Energy (kWh)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc112.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep112.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c10-phy-4', classLevel: 10, subject: 'Physics', chapterNumber: 13,
    title: 'Magnetic Effects of Electric Current',
    description: 'Explore the link between electricity and magnetism — from compass deflection to electric motors and generators.',
    marks: 4,
    topics: ['Magnetic Field and Field Lines', 'Magnetic Field due to Current-Carrying Conductor', 'Right-Hand Thumb Rule', 'Solenoid', 'Force on Current-Carrying Conductor', 'Fleming\'s Left-Hand Rule', 'Electric Motor', "Faraday's Law", 'Electric Generator', 'AC vs DC', 'Domestic Electric Circuits'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc113.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep113.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c10-phy-5', classLevel: 10, subject: 'Physics', chapterNumber: 14,
    title: 'Sources of Energy',
    description: 'Compare conventional and renewable energy sources, their pros, cons, and environmental impact on our planet.',
    marks: 3,
    topics: ['Ideal Source of Energy', 'Fossil Fuels', 'Solar Energy and Devices', 'Wind Energy', 'Hydropower', 'Biomass and Biogas', 'Tidal and Wave Energy', 'Geothermal Energy', 'Nuclear Energy (Fission and Fusion)', 'Environmental Consequences of Energy Use'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jesc114.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/science/jeep114.pdf',
    examRelevance: ['Board'],
  },
];

// ============================================================
// CLASS 10 — MATH (14 chapters, separate textbook)
// ============================================================

const class10Math: Chapter[] = [
  {
    id: 'c10-math-1', classLevel: 10, subject: 'Math', chapterNumber: 1,
    title: 'Real Numbers',
    description: "Euclid's division algorithm, HCF and LCM, irrational numbers, and decimal expansions — the bedrock of Class 10 Math.",
    marks: 6,
    topics: ["Euclid's Division Lemma", 'Fundamental Theorem of Arithmetic', 'Revisiting Irrational Numbers', 'Revisiting Rational Numbers', 'Decimal Expansion of Rational Numbers', 'HCF and LCM using Prime Factorisation', 'Applications of HCF and LCM'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh101.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep201.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-math-2', classLevel: 10, subject: 'Math', chapterNumber: 2,
    title: 'Polynomials',
    description: 'Understand zeros of polynomials, their relationship with coefficients, and the division algorithm for polynomials.',
    marks: 4,
    topics: ['Geometric Meaning of Zeros of a Polynomial', 'Relationship between Zeros and Coefficients', 'Division Algorithm for Polynomials', 'Linear, Quadratic and Cubic Polynomials', 'Finding Zeros of Polynomials', 'Factorising Polynomials'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh102.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep202.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-math-3', classLevel: 10, subject: 'Math', chapterNumber: 3,
    title: 'Pair of Linear Equations in Two Variables',
    description: 'Solve simultaneous equations graphically and algebraically. A high-weightage chapter with many real-world word problems.',
    marks: 8,
    topics: ['Graphical Method of Solution', 'Consistent and Inconsistent Systems', 'Substitution Method', 'Elimination Method', 'Cross-Multiplication Method', 'Equations Reducible to Linear Form', 'Word Problems', 'Conditions for Consistency'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh103.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep203.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-math-4', classLevel: 10, subject: 'Math', chapterNumber: 4,
    title: 'Quadratic Equations',
    description: 'Find roots by factorisation, completing the square, and the quadratic formula. Understand the discriminant and nature of roots.',
    marks: 8,
    topics: ['Standard Form of Quadratic Equation', 'Solution by Factorisation', 'Solution by Completing the Square', 'Quadratic Formula (Sridharacharya)', 'Discriminant and Nature of Roots', 'Forming Quadratic Equations', 'Problems Involving Quadratic Equations'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh104.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep204.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c10-math-5', classLevel: 10, subject: 'Math', chapterNumber: 5,
    title: 'Arithmetic Progressions',
    description: 'Find the nth term and sum of any AP. This chapter has beautiful patterns and plenty of real-life applications.',
    marks: 8,
    topics: ['What is an Arithmetic Progression?', 'nth Term of an AP', 'Sum of First n Terms of an AP', 'Finding Number of Terms', 'Arithmetic Mean', 'Problems Based on AP', 'Common Difference and its Applications'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh105.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep205.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-math-6', classLevel: 10, subject: 'Math', chapterNumber: 6,
    title: 'Triangles',
    description: 'The highest-weightage geometry chapter. Master similarity, the Basic Proportionality Theorem, and the Pythagoras theorem.',
    marks: 10,
    topics: ['Similar Figures', 'Criteria for Similarity of Triangles (AA, SAS, SSS)', 'Basic Proportionality Theorem (Thales Theorem)', 'Converse of BPT', 'Areas of Similar Triangles', 'Pythagoras Theorem', 'Converse of Pythagoras Theorem', 'Application Problems'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh106.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep206.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-math-7', classLevel: 10, subject: 'Math', chapterNumber: 7,
    title: 'Coordinate Geometry',
    description: 'Plot points, find distances, locate section points, and calculate triangle areas using algebraic coordinate methods.',
    marks: 6,
    topics: ['Distance Formula', 'Section Formula (Internal Division)', 'Section Formula (External Division)', 'Midpoint Formula', 'Area of a Triangle using Coordinates', 'Collinearity of Three Points', 'Centroid of a Triangle'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh107.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep207.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c10-math-8', classLevel: 10, subject: 'Math', chapterNumber: 8,
    title: 'Introduction to Trigonometry',
    description: 'Define trig ratios for right-angled triangles, learn exact values, and prove important trigonometric identities.',
    marks: 8,
    topics: ['Trigonometric Ratios (sin, cos, tan)', 'Trigonometric Ratios of Specific Angles (0°, 30°, 45°, 60°, 90°)', 'Trigonometric Ratios of Complementary Angles', 'Trigonometric Identities', 'Proving Identities', 'Reciprocal Relations (cosec, sec, cot)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh108.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep208.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c10-math-9', classLevel: 10, subject: 'Math', chapterNumber: 9,
    title: 'Some Applications of Trigonometry',
    description: 'Use angles of elevation and depression to find heights of towers, buildings, and distances — real-world trig in action.',
    marks: 4,
    topics: ['Heights and Distances', 'Angle of Elevation', 'Angle of Depression', 'Solving Problems using Trigonometry', 'Line of Sight', 'Real-life Application Problems'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh109.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep209.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-math-10', classLevel: 10, subject: 'Math', chapterNumber: 10,
    title: 'Circles',
    description: 'Explore tangents to circles, prove key theorems, and understand the relationship between tangents drawn from an external point.',
    marks: 3,
    topics: ['Tangent to a Circle', 'Number of Tangents from a Point', 'Tangent Perpendicular to Radius', 'Length of Tangent from External Point', 'Two Tangents from External Point', 'Proof of Tangent Theorems'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh110.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep210.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-math-11', classLevel: 10, subject: 'Math', chapterNumber: 11,
    title: 'Areas Related to Circles',
    description: 'Calculate the area of sectors, segments, and combinations of plane figures involving circles.',
    marks: 3,
    topics: ['Perimeter and Area of a Circle — A Review', 'Areas of Sectors and Segments', 'Areas of Combinations of Plane Figures', 'Area of Sector', 'Area of Segment', 'Shaded Region Problems'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh112.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep211.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-math-12', classLevel: 10, subject: 'Math', chapterNumber: 12,
    title: 'Surface Areas and Volumes',
    description: 'Find surface areas and volumes of combined solids (cones on cylinders, spheres on cones) and the frustum of a cone.',
    marks: 5,
    topics: ['Surface Area of Combination of Solids', 'Volume of Combination of Solids', 'Conversion of One Solid to Another', 'Frustum of a Cone', 'Curved Surface Area of Frustum', 'Volume of Frustum'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh113.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep212.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-math-13', classLevel: 10, subject: 'Math', chapterNumber: 13,
    title: 'Statistics',
    description: 'Find mean, median, and mode of grouped data, draw cumulative frequency graphs, and analyse real data.',
    marks: 8,
    topics: ['Mean of Grouped Data (Direct, Assumed Mean, Step Deviation)', 'Mode of Grouped Data', 'Median of Grouped Data', 'Cumulative Frequency Table', 'Ogives (Less than and More than)', 'Relation between Mean, Median and Mode', 'Graphical Representation'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh114.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep213.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-math-14', classLevel: 10, subject: 'Math', chapterNumber: 14,
    title: 'Probability',
    description: 'Find the probability of simple events, understand equally likely outcomes, and solve real-world probability problems.',
    marks: 4,
    topics: ['Probability — A Theoretical Approach', 'Impossible and Certain Events', 'Complementary Events', 'Simple Problems on Single Event', 'Problems using Playing Cards', 'Problems using Dice', 'Problems using Bags/Boxes'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/jemh115.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep214.pdf',
    examRelevance: ['Board'],
  },
];

// ============================================================
// CLASS 11 — PHYSICS (15 chapters)
// ============================================================

const class11Physics: Chapter[] = [
  {
    id: 'c11-phy-1', classLevel: 11, subject: 'Physics', chapterNumber: 1,
    title: 'Physical World and Units & Measurement',
    description: 'The language of Physics — understand SI units, dimensional analysis, significant figures, and the instruments of measurement.',
    marks: 6,
    topics: ['What is Physics?', 'Scope of Physics', 'SI Units System', 'Fundamental and Derived Units', 'Dimensional Analysis', 'Dimensional Formulas of Physical Quantities', 'Significant Figures', 'Errors in Measurement', 'Accuracy and Precision', 'Vernier Calipers and Screw Gauge'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph101.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep301.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-phy-2', classLevel: 11, subject: 'Physics', chapterNumber: 3,
    title: 'Motion in a Straight Line',
    description: 'Master kinematics — position, velocity, acceleration, and equations of motion that appear in every JEE paper.',
    marks: 8,
    topics: ['Position, Path Length and Displacement', 'Average Velocity and Speed', 'Instantaneous Velocity and Speed', 'Acceleration', 'Kinematic Equations for Uniform Acceleration', 'Relative Velocity', 'Motion under Gravity', 'Distance-Time and Velocity-Time Graphs'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph103.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep303.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-phy-3', classLevel: 11, subject: 'Physics', chapterNumber: 4,
    title: 'Motion in a Plane',
    description: 'Extend kinematics to 2D — vectors, projectile motion, and circular motion form a big chunk of JEE Physics.',
    marks: 8,
    topics: ['Scalars and Vectors', 'Vector Addition (Triangle and Parallelogram Law)', 'Resolution of Vectors', 'Dot (Scalar) Product', 'Cross (Vector) Product', 'Motion in a Plane', 'Projectile Motion (Range, Time, Max Height)', 'Uniform Circular Motion', 'Centripetal Acceleration'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph104.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep304.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-phy-4', classLevel: 11, subject: 'Physics', chapterNumber: 5,
    title: 'Laws of Motion',
    description: "Newton's three laws — the cornerstone of classical mechanics. Free body diagrams and friction are extremely high-weightage for JEE.",
    marks: 10,
    topics: ["Newton's First Law (Inertia)", "Newton's Second Law (F = ma)", "Newton's Third Law", 'Conservation of Linear Momentum', 'Impulse and Impulsive Force', 'Friction: Static and Kinetic', 'Angle of Friction and Repose', 'Free Body Diagrams', 'Circular Motion Dynamics', 'Connected Systems (Atwood Machine)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph105.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep305.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-phy-5', classLevel: 11, subject: 'Physics', chapterNumber: 6,
    title: 'Work, Energy and Power',
    description: 'From the work-energy theorem to conservation of energy — essential for solving complex mechanics problems in JEE.',
    marks: 8,
    topics: ['Work Done by a Constant Force', 'Work Done by a Variable Force', 'Kinetic Energy', 'Work-Energy Theorem', 'Potential Energy', 'Conservation of Mechanical Energy', 'Power', 'Elastic Collision', 'Inelastic Collision', 'Coefficient of Restitution'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph106.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep306.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-phy-6', classLevel: 11, subject: 'Physics', chapterNumber: 7,
    title: 'System of Particles and Rotational Motion',
    description: 'Understand how extended bodies rotate — moment of inertia, torque, and angular momentum are key JEE topics.',
    marks: 8,
    topics: ['Centre of Mass', 'Motion of Centre of Mass', 'Angular Velocity and Angular Acceleration', 'Torque and Angular Momentum', 'Moment of Inertia', 'Theorem of Parallel and Perpendicular Axes', 'Equations of Rotational Motion', 'Rolling Motion'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph107.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep307.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-phy-7', classLevel: 11, subject: 'Physics', chapterNumber: 8,
    title: 'Gravitation',
    description: "From falling apples to orbiting satellites — Newton's Law of Gravitation explains motion from Earth to the cosmos.",
    marks: 6,
    topics: ["Kepler's Laws of Planetary Motion", "Newton's Law of Universal Gravitation", 'Gravitational Constant G', 'Acceleration due to Gravity g', 'Variation of g with Height and Depth', 'Gravitational Potential Energy', 'Escape Speed', 'Orbital Speed of Satellites', 'Geostationary and Polar Satellites'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph108.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep308.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-phy-8', classLevel: 11, subject: 'Physics', chapterNumber: 9,
    title: 'Mechanical Properties of Solids',
    description: 'Understand why steel bridges hold weight and rubber bands stretch — elasticity, stress, strain, and Young\'s modulus.',
    marks: 4,
    topics: ['Elastic Behaviour of Solids', 'Stress and Strain', "Hooke's Law", "Young's Modulus", 'Bulk Modulus', 'Shear Modulus', 'Poisson\'s Ratio', 'Elastic Potential Energy', 'Applications of Elastic Behaviour'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph109.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep309.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-phy-9', classLevel: 11, subject: 'Physics', chapterNumber: 10,
    title: 'Mechanical Properties of Fluids',
    description: "Why ships float and planes fly — Archimedes' Principle, Bernoulli's theorem, and the science of fluids in motion.",
    marks: 4,
    topics: ['Pressure and Variation of Pressure with Depth', 'Pascal\'s Law', 'Atmospheric Pressure', 'Archimedes\' Principle and Buoyancy', 'Streamline and Turbulent Flow', 'Bernoulli\'s Theorem', 'Viscosity and Terminal Velocity', "Stokes' Law", 'Surface Tension', 'Capillary Rise'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph110.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep310.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-phy-10', classLevel: 11, subject: 'Physics', chapterNumber: 11,
    title: 'Thermal Properties of Matter',
    description: 'How heat moves through matter — thermal expansion, specific heat capacity, calorimetry, and the three modes of heat transfer.',
    marks: 5,
    topics: ['Temperature and Heat', 'Thermal Expansion (Linear, Area, Volume)', 'Anomalous Expansion of Water', 'Specific Heat Capacity', 'Calorimetry', 'Change of State: Latent Heat', 'Heat Transfer: Conduction', 'Heat Transfer: Convection', 'Heat Transfer: Radiation', "Newton's Law of Cooling"],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph111.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep311.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-phy-11', classLevel: 11, subject: 'Physics', chapterNumber: 12,
    title: 'Thermodynamics',
    description: 'The laws of heat, work, and energy — essential for both JEE and NEET. Understand engines, entropy, and spontaneous processes.',
    marks: 8,
    topics: ['Thermal Equilibrium and Zeroth Law', 'Heat, Internal Energy, and Work', 'First Law of Thermodynamics', 'Specific Heat Capacity', 'Thermodynamic Processes', 'Second Law of Thermodynamics', 'Reversible and Irreversible Processes', 'Carnot Engine and Efficiency', 'Refrigerators and Heat Pumps'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph112.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep312.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c11-phy-12', classLevel: 11, subject: 'Physics', chapterNumber: 13,
    title: 'Kinetic Theory',
    description: 'Connect macroscopic gas properties (Pressure, Volume, Temperature) to the microscopic motion of molecules.',
    marks: 5,
    topics: ['Molecular Nature of Matter', 'Behaviour of Gases: Gas Laws', 'Kinetic Theory of an Ideal Gas', 'Law of Equipartition of Energy', 'Specific Heat Capacity of Monoatomic, Diatomic Gases', 'Mean Free Path', 'RMS, Mean and Most Probable Speed', 'Degrees of Freedom'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph113.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep313.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-phy-13', classLevel: 11, subject: 'Physics', chapterNumber: 14,
    title: 'Oscillations',
    description: 'Simple harmonic motion — the most elegant concept in Physics, tested heavily in JEE with both theory and formula problems.',
    marks: 6,
    topics: ['Periodic and Oscillatory Motions', 'Simple Harmonic Motion (SHM)', 'SHM and Uniform Circular Motion', 'Velocity and Acceleration in SHM', 'Energy in SHM (PE and KE)', 'Simple Pendulum', 'Spring-Mass System', 'Damped Oscillations', 'Forced Oscillations', 'Resonance'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph114.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep314.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-phy-14', classLevel: 11, subject: 'Physics', chapterNumber: 15,
    title: 'Waves',
    description: "From sound waves to standing waves on a string — wave mechanics connects Physics with music, sonar, and the Doppler effect.",
    marks: 6,
    topics: ['Transverse and Longitudinal Waves', 'Displacement Relation in a Wave', 'Speed of a Transverse Wave', 'Speed of Sound', 'Principle of Superposition', 'Reflection of Waves', 'Standing Waves and Normal Modes', 'Beats', "Doppler Effect"],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/keph115.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/physics/keep315.pdf',
    examRelevance: ['Board', 'JEE'],
  },
];

// ============================================================
// CLASS 11 — CHEMISTRY (14 chapters)
// ============================================================

const class11Chemistry: Chapter[] = [
  {
    id: 'c11-chem-1', classLevel: 11, subject: 'Chemistry', chapterNumber: 1,
    title: 'Some Basic Concepts of Chemistry',
    description: 'The building blocks of Chemistry — moles, molarity, empirical formulas, and stoichiometry that you\'ll use every day.',
    marks: 5,
    topics: ['Importance of Chemistry', 'Laws of Chemical Combination', "Dalton's Atomic Theory", 'Atomic and Molecular Masses', 'Mole Concept and Avogadro Number', 'Empirical and Molecular Formula', 'Stoichiometry', 'Limiting Reagent', 'Concentration: Molarity and Molality'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech101.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep501.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c11-chem-2', classLevel: 11, subject: 'Chemistry', chapterNumber: 2,
    title: 'Structure of Atom',
    description: "Journey from Thomson's plum pudding to Bohr's model to quantum numbers — essential for understanding the periodic table.",
    marks: 8,
    topics: ["Thomson and Rutherford Models", "Bohr's Model of Hydrogen Atom", 'Quantum Mechanical Model', 'Orbitals and Quantum Numbers (n, l, m, s)', 'Shapes of s, p, d Orbitals', 'Aufbau Principle', "Pauli's Exclusion Principle", "Hund's Rule", 'Electronic Configuration of Elements', 'Anomalous Configurations (Cr, Cu)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech102.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep502.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c11-chem-3', classLevel: 11, subject: 'Chemistry', chapterNumber: 3,
    title: 'Classification of Elements and Periodicity in Properties',
    description: 'The modern periodic table — understand periodic trends in atomic radius, ionization energy, and electronegativity.',
    marks: 6,
    topics: ['Historical Development of Periodic Table', 'Modern Periodic Law', 'Nomenclature of Elements Z > 100', 'Electronic Configuration and Periodic Table', 'Periods and Groups', 'Atomic Radius and Ionic Radius', 'Ionization Enthalpy', 'Electron Gain Enthalpy', 'Electronegativity', 'Periodic Trends in Chemical Properties'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech103.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep503.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c11-chem-4', classLevel: 11, subject: 'Chemistry', chapterNumber: 4,
    title: 'Chemical Bonding and Molecular Structure',
    description: 'Why do atoms bond? From ionic to covalent bonds — VSEPR theory, hybridization, and molecular orbital theory.',
    marks: 9,
    topics: ['Kossel-Lewis Approach', 'Ionic Bond', 'Covalent Bond', 'Lewis Structures', 'Polar Covalent Bond', 'VSEPR Theory and Molecular Shapes', 'Valence Bond Theory', 'Hybridization: sp, sp², sp³', 'Molecular Orbital Theory', 'Hydrogen Bonding'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech104.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep504.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c11-chem-5', classLevel: 11, subject: 'Chemistry', chapterNumber: 5,
    title: 'States of Matter',
    description: 'Understand why gases, liquids, and solids behave differently using intermolecular forces and the gas laws.',
    marks: 5,
    topics: ['Intermolecular Forces', "Boyle's Law", "Charles' Law", "Gay-Lussac's Law", "Avogadro's Law", 'Ideal Gas Equation', "Dalton's Law of Partial Pressure", 'Kinetic Molecular Theory of Gases', 'Real Gases and van der Waals Equation', 'Liquid State: Vapour Pressure, Surface Tension, Viscosity'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech105.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep505.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-chem-6', classLevel: 11, subject: 'Chemistry', chapterNumber: 6,
    title: 'Thermodynamics',
    description: 'Predict whether reactions will occur spontaneously using Gibbs energy, enthalpy, and entropy.',
    marks: 8,
    topics: ['System and Surroundings', 'Types of Systems', 'State Functions', 'First Law of Thermodynamics', 'Enthalpy H', "Hess's Law of Constant Heat Summation", 'Bond Enthalpies', 'Entropy S', 'Second Law of Thermodynamics', 'Gibbs Free Energy and Spontaneity'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech106.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep506.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c11-chem-7', classLevel: 11, subject: 'Chemistry', chapterNumber: 7,
    title: 'Equilibrium',
    description: "When reactions don't go to completion — equilibrium constants, Le Chatelier's Principle, and ionic equilibrium.",
    marks: 8,
    topics: ['Equilibrium in Physical Processes', 'Equilibrium in Chemical Processes', 'Law of Chemical Equilibrium', 'Equilibrium Constant Kc and Kp', 'Relationship between Kp and Kc', "Le Chatelier's Principle", 'Ionic Equilibrium', 'Acid-Base Theories', 'pH and Buffer Solutions', 'Solubility Product (Ksp)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech107.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep507.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c11-chem-8', classLevel: 11, subject: 'Chemistry', chapterNumber: 8,
    title: 'Redox Reactions',
    description: 'Oxidation and reduction in depth — oxidation numbers and balancing by half-reaction method. Essential for electrochemistry.',
    marks: 5,
    topics: ['Classical Concept of Redox Reactions', 'Oxidation Number', 'Types of Redox Reactions', 'Balancing Redox Equations: Half-Reaction Method', 'Balancing Redox Equations: Oxidation Number Method', 'Redox Reactions and Electrode Processes'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech108.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep508.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-chem-9', classLevel: 11, subject: 'Chemistry', chapterNumber: 9,
    title: 'Hydrogen',
    description: 'The lightest and most abundant element — position in periodic table, isotopes, water, hydrogen peroxide, and hydrogen as fuel.',
    marks: 4,
    topics: ['Position of Hydrogen in Periodic Table', 'Isotopes of Hydrogen', 'Preparation of Dihydrogen', 'Properties of Dihydrogen', 'Hydrides: Ionic, Covalent and Metallic', 'Water: Structure and Properties', 'Hard and Soft Water', 'Hydrogen Peroxide (H₂O₂)', 'Hydrogen as a Fuel (Green Hydrogen)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech109.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep509.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-chem-10', classLevel: 11, subject: 'Chemistry', chapterNumber: 10,
    title: 'The s-Block Elements',
    description: 'Alkali and alkaline earth metals — their anomalous properties, important compounds, and uses in daily life.',
    marks: 5,
    topics: ['Group 1 Elements: Alkali Metals', 'Anomalous Properties of Lithium', 'General Properties of Alkali Metals', 'Compounds of Sodium (NaOH, Na₂CO₃, NaCl)', 'Biological Importance of Na and K', 'Group 2 Elements: Alkaline Earth Metals', 'Anomalous Properties of Beryllium', 'Compounds of Calcium', 'Cement', 'Biological Importance of Mg and Ca'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech110.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep510.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-chem-11', classLevel: 11, subject: 'Chemistry', chapterNumber: 11,
    title: 'The p-Block Elements (Groups 13 & 14)',
    description: 'Carbon group, boron group — allotropes, anomalous behaviour, and the chemistry of oxides, hydrides, and halides.',
    marks: 5,
    topics: ['Group 13: Boron Family', 'Anomalous Properties of Boron', 'Borax and Boric Acid', 'Diborane and Boron Hydrides', 'Aluminium and its Compounds', 'Group 14: Carbon Family', 'Allotropes of Carbon', 'Anomalous Behaviour of Carbon', 'Oxides of Carbon (CO, CO₂)', 'Silicon and its Compounds', 'Silicones'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech111.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep511.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-chem-12', classLevel: 11, subject: 'Chemistry', chapterNumber: 12,
    title: 'Organic Chemistry: Basic Principles and Techniques',
    description: 'The gateway to organic chemistry — IUPAC naming, isomerism, inductive effect, and reaction mechanisms (SN1, SN2).',
    marks: 8,
    topics: ['Tetravalency of Carbon', 'Structural Representations (Dash, Condensed, Line-Angle)', 'IUPAC Nomenclature', 'Isomerism (Structural and Stereoisomerism)', 'Inductive Effect', 'Resonance and Hyperconjugation', 'Carbocations, Carbanions, Free Radicals', 'Nucleophiles and Electrophiles', 'Types of Organic Reactions', 'Reaction Mechanisms'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech112.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep512.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c11-chem-13', classLevel: 11, subject: 'Chemistry', chapterNumber: 13,
    title: 'Hydrocarbons',
    description: 'Alkanes, alkenes, alkynes, and benzene — the building blocks of organic chemistry with their reactions and mechanisms.',
    marks: 10,
    topics: ['Classification of Hydrocarbons', 'Alkanes: Nomenclature and Free Radical Mechanism', 'Alkenes: Double Bond, E-Z Isomerism, Addition Reactions', 'Alkynes: Triple Bond, Acidic Character', 'Aromaticity and Benzene', 'Electrophilic Substitution in Benzene', 'Directive Influence of Substituents', 'Carcinogenicity and Toxicity', 'Conformational Analysis'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech113.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep513.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c11-chem-14', classLevel: 11, subject: 'Chemistry', chapterNumber: 14,
    title: 'Environmental Chemistry',
    description: 'The chemistry of pollution — air, water, and soil pollution, their causes, effects, and strategies for a cleaner future.',
    marks: 3,
    topics: ['Environmental Pollution', 'Atmospheric Pollution: Tropospheric', 'Smog (Classical and Photochemical)', 'Acid Rain', 'Greenhouse Effect and Global Warming', 'Ozone Layer Depletion', 'Water Pollution: Causes and Effects', 'Soil Pollution', 'Industrial Waste', 'Green Chemistry'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kech114.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/chemistry/keep514.pdf',
    examRelevance: ['Board', 'NEET'],
  },
];

// ============================================================
// CLASS 11 — BIOLOGY (22 chapters, key ones for NEET + Board)
// ============================================================

const class11Biology: Chapter[] = [
  {
    id: 'c11-bio-1', classLevel: 11, subject: 'Biology', chapterNumber: 1,
    title: 'The Living World',
    description: 'What makes something alive? Explore biodiversity, taxonomy, and the classification of all life on Earth.',
    marks: 4,
    topics: ['What is Living?', 'Diversity in the Living World', 'Taxonomic Categories (Species to Kingdom)', 'Taxonomical Aids', 'Herbarium, Zoological Parks, Museums', 'Two Kingdom Classification', 'Five Kingdom Classification (Whittaker)', 'Three Domains of Life'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo101.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep401.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-2', classLevel: 11, subject: 'Biology', chapterNumber: 2,
    title: 'Biological Classification',
    description: 'Five kingdoms explained — Monera, Protista, Fungi, Plantae, Animalia — with key features and examples you must know for NEET.',
    marks: 7,
    topics: ['Kingdom Monera: Bacteria Structure and Types', 'Archaebacteria and Eubacteria', 'Mycoplasma', 'Kingdom Protista: Chrysophytes, Dinoflagellates, Euglenoids, Slime Moulds, Protozoans', 'Kingdom Fungi: Structure, Reproduction, Phyla', 'Lichens', 'Kingdom Plantae', 'Kingdom Animalia', 'Viruses and Viroids'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo102.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep402.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-3', classLevel: 11, subject: 'Biology', chapterNumber: 3,
    title: 'Plant Kingdom',
    description: 'From algae to angiosperms — the complete classification of the plant kingdom with alternation of generations.',
    marks: 7,
    topics: ['Algae: Chlorophyceae, Phaeophyceae, Rhodophyceae', 'Bryophytes (Liverworts, Mosses)', 'Pteridophytes (Ferns)', 'Gymnosperms (Cycas, Pinus)', 'Angiosperms', 'Alternation of Generations', 'Plant Life Cycles', 'Economic Importance of Plants'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo103.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep403.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-4', classLevel: 11, subject: 'Biology', chapterNumber: 4,
    title: 'Animal Kingdom',
    description: 'Classify all animals from sponges to chordates using basis of classification — a very high NEET weightage chapter.',
    marks: 9,
    topics: ['Basis of Classification', 'Phylum Porifera (Sponges)', 'Phylum Cnidaria (Hydra, Jellyfish)', 'Phylum Platyhelminthes (Flatworms)', 'Phylum Aschelminthes (Roundworms)', 'Phylum Annelida (Earthworm)', 'Phylum Arthropoda (Insects, Prawn)', 'Phylum Mollusca, Echinodermata, Hemichordata', 'Phylum Chordata: Cyclostomata to Mammalia', 'Structural and Functional Features of Chordates'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo104.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep404.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-5', classLevel: 11, subject: 'Biology', chapterNumber: 5,
    title: 'Morphology of Flowering Plants',
    description: 'Understand the structure of roots, stems, leaves, flowers, and fruits — a must-know chapter for NEET with many diagram questions.',
    marks: 8,
    topics: ['Root: Morphology and Types', 'Stem: Morphology and Modifications', 'Leaf: Parts and Types', 'Inflorescence Types', 'Flower: Parts, Symmetry, Sexuality', 'Fruit Types', 'Seed Structure', 'Description of Families: Fabaceae, Solanaceae, Liliaceae'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo105.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep405.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-6', classLevel: 11, subject: 'Biology', chapterNumber: 6,
    title: 'Anatomy of Flowering Plants',
    description: 'The internal organization of plant tissues — meristematic, permanent, epidermal, vascular tissues and secondary growth.',
    marks: 6,
    topics: ['Plant Tissues: Meristematic and Permanent', 'Epidermal Tissue System', 'Ground Tissue System', 'Vascular Tissue System (Xylem and Phloem)', 'Anatomy of Dicot and Monocot Root', 'Anatomy of Dicot and Monocot Stem', 'Anatomy of Dicot and Monocot Leaf', 'Secondary Growth in Dicots'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo106.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep406.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-7', classLevel: 11, subject: 'Biology', chapterNumber: 7,
    title: 'Structural Organisation in Animals',
    description: 'Tissues, organs, and organ systems — understand the organisation of animal bodies, focusing on earthworm, cockroach, and frog.',
    marks: 6,
    topics: ['Animal Tissues: Epithelial, Connective, Muscular, Neural', 'Epithelial Tissue Types and Functions', 'Connective Tissue Types', 'Muscular and Neural Tissue', 'Morphology of Earthworm', 'Anatomy of Earthworm', 'Morphology of Cockroach', 'Anatomy of Cockroach', 'Frogs: External and Internal Features'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo107.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep407.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-8', classLevel: 11, subject: 'Biology', chapterNumber: 8,
    title: 'Cell: The Unit of Life',
    description: 'Prokaryotic vs eukaryotic cells, all organelles and their functions — the foundation of biology for NEET.',
    marks: 10,
    topics: ['Cell Theory', 'Prokaryotic Cell Structure', 'Eukaryotic Cell Structure', 'Cell Membrane (Fluid Mosaic Model)', 'Cell Wall', 'Endomembrane System: ER, Golgi, Lysosomes, Vacuoles', 'Mitochondria', 'Plastids (Chloroplasts, Leucoplasts, Chromoplasts)', 'Ribosomes, Centrosomes, Cilia, Flagella', 'Nucleus: Structure and Function'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo108.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep408.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-9', classLevel: 11, subject: 'Biology', chapterNumber: 9,
    title: 'Biomolecules',
    description: 'The molecules of life — carbohydrates, proteins, lipids, nucleic acids, and enzymes that power every living cell.',
    marks: 8,
    topics: ['How to Analyse Chemical Compositions in Living Tissue', 'Primary and Secondary Metabolites', 'Biomacromolecules: Polysaccharides (Starch, Cellulose, Glycogen)', 'Proteins: Structure, Amino Acids, Peptide Bond', 'Nucleic Acids: DNA and RNA Structure', 'Enzymes: Nature, Classification', 'Enzyme Action: Lock and Key, Induced Fit', 'Factors Affecting Enzyme Activity', 'Enzyme Inhibition'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo109.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep409.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-10', classLevel: 11, subject: 'Biology', chapterNumber: 10,
    title: 'Cell Cycle and Cell Division',
    description: 'How cells divide — mitosis for growth and repair, meiosis for reproduction. Know every stage with diagrams.',
    marks: 8,
    topics: ['Cell Cycle: Phases (G1, S, G2, M)', 'Mitosis: Prophase, Metaphase, Anaphase, Telophase', 'Cytokinesis', 'Significance of Mitosis', 'Meiosis: Meiosis I and Meiosis II', 'Prophase I (Leptotene, Zygotene, Pachytene, Diplotene, Diakinesis)', 'Crossing Over and Genetic Recombination', 'Significance of Meiosis'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo110.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep410.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-11', classLevel: 11, subject: 'Biology', chapterNumber: 11,
    title: 'Transport in Plants',
    description: 'How plants absorb water and minerals from soil and distribute them — osmosis, xylem transport, and phloem loading.',
    marks: 6,
    topics: ['Means of Transport: Diffusion, Facilitated Diffusion, Active Transport', 'Plant-Water Relations: Osmosis, Water Potential', 'Plasmolysis and Turgor', 'Absorption of Water by Roots', 'Uptake and Transport of Mineral Ions', 'Transpiration and Stomatal Transpiration', 'Ascent of Sap (Cohesion-Tension Theory)', 'Phloem Transport (Pressure Flow / Mass Flow Hypothesis)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo111.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep411.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-12', classLevel: 11, subject: 'Biology', chapterNumber: 12,
    title: 'Mineral Nutrition',
    description: 'Essential mineral elements for plants, their functions, deficiency symptoms, and nitrogen fixation — important for NEET.',
    marks: 5,
    topics: ['Methods to Study Mineral Requirements (Hydroponics)', 'Essential Mineral Elements: Macro and Micro Nutrients', 'Role of Macro Nutrients', 'Role of Micro Nutrients', 'Deficiency Symptoms of Mineral Nutrients', 'Mechanism of Absorption', 'Translocation of Minerals', 'Nitrogen Metabolism and Nitrogen Fixation', 'Biological Nitrogen Fixation (Rhizobium)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo112.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep412.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-13', classLevel: 11, subject: 'Biology', chapterNumber: 13,
    title: 'Photosynthesis in Higher Plants',
    description: 'How plants make food from sunlight — the complete story of light reactions, the Calvin cycle, and C4 plants for NEET.',
    marks: 9,
    topics: ['Early Experiments on Photosynthesis', 'Site of Photosynthesis', 'Photosynthetic Pigments', 'Light Reactions: Photosystems and ETS', 'Splitting of Water (Z-scheme)', 'Cyclic and Non-Cyclic Photophosphorylation', 'Calvin Cycle (C3 / Dark Reactions)', 'C4 Pathway (Hatch-Slack Pathway)', 'Photorespiration', 'Factors Affecting Photosynthesis'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo113.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep413.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-14', classLevel: 11, subject: 'Biology', chapterNumber: 14,
    title: 'Respiration in Plants',
    description: 'How all organisms break down glucose to release energy — glycolysis, Krebs cycle, and ETS explained step by step.',
    marks: 7,
    topics: ['Do Plants Breathe?', 'Glycolysis (EMP Pathway)', 'Anaerobic Respiration and Fermentation', 'Aerobic Respiration', 'Krebs Cycle (TCA Cycle)', 'Electron Transport System (ETS)', 'ATP Synthesis (Chemiosmosis)', 'Respiratory Quotient (RQ)', 'Amphibolic Pathway', 'Energy Balance Sheet'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo114.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep414.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-15', classLevel: 11, subject: 'Biology', chapterNumber: 15,
    title: 'Plant Growth and Development',
    description: 'How plants grow from a seed — growth phases, plant hormones (auxin, gibberellin, cytokinin), and photoperiodism.',
    marks: 5,
    topics: ['Growth: Characteristics and Types', 'Measurement of Growth', 'Growth Rate', 'Conditions for Growth', 'Differentiation, Dedifferentiation, Redifferentiation', 'Plant Growth Regulators: Auxin, Gibberellins, Cytokinins', 'Abscisic Acid (Stress Hormone)', 'Ethylene', 'Photoperiodism and Vernalisation'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo115.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep415.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-16', classLevel: 11, subject: 'Biology', chapterNumber: 16,
    title: 'Digestion and Absorption',
    description: 'The human digestive system in full detail — from mouth to large intestine, enzymes, and absorption of nutrients.',
    marks: 9,
    topics: ['Alimentary Canal: Mouth, Oesophagus, Stomach, Small Intestine, Large Intestine', 'Digestive Glands: Liver, Pancreas, Salivary Glands', 'Digestion of Carbohydrates', 'Digestion of Proteins', 'Digestion of Fats', 'Absorption of Nutrients', 'Disorders of the Digestive System (Constipation, Jaundice, Vomiting, Diarrhoea)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo116.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep416.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-17', classLevel: 11, subject: 'Biology', chapterNumber: 17,
    title: 'Breathing and Exchange of Gases',
    description: 'The human respiratory system — lungs, breathing mechanics, gas exchange, transport of oxygen and CO₂, and disorders.',
    marks: 8,
    topics: ['Respiratory Organs in Different Animals', 'Human Respiratory System: Lungs and Airways', 'Mechanism of Breathing (Inspiration and Expiration)', 'Respiratory Volumes and Capacities', 'Exchange of Gases (Alveolar Exchange)', 'Transport of Oxygen (Oxyhaemoglobin)', 'Oxygen Dissociation Curve', 'Transport of CO₂', 'Regulation of Respiration', 'Disorders: Asthma, Emphysema, Occupational Diseases'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo117.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep417.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-18', classLevel: 11, subject: 'Biology', chapterNumber: 18,
    title: 'Body Fluids and Circulation',
    description: 'Blood, lymph, and the human heart — cardiac cycle, ECG, and blood pressure. One of the most important NEET chapters.',
    marks: 9,
    topics: ['Blood Composition: Plasma, RBC, WBC, Platelets', 'Blood Groups (ABO System) and Rh Factor', 'Coagulation of Blood', 'Lymph', 'Open and Closed Circulatory Systems', 'Human Heart: Structure and Anatomy', 'Cardiac Cycle (Systole, Diastole)', 'Heart Sounds (Lub-Dub)', 'Electrocardiograph (ECG)', 'Double Circulation', 'Blood Pressure Regulation', 'Disorders: Heart Attack, Arteriosclerosis'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo118.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep418.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-19', classLevel: 11, subject: 'Biology', chapterNumber: 19,
    title: 'Excretory Products and their Elimination',
    description: 'How the body removes metabolic waste — kidneys, nephrons, urine formation, and role of other organs in excretion.',
    marks: 8,
    topics: ['Modes of Excretion: Ammonotelism, Ureotelism, Uricotelism', 'Human Excretory System: Kidneys, Ureters, Bladder, Urethra', 'Structure of Nephron', 'Urine Formation: Filtration, Reabsorption, Secretion', 'Counter Current Mechanism', 'Regulation of Kidney Function (ADH, Aldosterone, ANF, Renin-Angiotensin)', 'Micturition Reflex', 'Other Organs of Excretion: Lungs, Skin, Liver', 'Disorders: Uremia, Renal Failure, Dialysis, Kidney Transplant'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo119.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep419.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-20', classLevel: 11, subject: 'Biology', chapterNumber: 20,
    title: 'Locomotion and Movement',
    description: 'Types of movement, skeletal muscle structure, sliding filament theory, joints, and common skeletal disorders.',
    marks: 6,
    topics: ['Types of Movement: Ciliary, Flagellar, Amoeboid, Muscular', 'Structure of Skeletal Muscle (Sarcomere)', 'Sliding Filament Theory of Muscle Contraction', 'Mechanism of Muscle Contraction', 'Human Skeleton: Axial and Appendicular', 'Bones and Joints (Fibrous, Cartilaginous, Synovial)', 'Disorders: Myasthenia Gravis, Tetany, Muscular Dystrophy, Arthritis, Osteoporosis, Gout'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo120.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep420.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-21', classLevel: 11, subject: 'Biology', chapterNumber: 21,
    title: 'Neural Control and Coordination',
    description: 'The nervous system in detail — neuron structure, action potential, synaptic transmission, brain anatomy, and sense organs.',
    marks: 9,
    topics: ['Neural System Organisation', 'Neuron Structure: Axon, Dendrites, Myelin Sheath', 'Nerve Impulse: Resting Potential, Action Potential', 'Transmission Across Synapse (Neurotransmitters)', 'CNS: Brain (Forebrain, Midbrain, Hindbrain)', 'Spinal Cord', 'PNS: Somatic and Autonomic (SNS, PNS)', 'Reflex Action and Reflex Arc', 'Sensory Organs: Eye (Retina, Rods, Cones)', 'Ear (Cochlea, Organ of Corti)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo121.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep421.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c11-bio-22', classLevel: 11, subject: 'Biology', chapterNumber: 22,
    title: 'Chemical Coordination and Integration',
    description: 'The endocrine system — all glands, their hormones, and mechanisms of hormone action that appear in almost every NEET paper.',
    marks: 8,
    topics: ['Endocrine Glands and Hormones', 'Hypothalamus and Pituitary Gland (GH, TSH, ACTH, FSH, LH, Prolactin, ADH, Oxytocin)', 'Thyroid Gland (T₃, T₄, Calcitonin)', 'Parathyroid (PTH)', 'Adrenal Gland (Cortex: Glucocorticoids, Mineralocorticoids; Medulla: Adrenaline)', 'Pancreas (Insulin and Glucagon)', 'Gonads (Androgens, Estrogens, Progesterone)', 'Heart, Kidney and Gastrointestinal Hormones', 'Mechanism of Hormone Action'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kebo122.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep422.pdf',
    examRelevance: ['Board', 'NEET'],
  },
];

// ============================================================
// CLASS 11 — MATH (16 chapters)
// ============================================================

const class11Math: Chapter[] = [
  {
    id: 'c11-math-1', classLevel: 11, subject: 'Math', chapterNumber: 1,
    title: 'Sets',
    description: 'The foundation of modern mathematics — sets, subsets, operations, and Venn diagrams used across all of Class 11 and 12.',
    marks: 5,
    topics: ['Sets and their Representations', 'Empty Set, Finite and Infinite Sets', 'Equal Sets', 'Subsets and Power Set', 'Universal Set', 'Venn Diagrams', 'Operations: Union, Intersection, Difference, Complement', 'Laws of Set Operations', 'Practical Problems on Union and Intersection'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh101.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep201.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-math-2', classLevel: 11, subject: 'Math', chapterNumber: 2,
    title: 'Relations and Functions',
    description: 'Cartesian products, types of relations, and types of functions — connects sets to the rest of Class 11 and 12 Math.',
    marks: 6,
    topics: ['Ordered Pairs and Cartesian Product', 'Relations: Domain, Codomain, Range', 'Types of Relations: Reflexive, Symmetric, Transitive, Equivalence', 'Functions: Definition and Types', 'Domain and Range of Functions', 'Algebra of Functions', 'Identity, Constant, Modulus, Signum Functions', 'Piecewise Functions'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh102.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep202.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-math-3', classLevel: 11, subject: 'Math', chapterNumber: 3,
    title: 'Trigonometric Functions',
    description: 'Angles, identities, and graphs — trigonometry is the backbone of Class 12 calculus, coordinate geometry, and JEE.',
    marks: 9,
    topics: ['Angles: Degree and Radian Measure', 'Trigonometric Functions Definition', 'Signs and Values in Quadrants', 'Trigonometric Functions of Sum and Difference', 'Multiple Angle Formulas (2A, 3A)', 'Product-to-Sum and Sum-to-Product Formulas', 'Trigonometric Equations', 'Graphs of sin x, cos x, tan x', 'Inverse Trig (Preview)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh103.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep203.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-math-4', classLevel: 11, subject: 'Math', chapterNumber: 4,
    title: 'Principle of Mathematical Induction',
    description: 'Prove statements true for all natural numbers using induction — a logical and elegant proof technique.',
    marks: 4,
    topics: ['Motivation and Process of Proof by Induction', 'Proving Summation Formulas', 'Proving Divisibility Statements', 'Proving Inequality Statements', 'Applications of Mathematical Induction'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh104.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep204.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c11-math-5', classLevel: 11, subject: 'Math', chapterNumber: 5,
    title: 'Complex Numbers and Quadratic Equations',
    description: 'Enter the complex plane — imaginary numbers unlock solutions that real numbers cannot. Essential for JEE.',
    marks: 7,
    topics: ['Need for Complex Numbers', 'Algebraic Operations on Complex Numbers', 'Modulus and Conjugate of Complex Number', 'Argand Plane and Polar Form', 'Euler\'s Form (Preview)', 'Square Root of a Complex Number', 'Quadratic Equations with Complex Roots', 'Nature of Roots using Discriminant'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh105.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep205.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-math-6', classLevel: 11, subject: 'Math', chapterNumber: 6,
    title: 'Linear Inequalities',
    description: 'Solve and graph linear inequalities — the foundation for linear programming in Class 12.',
    marks: 4,
    topics: ['Inequalities: Introduction', 'Algebraic Solutions of Linear Inequalities in One Variable', 'Graphical Representation on Number Line', 'Graphical Solution of Linear Inequalities in Two Variables', 'Solution of System of Linear Inequalities in Two Variables'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh106.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep206.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-math-7', classLevel: 11, subject: 'Math', chapterNumber: 7,
    title: 'Permutations and Combinations',
    description: 'Count the arrangements and selections — from factorials to nCr, with applications in probability and JEE word problems.',
    marks: 7,
    topics: ['Fundamental Principle of Counting', 'Factorial Notation', 'Permutations: nPr Formula', 'Permutations with Repetition', 'Combinations: nCr Formula', 'Relationship between P and C', 'Combinations with Conditions', 'Real-World Applications'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh107.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep207.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-math-8', classLevel: 11, subject: 'Math', chapterNumber: 8,
    title: 'Binomial Theorem',
    description: "Expand (a+b)ⁿ using Pascal's triangle and binomial coefficients — middle term, general term, and applications.",
    marks: 6,
    topics: ["Pascal's Triangle", 'Binomial Theorem for Positive Integer n', 'Binomial Coefficients: Properties', 'General Term', 'Middle Term', 'Term Independent of x', 'Applications of Binomial Theorem'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh108.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep208.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-math-9', classLevel: 11, subject: 'Math', chapterNumber: 9,
    title: 'Sequences and Series',
    description: 'AP, GP, and special series — nth terms, sums, and the connection between arithmetic and geometric progressions.',
    marks: 8,
    topics: ['Sequences and Series: Definitions', 'Arithmetic Progression: nth Term and Sum', 'Arithmetic Mean', 'Geometric Progression: nth Term and Sum', 'Infinite GP: Sum to Infinity', 'Geometric Mean', 'Relationship between AM and GM', 'Special Series: Σn, Σn², Σn³'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh109.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep209.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-math-10', classLevel: 11, subject: 'Math', chapterNumber: 10,
    title: 'Straight Lines',
    description: 'Coordinate geometry of lines — slopes, various forms of equations, angle between lines, and distance formulas.',
    marks: 7,
    topics: ['Slope of a Line', 'Angle between Two Lines', 'Various Forms: Slope-intercept, Point-slope, Two-point, Intercept, Normal Form', 'General Equation of a Line', 'Distance of a Point from a Line', 'Locus Problems', 'Equation of Lines through Intersection of Two Lines'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh110.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep210.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-math-11', classLevel: 11, subject: 'Math', chapterNumber: 11,
    title: 'Conic Sections',
    description: 'Circles, parabolas, ellipses, and hyperbolas — the curves formed by cutting a cone. Very high JEE weightage.',
    marks: 9,
    topics: ['Sections of a Cone', 'Circle: Standard Form', 'Circle: General Equation', 'Parabola: Definition, Standard Forms, Focus, Directrix', 'Ellipse: Definition, Standard Forms, Major/Minor Axis, Eccentricity', 'Hyperbola: Definition, Standard Forms, Asymptotes'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh111.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep211.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-math-12', classLevel: 11, subject: 'Math', chapterNumber: 12,
    title: 'Introduction to Three-Dimensional Geometry',
    description: 'Extend coordinate geometry to 3D space — distance and section formulas in three dimensions.',
    marks: 5,
    topics: ['Coordinate Axes in 3D', 'Coordinate Planes in 3D', 'Coordinates of a Point in Space', 'Distance Formula in 3D', 'Section Formula in 3D', 'Centroid of a Triangle in 3D'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh112.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep212.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-math-13', classLevel: 11, subject: 'Math', chapterNumber: 13,
    title: 'Limits and Derivatives',
    description: 'The beginning of calculus — limits, continuity, and derivatives. The heart of JEE Math starts here.',
    marks: 10,
    topics: ['Intuitive Idea of Limits', 'Limits of Polynomials and Rational Functions', 'Limit of sin x / x as x → 0', 'Algebra of Limits', 'Derivatives: Definition using First Principle', 'Algebra of Derivatives', 'Derivatives of Polynomials', 'Derivatives of Trigonometric Functions', 'Product Rule and Quotient Rule'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh113.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep213.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c11-math-14', classLevel: 11, subject: 'Math', chapterNumber: 15,
    title: 'Statistics',
    description: 'Measures of dispersion — range, mean deviation, variance, standard deviation, and their role in data analysis.',
    marks: 6,
    topics: ['Measures of Dispersion', 'Range', 'Mean Deviation about Mean and Median', 'Variance and Standard Deviation', 'Standard Deviation of a Discrete Frequency Distribution', 'Analysis of Frequency Distributions', 'Coefficient of Variation', 'Comparison of Two Frequency Distributions'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh115.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep215.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c11-math-15', classLevel: 11, subject: 'Math', chapterNumber: 16,
    title: 'Probability',
    description: 'Classical probability — equally likely outcomes, events and their algebra, and addition rule of probability.',
    marks: 6,
    topics: ['Random Experiments', 'Event and its Types (Simple, Compound, Complementary)', 'Algebra of Events (Union, Intersection, Complement)', 'Axiomatic Approach to Probability', 'Addition Theorem', 'Mutually Exclusive Events', 'Equally Likely Outcomes'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/kemh116.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXI/mathematics/keep216.pdf',
    examRelevance: ['Board', 'JEE'],
  },
];

// ============================================================
// CLASS 12 — PHYSICS (14 chapters)
// ============================================================

const class12Physics: Chapter[] = [
  {
    id: 'c12-phy-1', classLevel: 12, subject: 'Physics', chapterNumber: 1,
    title: 'Electric Charges and Fields',
    description: "Coulomb's Law, electric field lines, and Gauss's Law — the gateway to all of Class 12 Physics.",
    marks: 8,
    topics: ['Electric Charge and its Properties', 'Conductors and Insulators', "Coulomb's Law", 'Forces Between Multiple Charges', 'Electric Field', 'Electric Field Lines', 'Electric Flux', "Gauss's Law", 'Field due to an Infinite Line Charge', 'Field due to a Plane Sheet and Conducting Shell'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph101.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep101.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-2', classLevel: 12, subject: 'Physics', chapterNumber: 2,
    title: 'Electrostatic Potential and Capacitance',
    description: 'Electric potential, equipotential surfaces, and capacitors — concepts found in every electronic device you use.',
    marks: 8,
    topics: ['Electric Potential', 'Potential due to a Point Charge', 'Potential due to a Dipole', 'Equipotential Surfaces', 'Relation between Field and Potential', 'Potential Energy of Charges in a Field', 'Conductors in Electrostatic Field', 'Capacitors and Capacitance', 'Parallel Plate Capacitor', 'Energy Stored in a Capacitor', 'Dielectrics and Polarisation'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph102.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep102.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-3', classLevel: 12, subject: 'Physics', chapterNumber: 3,
    title: 'Current Electricity',
    description: "Ohm's Law in depth, Kirchhoff's Laws, Wheatstone Bridge, and the Potentiometer — practical electricity for the real world.",
    marks: 7,
    topics: ['Electric Current', 'Ohm\'s Law', 'Drift Velocity and Mobility', 'Resistivity and Conductivity', 'Temperature Dependence of Resistance', "Kirchhoff's Laws (KCL and KVL)", 'Wheatstone Bridge', 'Meter Bridge', 'Potentiometer', 'Cells: EMF, Internal Resistance', 'Combination of Cells'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph103.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep103.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-4', classLevel: 12, subject: 'Physics', chapterNumber: 4,
    title: 'Moving Charges and Magnetism',
    description: 'The magnetic force on moving charges — basis of electric motors, galvanometers, cyclotrons, and MRI machines.',
    marks: 8,
    topics: ['Lorentz Force and Magnetic Force', 'Motion in Magnetic Field', 'Cyclotron', "Biot-Savart's Law", "Ampere's Circuital Law", 'Solenoid and Toroid', 'Force between Parallel Current-Carrying Conductors', 'Torque on a Current Loop', 'Galvanometer', 'Ammeter and Voltmeter'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph104.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep104.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-5', classLevel: 12, subject: 'Physics', chapterNumber: 5,
    title: 'Magnetism and Matter',
    description: 'Why magnets attract and how materials respond to magnetic fields — ferromagnetism, paramagnetism, and diamagnetism.',
    marks: 5,
    topics: ["Bar Magnet and Earth's Magnetic Field", 'Magnetic Field Lines', 'Torque on Magnetic Dipole', 'Gauss\'s Law in Magnetism', 'Earth\'s Magnetic Field and Magnetic Elements', 'Magnetisation and Magnetic Intensity', 'Magnetic Properties: Paramagnetic, Diamagnetic, Ferromagnetic', 'Hysteresis', 'Permanent Magnets and Electromagnets'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph105.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep105.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-6', classLevel: 12, subject: 'Physics', chapterNumber: 6,
    title: 'Electromagnetic Induction',
    description: "Faraday's discovery that changed the world — generate electricity from changing magnetic fields.",
    marks: 8,
    topics: ['Experiments of Faraday and Henry', "Faraday's Laws of Induction", "Lenz's Law", 'Motional EMF', 'Energy Consideration in Inductance', 'Eddy Currents', 'Self Inductance', 'Mutual Inductance', 'AC Generator'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph106.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep106.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-7', classLevel: 12, subject: 'Physics', chapterNumber: 7,
    title: 'Alternating Current',
    description: 'AC circuits with R, L, C — resonance, power factor, and transformers. The Physics of everything that plugs into a wall.',
    marks: 7,
    topics: ['AC Voltage Applied to a Resistor', 'AC Voltage Applied to a Capacitor', 'AC Voltage Applied to an Inductor', 'LCR Series Circuit', 'Impedance and Phasors', 'Resonance (Series and Parallel)', 'Power in AC Circuit', 'Power Factor', 'LC Oscillations', 'Transformers'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph107.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep107.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-8', classLevel: 12, subject: 'Physics', chapterNumber: 8,
    title: 'Electromagnetic Waves',
    description: 'The electromagnetic spectrum — from radio waves to gamma rays. Understand Maxwell\'s equations and properties of EM waves.',
    marks: 5,
    topics: ["Maxwell's Equations (Conceptual)", 'Displacement Current', 'Electromagnetic Waves: Properties', 'Electromagnetic Spectrum (Radio, Microwave, IR, Visible, UV, X-ray, Gamma)', 'Uses of EM Waves in Daily Life', 'Speed of EM Waves in Vacuum'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph108.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep108.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-9', classLevel: 12, subject: 'Physics', chapterNumber: 9,
    title: 'Ray Optics and Optical Instruments',
    description: 'Lenses, mirrors, prisms, and telescopes — a chapter full of formula-based problems popular in JEE.',
    marks: 8,
    topics: ['Reflection at Plane and Spherical Surfaces', 'Mirror Formula', 'Refraction at Plane and Spherical Surfaces', 'Lens Maker\'s Equation', 'Power of a Lens', 'Prism and Dispersion', 'Refraction through a Prism', 'Total Internal Reflection and Optical Fibre', 'Optical Instruments: Simple Microscope, Compound Microscope, Telescope'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph109.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep109.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-10', classLevel: 12, subject: 'Physics', chapterNumber: 10,
    title: 'Wave Optics',
    description: 'Light as a wave — interference, diffraction, and polarization explain phenomena that ray optics cannot.',
    marks: 6,
    topics: ['Huygens Principle', 'Reflection and Refraction using Huygens Principle', "Young's Double Slit Experiment (YDSE)", 'Conditions for Interference', 'Diffraction at a Single Slit', "Resolving Power", 'Polarisation', "Brewster's Law", 'Malus\'s Law', 'Polaroids and Uses'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph110.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep110.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-11', classLevel: 12, subject: 'Physics', chapterNumber: 11,
    title: 'Dual Nature of Radiation and Matter',
    description: 'Wave-particle duality — the photoelectric effect that earned Einstein the Nobel Prize, and de Broglie\'s hypothesis.',
    marks: 7,
    topics: ['Electron Emission: Work Function', 'Photoelectric Effect: Observations', "Einstein's Photoelectric Equation", 'Particle Nature of Light: The Photon', 'Photoelectric Effect in Technology', 'Wave Nature of Matter', "de Broglie's Hypothesis (λ = h/mv)", "Davisson and Germer Experiment"],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph111.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep111.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-12', classLevel: 12, subject: 'Physics', chapterNumber: 12,
    title: 'Atoms',
    description: "From Rutherford's gold foil experiment to Bohr's model — atomic structure and hydrogen spectrum explained.",
    marks: 5,
    topics: ["Alpha-Particle Scattering Experiment", "Rutherford's Nuclear Model", "Bohr's Postulates", "Bohr's Model: Energies and Radii", 'Hydrogen Spectrum (Balmer, Lyman, Paschen Series)', "de Broglie's Explanation of Bohr's Second Postulate", 'Limitations of Bohr\'s Model'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph112.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep112.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-13', classLevel: 12, subject: 'Physics', chapterNumber: 13,
    title: 'Nuclei',
    description: 'Nuclear forces, radioactivity, fission, and fusion — the Physics behind nuclear power plants and nuclear medicine.',
    marks: 6,
    topics: ['Atomic Masses and Composition of Nucleus', 'Size of the Nucleus', 'Nuclear Force', 'Mass-Energy Equivalence (E = mc²)', 'Nuclear Binding Energy', 'Radioactivity: Alpha, Beta, Gamma Decay', 'Radioactive Decay Law and Half-Life', 'Activity', 'Nuclear Fission and Chain Reaction', 'Nuclear Reactor', 'Nuclear Fusion'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph113.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep113.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-phy-14', classLevel: 12, subject: 'Physics', chapterNumber: 14,
    title: 'Semiconductor Electronics',
    description: 'Diodes, transistors, logic gates — the Physics that drives every computer, phone, and electronic device.',
    marks: 7,
    topics: ['Energy Bands: Conductors, Insulators, Semiconductors', 'Intrinsic Semiconductor', 'Extrinsic Semiconductor: n-type and p-type', 'p-n Junction Formation', 'p-n Junction Diode', 'Rectifier (Half-wave and Full-wave)', 'Zener Diode as Voltage Regulator', 'Transistor: NPN and PNP', 'Transistor as Amplifier and Switch', 'Logic Gates: AND, OR, NOT, NAND, NOR'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/leph114.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/physics/leep114.pdf',
    examRelevance: ['Board', 'JEE'],
  },
];

// ============================================================
// CLASS 12 — CHEMISTRY (16 chapters)
// ============================================================

const class12Chemistry: Chapter[] = [
  {
    id: 'c12-chem-1', classLevel: 12, subject: 'Chemistry', chapterNumber: 1,
    title: 'The Solid State',
    description: 'Why is diamond hard and graphite soft? Understand crystal structures, unit cells, packing efficiency, and defects in solids.',
    marks: 4,
    topics: ['Amorphous and Crystalline Solids', 'Classification of Crystalline Solids', 'Crystal Lattices and Unit Cells', 'Number of Atoms in a Unit Cell', 'Close Packed Structures (HCP, CCP)', 'Packing Efficiency', 'Calculation of Density', 'Imperfections in Solids: Point Defects', 'Electrical and Magnetic Properties'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech101.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep501.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-chem-2', classLevel: 12, subject: 'Chemistry', chapterNumber: 2,
    title: 'Solutions',
    description: "Concentration, colligative properties, and van't Hoff factor — solutions are everywhere in Chemistry and Biology.",
    marks: 5,
    topics: ['Types of Solutions', 'Expressing Concentration', "Solubility and Henry's Law", "Vapour Pressure: Raoult's Law", 'Ideal and Non-Ideal Solutions', 'Colligative Properties', 'Elevation of Boiling Point', 'Depression in Freezing Point', 'Osmosis and Osmotic Pressure', "van't Hoff Factor"],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech102.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep502.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-chem-3', classLevel: 12, subject: 'Chemistry', chapterNumber: 3,
    title: 'Electrochemistry',
    description: 'Batteries, electrolysis, and corrosion — the science that connects Chemistry to electrical energy.',
    marks: 5,
    topics: ['Electrochemical Cells', 'Galvanic Cells', 'Standard Electrode Potential', 'Nernst Equation', 'EMF of a Cell', 'Electrolytic Cells', "Faraday's Laws of Electrolysis", 'Products of Electrolysis', 'Conductance of Electrolytic Solutions', 'Batteries: Primary and Secondary', 'Fuel Cells', 'Corrosion'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech103.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep503.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-chem-4', classLevel: 12, subject: 'Chemistry', chapterNumber: 4,
    title: 'Chemical Kinetics',
    description: 'How fast do reactions go? Rate laws, activation energy, and catalysis — key for understanding reaction mechanisms.',
    marks: 5,
    topics: ['Rate of a Reaction', 'Factors Affecting Rate', 'Order and Molecularity of Reaction', 'Integrated Rate Equations (Zero, First, Second Order)', 'Half-Life of a Reaction', 'Temperature Dependence: Arrhenius Equation', 'Activation Energy', 'Collision Theory of Reaction Rates'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech104.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep504.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-chem-5', classLevel: 12, subject: 'Chemistry', chapterNumber: 5,
    title: 'Surface Chemistry',
    description: 'What happens at surfaces — adsorption, catalysis, colloids, emulsions, and their applications in industry and medicine.',
    marks: 4,
    topics: ['Adsorption: Physisorption and Chemisorption', 'Factors Affecting Adsorption', 'Adsorption Isotherms', 'Catalysis: Homogeneous and Heterogeneous', 'Enzyme Catalysis', 'Colloids and their Classification', 'Preparation and Properties of Colloids', 'Tyndall Effect and Brownian Movement', 'Electrophoresis and Coagulation', 'Emulsions'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech105.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep505.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-chem-6', classLevel: 12, subject: 'Chemistry', chapterNumber: 6,
    title: 'General Principles and Processes of Isolation of Elements',
    description: 'How metals are extracted from ores using thermodynamic principles — the science behind the steel in your phone.',
    marks: 7,
    topics: ['Occurrence of Metals', 'Concentration of Ores', 'Extraction of Crude Metal from Ore', 'Thermodynamic Principles of Metallurgy', 'Ellingham Diagram', 'Electrochemical Principles of Metallurgy', 'Oxidation Reduction in Metallurgy', 'Refining', 'Extraction of Aluminium (Baeyer Process)', 'Extraction of Copper and Zinc', 'Extraction of Iron (Blast Furnace)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech106.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep506.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-chem-7', classLevel: 12, subject: 'Chemistry', chapterNumber: 7,
    title: 'The p-Block Elements (Groups 15, 16, 17, 18)',
    description: 'Nitrogen, Oxygen, Halogens, and Noble Gases — their allotropes, oxoacids, and unique properties.',
    marks: 7,
    topics: ['Group 15: Nitrogen Family — N₂, NH₃, HNO₂, HNO₃', 'Allotropes of Phosphorus', 'Group 16: Oxygen Family — O₂, O₃, SO₂, SO₃, H₂SO₄', 'Group 17: Halogens — F₂, Cl₂, HF, HCl, Bleaching Powder', 'Interhalogen Compounds', 'Group 18: Noble Gases — Helium to Radon, Compounds of Xenon'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech107.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep507.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-chem-8', classLevel: 12, subject: 'Chemistry', chapterNumber: 8,
    title: 'The d and f Block Elements',
    description: 'Transition metals and lanthanoids — their unique properties, coloured compounds, and catalytic behaviour.',
    marks: 5,
    topics: ['Position in Periodic Table', 'Electronic Configuration of d-Block', 'General Properties: Atomic Radii, Ionisation Enthalpies', 'Variable Oxidation States', 'Complex Formation', 'Coloured Compounds', 'Magnetic Properties', 'Catalytic Properties', 'Interstitial Compounds and Alloys', 'Lanthanoids and Actinoids: Properties'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech108.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep508.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-chem-9', classLevel: 12, subject: 'Chemistry', chapterNumber: 9,
    title: 'Coordination Compounds',
    description: "Werner's theory, IUPAC naming, isomerism in complex compounds — highest JEE Chemistry weightage in inorganic Chemistry.",
    marks: 7,
    topics: ["Werner's Theory", 'Definitions: Ligands, Coordination Number, Coordination Sphere', 'IUPAC Nomenclature of Coordination Compounds', 'Isomerism: Structural and Stereoisomerism', 'Bonding: Valence Bond Theory', 'Crystal Field Theory', 'Colour and Magnetic Properties of Complexes', 'Stability Constants', 'Importance: Medical, Analytical, Industrial'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech109.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep509.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-chem-10', classLevel: 12, subject: 'Chemistry', chapterNumber: 10,
    title: 'Haloalkanes and Haloarenes',
    description: 'Organic halogen compounds — reaction mechanisms (SN1, SN2), elimination, and environmental significance.',
    marks: 5,
    topics: ['Classification and IUPAC Nomenclature', 'Nature of C–X Bond', 'Methods of Preparation', 'Physical Properties', 'Chemical Reactions of Haloalkanes', 'SN1 and SN2 Mechanisms', 'Stereochemistry of SN Reactions', 'Reactions of Haloarenes', 'Polyhalogen Compounds (DDT, CHCl₃, CCl₄)', 'Uses and Environmental Effects'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech110.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep510.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c12-chem-11', classLevel: 12, subject: 'Chemistry', chapterNumber: 11,
    title: 'Alcohols, Phenols and Ethers',
    description: 'The hydroxyl functional group in action — from hand sanitiser (ethanol) to antiseptics (phenol).',
    marks: 5,
    topics: ['Classification and Nomenclature', 'Preparation of Alcohols', 'Physical Properties of Alcohols', 'Chemical Reactions of Alcohols', 'Preparation and Properties of Phenols', 'Acidity of Phenols', 'Reactions of Phenols', 'Preparation and Properties of Ethers', 'Uses of Alcohols, Phenols and Ethers'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech111.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep511.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c12-chem-12', classLevel: 12, subject: 'Chemistry', chapterNumber: 12,
    title: 'Aldehydes, Ketones and Carboxylic Acids',
    description: 'The carbonyl group — nucleophilic addition, aldol condensation, and the acidity of carboxylic acids.',
    marks: 5,
    topics: ['Nomenclature of Aldehydes and Ketones', 'Preparation Methods', 'Physical Properties', 'Nucleophilic Addition Reactions', 'Aldol Condensation', 'Cannizzaro Reaction', 'Carboxylic Acids: Nomenclature and Preparation', 'Acidity of Carboxylic Acids', 'Reactions of Carboxylic Acids (RCOX, RCOOR, RCONH₂)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech112.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep512.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c12-chem-13', classLevel: 12, subject: 'Chemistry', chapterNumber: 13,
    title: 'Amines',
    description: 'Nitrogen-containing organic compounds — classification, basicity, diazonium salts, and coupling reactions.',
    marks: 5,
    topics: ['Structure and Classification of Amines', 'IUPAC Nomenclature', 'Preparation of Amines', 'Physical Properties', 'Chemical Reactions of Amines', 'Basicity of Amines (Comparison)', 'Diazonium Salts: Preparation', 'Chemical Reactions of Diazonium Salts', 'Coupling Reaction', 'Importance in Synthesis'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech113.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep513.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c12-chem-14', classLevel: 12, subject: 'Chemistry', chapterNumber: 14,
    title: 'Biomolecules',
    description: 'Carbohydrates, proteins, nucleic acids, and vitamins — the molecules that make up and power every living being.',
    marks: 4,
    topics: ['Carbohydrates: Classification, Structures', 'Glucose and Fructose Structures', 'Polysaccharides (Starch, Cellulose, Glycogen)', 'Proteins: Amino Acids (Essential and Non-Essential)', 'Peptide Bond and Polypeptides', 'Structure of Proteins (Primary to Quaternary)', 'Enzymes', 'Vitamins: Fat-soluble and Water-soluble', 'Nucleic Acids: DNA and RNA', 'Hormones'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech114.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep514.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c12-chem-15', classLevel: 12, subject: 'Chemistry', chapterNumber: 15,
    title: 'Polymers',
    description: 'From nylon to DNA — natural and synthetic polymers, their classification, and the chemistry behind everyday plastics.',
    marks: 3,
    topics: ['Classification of Polymers', 'Types of Polymerisation: Addition and Condensation', 'Natural Rubber and Vulcanisation', 'Synthetic Rubber (Buna-S, Buna-N, Neoprene)', 'Fibres: Nylon-6,6, Nylon-6, Polyester', 'Thermoplastics vs Thermosetting Polymers', 'Polythene, Bakelite, Melamine', 'Biodegradable Polymers', 'Polymers in Daily Life'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech115.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep515.pdf',
    examRelevance: ['Board', 'JEE', 'NEET'],
  },
  {
    id: 'c12-chem-16', classLevel: 12, subject: 'Chemistry', chapterNumber: 16,
    title: 'Chemistry in Everyday Life',
    description: 'How chemistry saves and improves lives — drugs, food preservatives, soaps, and cleansing agents explained.',
    marks: 3,
    topics: ['Drugs and their Classification', 'Drug-Target Interaction', 'Therapeutic Action of Drugs', 'Analgesics, Antibiotics, Antiseptics, Disinfectants', 'Antacids and Antihistamines', 'Chemicals in Food: Preservatives, Artificial Sweeteners, Antioxidants', 'Soaps: Structure and Cleansing Action', 'Synthetic Detergents', 'Biodegradability of Detergents'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lech116.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep516.pdf',
    examRelevance: ['Board', 'NEET'],
  },
];

// ============================================================
// CLASS 12 — BIOLOGY (16 chapters)
// ============================================================

const class12Biology: Chapter[] = [
  {
    id: 'c12-bio-1', classLevel: 12, subject: 'Biology', chapterNumber: 1,
    title: 'Reproduction in Organisms',
    description: 'The basics of reproduction — why organisms reproduce, asexual and sexual modes, and the concept of lifespan.',
    marks: 6,
    topics: ['Life Span of Organisms', 'Asexual Reproduction: Binary Fission, Budding, Fragmentation, Vegetative Propagation', 'Parthenogenesis', 'Sexual Reproduction: Events', 'Pre-Fertilisation Events: Gametogenesis', 'Gametes: Male and Female', 'Types of Fertilisation', 'Post-Fertilisation: Zygote to Embryo'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo101.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep401.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-2', classLevel: 12, subject: 'Biology', chapterNumber: 2,
    title: 'Sexual Reproduction in Flowering Plants',
    description: 'From pollen to seed — the complete reproductive cycle of flowering plants. High NEET diagram-based question chapter.',
    marks: 10,
    topics: ['Flower: A Fascinating Organ of Angiosperms', 'Microsporogenesis and Pollen Grain Structure', 'Pistil: Megasporogenesis', 'Female Gametophyte (Embryo Sac)', 'Pollination: Self and Cross', 'Outbreeding Devices', 'Pollen-Pistil Interaction', 'Artificial Hybridisation', 'Double Fertilisation', 'Post-Fertilisation: Endosperm, Embryo, Seed, Fruit', 'Apomixis and Polyembryony'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo102.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep402.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-3', classLevel: 12, subject: 'Biology', chapterNumber: 3,
    title: 'Human Reproduction',
    description: 'The male and female reproductive systems, gametogenesis, fertilisation, implantation, and embryo development.',
    marks: 9,
    topics: ['Male Reproductive System: Testes, Accessory Glands', 'Spermatogenesis', 'Female Reproductive System: Ovaries, Uterus', 'Oogenesis', 'Menstrual Cycle', 'Fertilisation and Implantation', 'Pregnancy and Placenta', 'Embryonic Development (Cleavage to Organogenesis)', 'Parturition and Lactation'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo103.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep403.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-4', classLevel: 12, subject: 'Biology', chapterNumber: 4,
    title: 'Reproductive Health',
    description: 'Family planning, contraception, STDs, amniocentesis, and infertility — reproductive health in the modern world.',
    marks: 5,
    topics: ['Reproductive Health: Problems and Strategies', 'Population Stabilisation and Birth Control', 'Contraceptive Methods: Barrier, Oral, Intrauterine', 'Medical Termination of Pregnancy (MTP)', 'Sexually Transmitted Infections (STIs/STDs)', 'Infertility', 'Assisted Reproductive Technologies: IVF, ZIFT, GIFT, IUI', 'Amniocentesis'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo104.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep404.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-5', classLevel: 12, subject: 'Biology', chapterNumber: 5,
    title: 'Principles of Inheritance and Variation',
    description: "Mendelian genetics, chromosomal theory, linkage, mutations — the rules that govern how traits are inherited.",
    marks: 10,
    topics: ["Mendel's Laws of Inheritance", 'Dominance, Recessiveness', 'Inheritance of Two Genes: Independent Assortment', 'Chromosomal Theory of Inheritance', 'Linkage and Recombination', 'Polygenic Inheritance', 'Sex Determination: XX-XY', 'Mutations: Point Mutations, Chromosomal Aberrations', 'Genetic Disorders: Haemophilia, Sickle Cell Anaemia, Colour Blindness', 'Chromosomal Disorders: Down Syndrome, Turner, Klinefelter'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo105.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep405.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-6', classLevel: 12, subject: 'Biology', chapterNumber: 6,
    title: 'Molecular Basis of Inheritance',
    description: 'DNA structure, replication, transcription, translation — the central dogma that governs all of molecular biology.',
    marks: 10,
    topics: ['DNA as Genetic Material (Hershey-Chase, Griffith Experiment)', 'DNA Double Helix Structure', 'DNA Packaging (Nucleosome, Chromatin)', 'DNA Replication (Semi-Conservative, Meselson-Stahl)', 'Transcription: Template Strand, mRNA', 'Genetic Code: Codons, Degeneracy', 'Translation: Ribosomes, tRNA, Polypeptide Synthesis', 'Gene Regulation: Lac Operon', 'Human Genome Project', 'DNA Fingerprinting'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo106.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep406.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-7', classLevel: 12, subject: 'Biology', chapterNumber: 7,
    title: 'Evolution',
    description: "From the origin of life to Darwin's theory and human evolution — the story of how life on Earth diversified over billions of years.",
    marks: 6,
    topics: ['Origin of Life: Oparin-Haldane Theory', 'Miller-Urey Experiment', 'Evolution of Life on Earth: Geological Time Scale', 'Evidences for Evolution: Fossils, Homology, Analogous Organs', "Darwin's Theory of Natural Selection", 'Mechanism of Evolution: Mutation, Genetic Drift', 'Hardy-Weinberg Principle', 'Origin and Evolution of Man', 'Adaptive Radiation'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo107.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep407.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-8', classLevel: 12, subject: 'Biology', chapterNumber: 8,
    title: 'Human Health and Disease',
    description: 'Pathogens, immunity, cancer, and AIDS — understanding disease is the first step to becoming a doctor.',
    marks: 8,
    topics: ['Common Diseases: Typhoid, Pneumonia, Common Cold, Malaria, Dengue, Chikungunya, Amoebiasis, Ascariasis, Elephantiasis', 'Innate and Acquired Immunity', 'Active and Passive Immunity', 'Vaccination and Immunisation', 'Allergy and Autoimmune Diseases', 'Immune System: Lymphoid Organs, Antibodies', 'AIDS: Cause, Transmission, Treatment', 'Cancer: Types, Carcinogens, Diagnosis, Treatment', 'Drugs and Alcohol Abuse'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo108.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep408.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-9', classLevel: 12, subject: 'Biology', chapterNumber: 9,
    title: 'Strategies for Enhancement in Food Production',
    description: 'How science increases food production — plant breeding, biofortification, SCP, and tissue culture techniques.',
    marks: 5,
    topics: ['Plant Breeding: Steps and Objectives', 'Green Revolution: Semi-Dwarf Varieties', 'Plant Breeding for Disease Resistance', 'Mutation Breeding', 'Polyploidy Breeding', 'Biofortification', 'Single Cell Protein (SCP)', 'Animal Husbandry: Cattle, Poultry, Fish Farming', 'Apiculture', 'Plant Tissue Culture: Somatic Hybridisation'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo109.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep409.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-10', classLevel: 12, subject: 'Biology', chapterNumber: 10,
    title: 'Microbes in Human Welfare',
    description: 'Bacteria and fungi working FOR us — fermentation, antibiotics, biogas, bioremediation, and the microbes that feed the world.',
    marks: 5,
    topics: ['Microbes in Household Products (Curd, Bread, Idli)', 'Microbes in Industrial Products: Fermented Beverages', 'Microbes in Antibiotics (Penicillin, Streptomycin, Tetracycline)', 'Microbes in Sewage Treatment', 'Microbes in Biogas Production', 'Microbes as Biocontrol Agents (Bt toxin, Trichoderma)', 'Microbes as Biofertilisers (Rhizobium, Azobacter, Mycorrhiza)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo110.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep410.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-11', classLevel: 12, subject: 'Biology', chapterNumber: 11,
    title: 'Biotechnology: Principles and Processes',
    description: 'Recombinant DNA technology, PCR, gel electrophoresis, and cloning vectors — the tools of modern biology.',
    marks: 7,
    topics: ['Principles of Biotechnology: Genetic Engineering and Bioprocess Technology', 'Tools of Recombinant DNA Technology', 'Restriction Enzymes (EcoRI, BamHI)', 'Cloning Vectors (Plasmids, Phages, Cosmids)', 'Competent Host', 'Recombinant DNA Technology: PCR', 'Gel Electrophoresis', 'Blotting Techniques (Southern, Northern, Western)', 'Bioreactors'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo111.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep411.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-12', classLevel: 12, subject: 'Biology', chapterNumber: 12,
    title: 'Biotechnology and its Applications',
    description: 'How biotechnology solves real problems — Bt crops, golden rice, gene therapy, and ethical issues of GMOs.',
    marks: 6,
    topics: ['Biotechnological Applications in Agriculture: Bt Crops', 'RNA Interference (RNAi)', 'Biotechnological Applications in Medicine', 'Insulin Production (Eli Lilly)', 'Gene Therapy', 'Molecular Diagnosis (ELISA, PCR Diagnostics)', 'Transgenic Animals', 'Ethical Issues of GMO', 'Patent and Biopiracy'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo112.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep412.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-13', classLevel: 12, subject: 'Biology', chapterNumber: 13,
    title: 'Organisms and Populations',
    description: 'How organisms interact with their environment — population growth, ecological adaptations, and inter-species relationships.',
    marks: 7,
    topics: ['Organism and its Environment: Abiotic Factors', 'Responses to Abiotic Factors: Regulators, Conformers', 'Adaptation: Desert, Alpine, Aquatic', 'Population Attributes: Birth Rate, Death Rate, Age Pyramid', 'Population Growth: Exponential and Logistic Growth', 'Life History Variation', 'Population Interactions: Predation, Competition, Parasitism, Commensalism, Mutualism', 'Amensalism'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo113.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep413.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-14', classLevel: 12, subject: 'Biology', chapterNumber: 14,
    title: 'Ecosystem',
    description: 'How energy flows and nutrients cycle through ecosystems — food chains, pyramids of numbers/biomass, and ecological succession.',
    marks: 7,
    topics: ['Ecosystem: Structure and Function', 'Productivity: Primary and Secondary', 'Decomposition', 'Energy Flow in Ecosystem', 'Food Chain and Food Web', 'Ecological Pyramids (Number, Biomass, Energy)', '10% Law of Energy Transfer', 'Biogeochemical Cycles: Carbon, Phosphorus', 'Ecosystem Services', 'Ecological Succession: Primary and Secondary'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo114.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep414.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-15', classLevel: 12, subject: 'Biology', chapterNumber: 15,
    title: 'Biodiversity and Conservation',
    description: 'Why biodiversity matters and how we protect it — hotspots, extinction threats, sacred groves, and biosphere reserves.',
    marks: 6,
    topics: ['Biodiversity: Genetic, Species, Ecological', 'Patterns of Biodiversity', 'Importance of Biodiversity', 'Loss of Biodiversity: Causes (HIPPO)', 'Biodiversity Conservation: In-situ and Ex-situ', 'Biosphere Reserves, National Parks, Wildlife Sanctuaries', 'Sacred Groves', 'Hotspots of Biodiversity (India)', 'IUCN Red List Categories', 'Cryopreservation and Seed Banks'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo115.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep415.pdf',
    examRelevance: ['Board', 'NEET'],
  },
  {
    id: 'c12-bio-16', classLevel: 12, subject: 'Biology', chapterNumber: 16,
    title: 'Environmental Issues',
    description: 'Pollution, global warming, deforestation — the environmental problems we created and what we can do about them.',
    marks: 4,
    topics: ['Air Pollution and its Control', 'Water Pollution and its Control', 'Solid Waste Management', 'Agro-Chemicals and their Effects', 'Radioactive Waste', 'Greenhouse Effect and Climate Change', 'Ozone Layer Depletion', 'Deforestation: Causes and Effects', 'Forest Conservation: Chipko Movement', 'Environmental Movements in India'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lebo116.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/biology/leep416.pdf',
    examRelevance: ['Board', 'NEET'],
  },
];

// ============================================================
// CLASS 12 — MATH (13 chapters)
// ============================================================

const class12Math: Chapter[] = [
  {
    id: 'c12-math-1', classLevel: 12, subject: 'Math', chapterNumber: 1,
    title: 'Relations and Functions',
    description: 'Types of relations, types of functions (bijective, surjective), inverse functions, and binary operations.',
    marks: 8,
    topics: ['Types of Relations: Reflexive, Symmetric, Transitive, Equivalence', 'Types of Functions: One-to-one (Injective), Onto (Surjective), Bijective', 'Composition of Functions', 'Invertible Functions and their Inverses', 'Binary Operations', 'Properties of Binary Operations'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh101.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep201.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-math-2', classLevel: 12, subject: 'Math', chapterNumber: 2,
    title: 'Inverse Trigonometric Functions',
    description: 'The inverse of sine, cosine, tangent — their principal values, domains, ranges, and important identities for JEE.',
    marks: 6,
    topics: ['Basic Concepts and Need for Inverse Trig', 'Domain and Range of sin⁻¹, cos⁻¹, tan⁻¹, etc.', 'Graphs of Inverse Trig Functions', 'Properties and Identities', 'Principal Value Branch', 'Simplification Problems'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh102.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep202.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-math-3', classLevel: 12, subject: 'Math', chapterNumber: 3,
    title: 'Matrices',
    description: 'Rectangular arrays of numbers — matrix operations, special matrices, and elementary row operations.',
    marks: 8,
    topics: ['Matrix: Types (Row, Column, Square, Identity, Zero)', 'Operations: Addition, Scalar Multiplication, Multiplication', 'Transpose of a Matrix', 'Symmetric and Skew Symmetric Matrices', 'Invertible Matrices', 'Elementary Operations (Transformations)', 'Application of Matrices'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh103.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep203.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-math-4', classLevel: 12, subject: 'Math', chapterNumber: 4,
    title: 'Determinants',
    description: 'Evaluate determinants, find inverses of matrices using cofactors, and solve systems of equations with Cramer\'s rule.',
    marks: 8,
    topics: ['Determinant of a Matrix: 2×2 and 3×3', 'Properties of Determinants', 'Area of a Triangle using Determinant', 'Minors and Cofactors', 'Adjoint and Inverse of a Matrix', 'Consistency and Inconsistency of System of Equations', 'Cramer\'s Rule'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh104.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep204.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-math-5', classLevel: 12, subject: 'Math', chapterNumber: 5,
    title: 'Continuity and Differentiability',
    description: 'Advanced differentiation — chain rule, implicit, logarithmic, parametric. This is the core of JEE Calculus.',
    marks: 10,
    topics: ['Continuity and Types of Discontinuity', 'Differentiability', 'Derivatives of Composite Functions: Chain Rule', 'Derivatives of Implicit Functions', 'Derivatives of Inverse Trig Functions', 'Exponential and Logarithmic Functions', 'Logarithmic Differentiation', 'Parametric Differentiation', 'Second Order Derivatives', "Rolle's Theorem and LMVT"],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh105.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep205.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-math-6', classLevel: 12, subject: 'Math', chapterNumber: 6,
    title: 'Application of Derivatives',
    description: 'Rate of change, increasing/decreasing functions, tangents, normals, and maxima-minima — applied calculus at its best.',
    marks: 8,
    topics: ['Rate of Change of Quantities', 'Increasing and Decreasing Functions', 'Tangents and Normals to a Curve', 'Approximations using Differentials', 'Maxima and Minima: First Derivative Test', 'Second Derivative Test', 'Absolute Maximum and Minimum', 'Optimization Word Problems'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh106.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep206.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-math-7', classLevel: 12, subject: 'Math', chapterNumber: 7,
    title: 'Integrals',
    description: 'The reverse of differentiation — indefinite integrals, definite integrals, and all the techniques to evaluate them.',
    marks: 10,
    topics: ['Integration as Inverse of Differentiation', 'Basic Standard Integrals', 'Integration by Substitution', 'Integration using Trig Identities', 'Integration of Special Types (a² ± x², px + q over quadratic)', 'Integration by Partial Fractions', 'Integration by Parts (ILATE)', 'Definite Integrals and Fundamental Theorem', 'Properties of Definite Integrals'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh107.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep207.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-math-8', classLevel: 12, subject: 'Math', chapterNumber: 8,
    title: 'Application of Integrals',
    description: 'Use integration to calculate areas under curves and between curves — a direct and high-scoring chapter in JEE.',
    marks: 6,
    topics: ['Area under Simple Curves', 'Area bounded by a Curve and x-axis', 'Area between Two Curves', 'Area bounded by Parabola and Line', 'Area of Circle using Integration', 'Area using Definite Integration (Practice Problems)'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh108.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep208.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-math-9', classLevel: 12, subject: 'Math', chapterNumber: 9,
    title: 'Differential Equations',
    description: 'Equations involving derivatives — variable separable, homogeneous, and linear first-order differential equations.',
    marks: 8,
    topics: ['Basic Concepts: Order and Degree', 'Formation of a Differential Equation', 'Methods of Solving: Variable Separable Method', 'Homogeneous Differential Equations', 'Linear Differential Equations (Integrating Factor Method)', 'Applications of Differential Equations: Growth and Decay', 'Application: Newton\'s Law of Cooling'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh109.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep209.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-math-10', classLevel: 12, subject: 'Math', chapterNumber: 10,
    title: 'Vector Algebra',
    description: 'Vectors in 3D space — magnitude, direction cosines, dot product, cross product, and their geometric interpretations.',
    marks: 7,
    topics: ['Vectors and Scalars', 'Types of Vectors', 'Addition of Vectors', 'Components of a Vector in 3D', 'Direction Cosines and Direction Ratios', 'Scalar (Dot) Product', 'Projection of a Vector on Another', 'Vector (Cross) Product', 'Area of Triangle and Parallelogram', 'Scalar Triple Product'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh110.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep210.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-math-11', classLevel: 12, subject: 'Math', chapterNumber: 11,
    title: 'Three Dimensional Geometry',
    description: 'Lines and planes in 3D space — direction cosines, equations of lines and planes, and angles between them.',
    marks: 7,
    topics: ['Direction Cosines and Direction Ratios of a Line', 'Equation of a Line in 3D: Vector and Cartesian Forms', 'Angle between Two Lines', 'Shortest Distance between Two Lines (Skew Lines)', 'Equation of a Plane in 3D', 'Coplanarity of Two Lines', 'Angle between Two Planes', 'Distance of a Point from a Plane', 'Angle between a Line and a Plane'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh111.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep211.pdf',
    examRelevance: ['Board', 'JEE'],
  },
  {
    id: 'c12-math-12', classLevel: 12, subject: 'Math', chapterNumber: 12,
    title: 'Linear Programming',
    description: 'Maximise or minimise an objective function subject to constraints — a powerful tool for resource allocation problems.',
    marks: 5,
    topics: ['Introduction to Linear Programming', 'Mathematical Formulation of an LPP', 'Graphical Method of Solution', 'Corner Point Method', 'Feasible Region and Optimal Solution', 'Types of Linear Programming Problems: Manufacturing, Diet, Transportation', 'Unbounded and Infeasible Cases'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh112.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep212.pdf',
    examRelevance: ['Board'],
  },
  {
    id: 'c12-math-13', classLevel: 12, subject: 'Math', chapterNumber: 13,
    title: 'Probability',
    description: 'Conditional probability, Bayes theorem, and probability distributions — complete probability for board and JEE.',
    marks: 8,
    topics: ['Conditional Probability', 'Multiplication Theorem', 'Independent Events', "Bayes' Theorem and its Applications", 'Random Variables and Probability Distributions', 'Mean (Expectation) and Variance of a Random Variable', 'Bernoulli Trials', 'Binomial Distribution'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook/pdf/lemh113.pdf',
    ncertExemplarUrl: 'https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/mathematics/leep213.pdf',
    examRelevance: ['Board', 'JEE'],
  },
];

// ============================================================
// CLASS 10 - ENGLISH CORE (First Flight + Footprints)
// ============================================================

const class10English: Chapter[] = [
  {
    id: 'c10-eng-1', classLevel: 10, subject: 'English Core', chapterNumber: 1,
    title: 'A Letter to God',
    description: 'Character, theme, and value-based board questions from the opening prose chapter.',
    marks: 5,
    topics: ['Theme of faith and irony', 'Character sketch of Lencho', 'Letter writing context', 'Value-based questions', 'Extract-based comprehension'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?jefp1=0-11',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-eng-2', classLevel: 10, subject: 'English Core', chapterNumber: 2,
    title: 'Nelson Mandela: Long Walk to Freedom',
    description: 'Important for extract questions, main idea questions, and short/long board answers.',
    marks: 6,
    topics: ['Autobiographical tone', 'Freedom and responsibility', 'Inauguration details', 'Language devices', 'Character and values'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?jefp1=0-11',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-eng-3', classLevel: 10, subject: 'English Core', chapterNumber: 3,
    title: 'Two Stories about Flying',
    description: 'Board-focused chapter for plot flow, fear-to-confidence transitions, and extract practice.',
    marks: 6,
    topics: ['His First Flight summary', 'Black Aeroplane mystery', 'Theme and message', 'Character feelings', 'Exam-oriented extracts'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?jefp1=0-11',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-eng-4', classLevel: 10, subject: 'English Core', chapterNumber: 4,
    title: 'From the Diary of Anne Frank',
    description: 'High-yield chapter for diary format understanding and value-based writing responses.',
    marks: 5,
    topics: ['Diary as a form', 'Anne’s perspective', 'School and teacher episodes', 'Narrative voice', 'Value-based answer framing'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?jefp1=0-11',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-eng-5', classLevel: 10, subject: 'English Core', chapterNumber: 5,
    title: 'Glimpses of India',
    description: 'Frequently asked for short notes, regional detail comparison, and map-based context.',
    marks: 6,
    topics: ['A Baker from Goa', 'Coorg key details', 'Tea from Assam', 'Travel description style', 'Extract and short-answer practice'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?jefp1=0-11',
    examRelevance: ['Board'],
  },
  {
    id: 'c10-eng-6', classLevel: 10, subject: 'English Core', chapterNumber: 6,
    title: 'The Proposal',
    description: 'Drama chapter useful for character contrast, comic elements, and extract analysis.',
    marks: 5,
    topics: ['Comic conflict', 'Character traits', 'Dialogue analysis', 'Theme and satire', 'Board extract strategy'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?jefp1=0-11',
    examRelevance: ['Board'],
  },
];

// ============================================================
// CLASS 12 - ENGLISH CORE (Flamingo + Vistas)
// ============================================================

const class12English: Chapter[] = [
  {
    id: 'c12-eng-1', classLevel: 12, subject: 'English Core', chapterNumber: 1,
    title: 'The Last Lesson',
    description: 'Core prose chapter for extract answers, themes of language identity, and long-answer framing.',
    marks: 6,
    topics: ['Theme of linguistic identity', 'Character of Franz', 'Role of M. Hamel', 'Exam extract handling', 'Value-based responses'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?lefl1=0-14',
    examRelevance: ['Board'],
  },
  {
    id: 'c12-eng-2', classLevel: 12, subject: 'English Core', chapterNumber: 2,
    title: 'Lost Spring',
    description: 'High-frequency chapter for social-theme writing and text-to-society analytical questions.',
    marks: 7,
    topics: ['Theme of poverty and exploitation', 'Saheb and Mukesh contrast', 'Narrative tone', 'Important textual references', 'Board long-answer structure'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?lefl1=0-14',
    examRelevance: ['Board'],
  },
  {
    id: 'c12-eng-3', classLevel: 12, subject: 'English Core', chapterNumber: 3,
    title: 'Deep Water',
    description: 'Important chapter for personal transformation and fear-overcoming analytical questions.',
    marks: 6,
    topics: ['Fear psychology', 'Narrative sequence', 'Training and recovery arc', 'Theme interpretation', 'Extract-based preparation'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?lefl1=0-14',
    examRelevance: ['Board'],
  },
  {
    id: 'c12-eng-4', classLevel: 12, subject: 'English Core', chapterNumber: 4,
    title: 'The Rattrap',
    description: 'Board-important chapter for symbolism, character change, and moral-value responses.',
    marks: 6,
    topics: ['Symbolism of the rattrap', 'Character development', 'Compassion as turning point', 'Theme and message', 'Board answer frameworks'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?lefl1=0-14',
    examRelevance: ['Board'],
  },
  {
    id: 'c12-eng-5', classLevel: 12, subject: 'English Core', chapterNumber: 5,
    title: 'Indigo',
    description: 'Historical-context chapter often asked in analytical and value-based board questions.',
    marks: 7,
    topics: ['Champaran movement context', 'Gandhi’s leadership traits', 'Social justice framing', 'Theme-based writing points', 'Extract and short answer strategy'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?lefl1=0-14',
    examRelevance: ['Board'],
  },
  {
    id: 'c12-eng-6', classLevel: 12, subject: 'English Core', chapterNumber: 6,
    title: 'Going Places',
    description: 'Frequently asked chapter for theme interpretation, characterization, and inferential answers.',
    marks: 6,
    topics: ['Adolescence and aspirations', 'Character of Sophie', 'Fantasy vs reality', 'Narrative viewpoint', 'Board-oriented inferential responses'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?lefl1=0-14',
    examRelevance: ['Board'],
  },
];

// ============================================================
// CLASS 12 - COMMERCE (Accountancy + Business Studies + Economics)
// ============================================================

const class12Commerce: Chapter[] = [
  {
    id: 'c12-acc-1', classLevel: 12, subject: 'Accountancy', chapterNumber: 1,
    title: 'Accounting for Partnership Firms - Fundamentals',
    description: 'Core board chapter for goodwill, profit-sharing ratios, and capital adjustments in partnership accounting.',
    marks: 8,
    topics: ['Partnership deed clauses', 'Fixed vs fluctuating capital', 'Past adjustments', 'Goodwill valuation basics', 'Profit-sharing ratio'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?leac1=0-13',
    examRelevance: ['Board'],
    formulas: [
      { name: 'New Profit Sharing Ratio', latex: '\\text{Old Share} \\pm \\text{Gain/Loss}' },
      { name: 'Sacrificing Ratio', latex: '\\text{Old Share} - \\text{New Share}' },
      { name: 'Gaining Ratio', latex: '\\text{New Share} - \\text{Old Share}' },
    ],
  },
  {
    id: 'c12-acc-2', classLevel: 12, subject: 'Accountancy', chapterNumber: 2,
    title: 'Reconstitution of Partnership - Admission and Retirement',
    description: 'Frequently tested practical chapter with adjustments for reserves, goodwill, revaluation, and partner settlement.',
    marks: 10,
    topics: ['Admission of partner', 'Retirement and death of partner', 'Revaluation account', 'Accumulated profits and reserves', 'Capital account adjustments'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?leac1=0-13',
    examRelevance: ['Board'],
    formulas: [
      { name: 'Hidden Goodwill', latex: '\\text{Goodwill} = \\frac{\\text{Total Capital} - \\text{Net Assets}}{1}' },
      { name: 'Average Profit', latex: '\\frac{\\sum \\text{Profits}}{\\text{Number of Years}}' },
      { name: 'Super Profit', latex: '\\text{Average Profit} - \\text{Normal Profit}' },
    ],
  },
  {
    id: 'c12-acc-3', classLevel: 12, subject: 'Accountancy', chapterNumber: 3,
    title: 'Issue and Redemption of Debentures',
    description: 'Scoring chapter for accounting treatment of debentures, discount/premium, and redemption methods.',
    marks: 7,
    topics: ['Issue of debentures', 'Debenture redemption reserve', 'Methods of redemption', 'Interest on debentures', 'Writing off loss on issue'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?leac1=0-13',
    examRelevance: ['Board'],
    formulas: [
      { name: 'Interest on Debentures', latex: '\\text{Debenture Value} \\times \\frac{\\text{Rate}}{100}' },
      { name: 'Loss on Issue Amortization', latex: '\\frac{\\text{Total Loss}}{\\text{Years}}' },
    ],
  },
  {
    id: 'c12-acc-4', classLevel: 12, subject: 'Accountancy', chapterNumber: 4,
    title: 'Financial Statement Analysis and Accounting Ratios',
    description: 'High-weightage board chapter for ratio computation and interpretation.',
    marks: 8,
    topics: ['Liquidity ratios', 'Solvency ratios', 'Activity ratios', 'Profitability ratios', 'Comparative statements'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?leac2=0-10',
    examRelevance: ['Board'],
    formulas: [
      { name: 'Current Ratio', latex: '\\frac{\\text{Current Assets}}{\\text{Current Liabilities}}' },
      { name: 'Quick Ratio', latex: '\\frac{\\text{Current Assets} - \\text{Inventory}}{\\text{Current Liabilities}}' },
      { name: 'Debt-Equity Ratio', latex: '\\frac{\\text{Long-term Debt}}{\\text{Shareholders Funds}}' },
      { name: 'Net Profit Ratio', latex: '\\frac{\\text{Net Profit}}{\\text{Revenue from Operations}} \\times 100' },
      { name: 'Return on Investment', latex: '\\frac{\\text{Net Profit}}{\\text{Capital Employed}} \\times 100' },
    ],
  },
  {
    id: 'c12-acc-5', classLevel: 12, subject: 'Accountancy', chapterNumber: 5,
    title: 'Cash Flow Statement',
    description: 'Board-favourite chapter for classifying and computing operating, investing, and financing cash flows.',
    marks: 7,
    topics: ['Operating activities', 'Investing activities', 'Financing activities', 'Indirect method adjustments', 'Non-cash and non-operating items'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?leac2=0-10',
    examRelevance: ['Board'],
    formulas: [
      { name: 'Net Cash from Operating Activities', latex: '\\text{Net Profit Before Tax} + \\text{Non-cash Expenses} - \\text{Non-operating Incomes} \\pm \\Delta\\text{Working Capital}' },
      { name: 'Net Increase/Decrease in Cash', latex: '\\text{CFO} + \\text{CFI} + \\text{CFF}' },
    ],
  },
  {
    id: 'c12-bst-1', classLevel: 12, subject: 'Business Studies', chapterNumber: 1,
    title: 'Nature and Significance of Management',
    description: 'Conceptual foundation chapter asked in short and long analytical board responses.',
    marks: 6,
    topics: ['Management as science, art and profession', 'Levels of management', 'Objectives of management', 'Coordination', 'Functions of management'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?lebs1=0-11',
    examRelevance: ['Board'],
  },
  {
    id: 'c12-bst-2', classLevel: 12, subject: 'Business Studies', chapterNumber: 2,
    title: 'Principles of Management',
    description: 'Frequently tested chapter for Fayol principles and practical business applications.',
    marks: 6,
    topics: ['Fayol principles', 'Scientific management techniques', 'Taylor principles', 'Business case applications', 'Management thought'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?lebs1=0-11',
    examRelevance: ['Board'],
  },
  {
    id: 'c12-bst-3', classLevel: 12, subject: 'Business Studies', chapterNumber: 3,
    title: 'Planning and Organising',
    description: 'Important board chapter for process steps, strategy linkage, and decision outcomes.',
    marks: 7,
    topics: ['Planning process', 'Types of plans', 'Organising process', 'Delegation', 'Decentralisation'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?lebs1=0-11',
    examRelevance: ['Board'],
  },
  {
    id: 'c12-bst-4', classLevel: 12, subject: 'Business Studies', chapterNumber: 4,
    title: 'Staffing and Directing',
    description: 'Case-based chapter on recruitment, selection, motivation, leadership, and communication.',
    marks: 7,
    topics: ['Staffing steps', 'Recruitment vs selection', 'Training methods', 'Leadership styles', 'Communication process'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?lebs2=0-10',
    examRelevance: ['Board'],
  },
  {
    id: 'c12-bst-5', classLevel: 12, subject: 'Business Studies', chapterNumber: 5,
    title: 'Marketing and Consumer Protection',
    description: 'High-yield business chapter for product-mix, pricing, promotion, and consumer rights.',
    marks: 8,
    topics: ['Marketing mix', 'Product life cycle', 'Promotion tools', 'Consumer rights', 'Consumer redressal system'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?lebs2=0-10',
    examRelevance: ['Board'],
    formulas: [
      { name: 'Break-even Point (Units)', latex: '\\frac{\\text{Fixed Cost}}{\\text{Selling Price per Unit} - \\text{Variable Cost per Unit}}' },
    ],
  },
  {
    id: 'c12-eco-1', classLevel: 12, subject: 'Economics', chapterNumber: 1,
    title: 'National Income Accounting',
    description: 'Most important macroeconomics chapter with GDP/NDP and income aggregate calculations.',
    marks: 10,
    topics: ['GDP, GNP, NDP, NNP', 'Nominal vs real GDP', 'Value added method', 'Income method', 'Expenditure method'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?leec1=0-12',
    examRelevance: ['Board'],
    formulas: [
      { name: 'GDP at Market Price', latex: '\\sum \\text{Gross Value Added at Market Price}' },
      { name: 'NDP at FC', latex: '\\text{GDP at MP} - \\text{Depreciation} - \\text{Net Indirect Taxes}' },
      { name: 'Real GDP', latex: '\\frac{\\text{Nominal GDP}}{\\text{Price Index}} \\times 100' },
    ],
  },
  {
    id: 'c12-eco-2', classLevel: 12, subject: 'Economics', chapterNumber: 2,
    title: 'Money and Banking',
    description: 'Key board chapter on money supply, credit creation, and monetary policy tools.',
    marks: 7,
    topics: ['Functions of money', 'Commercial banking', 'Credit creation', 'Central bank functions', 'Monetary policy'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?leec1=0-12',
    examRelevance: ['Board'],
    formulas: [
      { name: 'Money Multiplier', latex: '\\frac{1}{\\text{Required Reserve Ratio}}' },
      { name: 'Required Reserves', latex: '\\text{Deposits} \\times \\text{Reserve Ratio}' },
    ],
  },
  {
    id: 'c12-eco-3', classLevel: 12, subject: 'Economics', chapterNumber: 3,
    title: 'Income Determination and Multiplier',
    description: 'Frequently asked numericals on equilibrium income, MPC, APS, and investment multiplier.',
    marks: 8,
    topics: ['Aggregate demand and supply', 'Equilibrium output', 'Consumption function', 'MPC and APC', 'Multiplier process'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?leec1=0-12',
    examRelevance: ['Board'],
    formulas: [
      { name: 'Multiplier (k)', latex: '\\frac{1}{1-\\text{MPC}}' },
      { name: 'APS', latex: '\\frac{S}{Y}' },
      { name: 'APC', latex: '\\frac{C}{Y}' },
      { name: 'Equilibrium Condition', latex: 'AD = AS' },
    ],
  },
  {
    id: 'c12-eco-4', classLevel: 12, subject: 'Economics', chapterNumber: 4,
    title: 'Government Budget and the Economy',
    description: 'Scoring chapter with fiscal deficit and budgetary classification numericals.',
    marks: 7,
    topics: ['Revenue vs capital receipts', 'Revenue vs capital expenditure', 'Budget deficits', 'Fiscal policy stance', 'Public debt'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?leec1=0-12',
    examRelevance: ['Board'],
    formulas: [
      { name: 'Fiscal Deficit', latex: '\\text{Total Expenditure} - \\text{Total Receipts (excluding borrowings)}' },
      { name: 'Primary Deficit', latex: '\\text{Fiscal Deficit} - \\text{Interest Payments}' },
      { name: 'Revenue Deficit', latex: '\\text{Revenue Expenditure} - \\text{Revenue Receipts}' },
    ],
  },
  {
    id: 'c12-eco-5', classLevel: 12, subject: 'Economics', chapterNumber: 5,
    title: 'Balance of Payments and Exchange Rate',
    description: 'High-impact chapter for current account, capital account, and forex rate effects.',
    marks: 7,
    topics: ['Current account', 'Capital account', 'BOP deficit/surplus', 'Exchange rate systems', 'Depreciation and appreciation'],
    ncertPdfUrl: 'https://ncert.nic.in/textbook.php?leec2=0-8',
    examRelevance: ['Board'],
    formulas: [
      { name: 'BOP Identity', latex: '\\text{Current Account} + \\text{Capital Account} + \\Delta\\text{Reserves} = 0' },
      { name: 'Terms of Trade', latex: '\\frac{\\text{Export Price Index}}{\\text{Import Price Index}} \\times 100' },
    ],
  },
];

// ============================================================
// COMBINE ALL CHAPTERS
// ============================================================

export const ALL_CHAPTERS: Chapter[] = [
  ...class10Science,
  ...class10Math,
  ...class10English,
  ...class11Physics,
  ...class11Chemistry,
  ...class11Biology,
  ...class11Math,
  ...class12Physics,
  ...class12Chemistry,
  ...class12Biology,
  ...class12Math,
  ...class12Commerce,
  ...class12English,
];

// ── Helper Functions ────────────────────────────────────────

export function getChapterById(id: string): Chapter | undefined {
  return ALL_CHAPTERS.find((ch) => ch.id === id);
}

export function getChaptersByClass(classLevel: ClassLevel): Chapter[] {
  return ALL_CHAPTERS.filter((ch) => ch.classLevel === classLevel);
}

export function getChaptersBySubject(subject: Subject): Chapter[] {
  return ALL_CHAPTERS.filter((ch) => ch.subject === subject);
}

export function getChaptersByClassAndSubject(classLevel: ClassLevel, subject: Subject): Chapter[] {
  return ALL_CHAPTERS.filter((ch) => ch.classLevel === classLevel && ch.subject === subject);
}

const SUBJECT_ORDER: Record<Subject, number> = {
  Physics: 1,
  Chemistry: 2,
  Biology: 3,
  Math: 4,
  Accountancy: 5,
  'Business Studies': 6,
  Economics: 7,
  'English Core': 8,
};

export function getSortedChapters(): Chapter[] {
  return [...ALL_CHAPTERS].sort((a, b) => {
    if (a.classLevel !== b.classLevel) return a.classLevel - b.classLevel;
    const subjectDiff = SUBJECT_ORDER[a.subject] - SUBJECT_ORDER[b.subject];
    if (subjectDiff !== 0) return subjectDiff;
    return a.chapterNumber - b.chapterNumber;
  });
}

export function getAdjacentChapters(id: string): {
  prev: Chapter | null;
  next: Chapter | null;
} {
  const sorted = getSortedChapters();
  const idx = sorted.findIndex((ch) => ch.id === id);
  return {
    prev: idx > 0 ? sorted[idx - 1] : null,
    next: idx < sorted.length - 1 ? sorted[idx + 1] : null,
  };
}

export function getChapterStats() {
  const byClass: Record<number, number> = { 10: 0, 11: 0, 12: 0 };
  const bySubject: Record<string, number> = {
    Physics: 0,
    Chemistry: 0,
    Biology: 0,
    Math: 0,
    Accountancy: 0,
    'Business Studies': 0,
    Economics: 0,
    'English Core': 0,
  };
  for (const ch of ALL_CHAPTERS) {
    byClass[ch.classLevel]++;
    bySubject[ch.subject]++;
  }
  return { total: ALL_CHAPTERS.length, byClass, bySubject };
}

// ============================================================
// PREVIOUS YEAR PAPERS
// ============================================================

export const PAPERS: Paper[] = [
  // ── CLASS 10 ─────────────────────────────────────────
  { id: 'p10-sci-2024', classLevel: 10, subject: 'Science', year: 2024, title: 'CBSE Class 10 Science Sample Paper 2024–25', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/SQP_CLASSX_2024-25.html' },
  { id: 'p10-math-2024', classLevel: 10, subject: 'Math', year: 2024, title: 'CBSE Class 10 Mathematics Sample Paper 2024–25', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/SQP_CLASSX_2024-25.html' },
  { id: 'p10-sci-2023', classLevel: 10, subject: 'Science', year: 2023, title: 'CBSE Class 10 Science Sample Paper 2023–24', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/SQP_CLASSX_2023-24.html' },
  { id: 'p10-math-2023', classLevel: 10, subject: 'Math', year: 2023, title: 'CBSE Class 10 Mathematics Sample Paper 2023–24', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/SQP_CLASSX_2023-24.html' },
  { id: 'p10-sci-2022', classLevel: 10, subject: 'Science', year: 2022, title: 'CBSE Class 10 Science Sample Paper 2022–23', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/SQP_CLASSX_2022-23.html' },
  { id: 'p10-math-2022', classLevel: 10, subject: 'Math', year: 2022, title: 'CBSE Class 10 Mathematics Sample Paper 2022–23', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/SQP_CLASSX_2022-23.html' },
  { id: 'p10-sci-2021', classLevel: 10, subject: 'Science', year: 2021, title: 'CBSE Class 10 Science Sample Paper 2021–22', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/SQP_CLASSX_2021-22.html' },
  { id: 'p10-sci-2020', classLevel: 10, subject: 'Science', year: 2020, title: 'CBSE Class 10 Science Sample Paper 2020–21', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/SQP_CLASSX_2020-21.html' },
  // ── CLASS 12 ─────────────────────────────────────────
  { id: 'p12-phy-2024', classLevel: 12, subject: 'Physics', year: 2024, title: 'CBSE Class 12 Physics Sample Paper 2024–25', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2024-25.html' },
  { id: 'p12-chem-2024', classLevel: 12, subject: 'Chemistry', year: 2024, title: 'CBSE Class 12 Chemistry Sample Paper 2024–25', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2024-25.html' },
  { id: 'p12-bio-2024', classLevel: 12, subject: 'Biology', year: 2024, title: 'CBSE Class 12 Biology Sample Paper 2024–25', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2024-25.html' },
  { id: 'p12-math-2024', classLevel: 12, subject: 'Math', year: 2024, title: 'CBSE Class 12 Mathematics Sample Paper 2024–25', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2024-25.html' },
  { id: 'p12-phy-2023', classLevel: 12, subject: 'Physics', year: 2023, title: 'CBSE Class 12 Physics Sample Paper 2023–24', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2023-24.html' },
  { id: 'p12-chem-2023', classLevel: 12, subject: 'Chemistry', year: 2023, title: 'CBSE Class 12 Chemistry Sample Paper 2023–24', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2023-24.html' },
  { id: 'p12-bio-2023', classLevel: 12, subject: 'Biology', year: 2023, title: 'CBSE Class 12 Biology Sample Paper 2023–24', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2023-24.html' },
  { id: 'p12-math-2023', classLevel: 12, subject: 'Math', year: 2023, title: 'CBSE Class 12 Mathematics Sample Paper 2023–24', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2023-24.html' },
  { id: 'p12-phy-2022', classLevel: 12, subject: 'Physics', year: 2022, title: 'CBSE Class 12 Physics Sample Paper 2022–23', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2022-23.html' },
  { id: 'p12-chem-2022', classLevel: 12, subject: 'Chemistry', year: 2022, title: 'CBSE Class 12 Chemistry Sample Paper 2022–23', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2022-23.html' },
  { id: 'p12-bio-2022', classLevel: 12, subject: 'Biology', year: 2022, title: 'CBSE Class 12 Biology Sample Paper 2022–23', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2022-23.html' },
  { id: 'p12-math-2022', classLevel: 12, subject: 'Math', year: 2022, title: 'CBSE Class 12 Mathematics Sample Paper 2022–23', duration: '3 Hours', totalMarks: 80, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2022-23.html' },
  { id: 'p12-all-2021', classLevel: 12, subject: 'All Subjects', year: 2021, title: 'CBSE Class 12 All Subjects Sample Papers 2021–22', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2021-22.html' },
  { id: 'p12-all-2020', classLevel: 12, subject: 'All Subjects', year: 2020, title: 'CBSE Class 12 All Subjects Sample Papers 2020–21', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2020-21.html' },
  { id: 'p12-all-2019', classLevel: 12, subject: 'All Subjects', year: 2019, title: 'CBSE Class 12 All Subjects Sample Papers 2019–20', duration: '3 Hours', totalMarks: 70, url: 'https://cbseacademic.nic.in/SQP_CLASSXII_2019-20.html' },
  // ── MARKING SCHEMES ──────────────────────────────────
  { id: 'ms-all-latest', classLevel: 'all', subject: 'Marking Scheme', year: 2024, title: 'CBSE Marking Schemes — All Classes & Subjects', duration: '—', totalMarks: 0, url: 'https://cbseacademic.nic.in/Marking_Scheme.html' },
];

// ============================================================
// ENTRANCE EXAMS
// ============================================================

export const ENTRANCE_EXAMS: EntranceExam[] = [
  {
    id: 'jee-main',
    name: 'JEE Main',
    stream: 'PCM',
    forColleges: 'NITs, IIITs, CFTIs (31 NITs, 26 IIITs)',
    eligibility: '75% in Class 12 (PCM). No age limit from 2021.',
    pattern: '90 Questions | Physics + Chemistry + Math | 300 Marks | 3 Hours | MCQ + Numerical',
    dates: 'Session 1: January | Session 2: April',
    officialUrl: 'https://jeemain.nta.nic.in',
    topColleges: ['NIT Trichy', 'NIT Warangal', 'NIT Surathkal', 'IIIT Hyderabad', 'NIT Calicut', 'NIT Rourkela', 'IIIT Bangalore'],
    prepTip: 'Start with NCERT → HC Verma (Physics) → N Avasthi (Chemistry) → Cengage/Arihant (Math). Mock tests from November onwards. Analyse every test — don\'t skip weak chapters.',
  },
  {
    id: 'jee-advanced',
    name: 'JEE Advanced',
    stream: 'PCM',
    forColleges: '23 IITs across India',
    eligibility: 'Must be in top 2.5 lakh of JEE Main. Maximum 2 attempts in consecutive years.',
    pattern: '2 Papers × 3 Hours | MCQ + Integer Type + Matching | 360 Marks total',
    dates: 'May–June (approximately 2 weeks after JEE Main results)',
    officialUrl: 'https://jeeadv.ac.in',
    topColleges: ['IIT Bombay', 'IIT Delhi', 'IIT Madras', 'IIT Kanpur', 'IIT Kharagpur', 'IIT Roorkee', 'IIT Hyderabad'],
    prepTip: 'Significantly harder than JEE Main — focuses on deep conceptual understanding. Solve previous year JEE Advanced papers religiously. Speed AND accuracy both matter.',
  },
  {
    id: 'neet',
    name: 'NEET-UG',
    stream: 'PCB',
    forColleges: 'All MBBS, BDS, AYUSH, Nursing colleges across India',
    eligibility: 'Min 50% in PCB in Class 12. Age 17+ at admission. No upper age limit.',
    pattern: '200 MCQs (180 to attempt) | Physics(45) + Chemistry(45) + Biology(90) | 720 Marks | 3.5 Hours | Pen & Paper',
    dates: 'May (first Sunday) | Results: June | Counselling: July–August',
    officialUrl: 'https://neet.nta.nic.in',
    topColleges: ['AIIMS Delhi', 'JIPMER Puducherry', 'AFMC Pune', 'Maulana Azad GMC', 'Lady Hardinge Medical College'],
    prepTip: 'Biology is 360/720 marks — NCERT Biology line by line is mandatory. Physics and Chemistry: NCERT first + DC Pandey (Physics) + NCERT Exemplar (Bio + Chem).',
  },
  {
    id: 'cuet',
    name: 'CUET',
    stream: 'Both',
    forColleges: 'Delhi University, JNU, BHU, AMU, and 250+ central/state universities',
    eligibility: 'Class 12 pass or appearing. No minimum percentage required.',
    pattern: 'MCQ | Domain Subjects + General Test + Languages | Online CBT',
    dates: 'May–June | Results: July',
    officialUrl: 'https://exams.nta.ac.in/CUET-UG',
    topColleges: ['Delhi University (DU)', 'JNU Delhi', 'BHU Varanasi', 'Jamia Millia Islamia', 'Hyderabad Central University'],
    prepTip: 'NCERT is largely sufficient. Focus on your domain subject + General Test (Quantitative Reasoning + English). No negative marking for un-attempted questions.',
  },
  {
    id: 'ca-foundation',
    name: 'CA Foundation (ICAI)',
    stream: 'Commerce',
    forColleges: 'Chartered Accountancy pathway through ICAI',
    eligibility: 'Class 12 pass/appearing as per ICAI notifications.',
    pattern: 'Accounting, Law, Quantitative Aptitude and Business Economics sections as notified by ICAI.',
    dates: 'Registration and exam windows as published by ICAI BoS announcements.',
    officialUrl: 'https://boslive.icai.org/announcement_details.php?id=484',
    topColleges: ['ICAI CA Pathway', 'SRCC', 'Loyola College Chennai', 'Christ University'],
    prepTip: 'Build accounting and business law basics in Class 11–12, then use ICAI sample resources and timed mock practice.',
  },
  {
    id: 'cseet',
    name: 'CSEET (ICSI)',
    stream: 'Commerce',
    forColleges: 'Company Secretary pathway through ICSI',
    eligibility: 'Class 12 pass/appearing as per ICSI eligibility norms.',
    pattern: 'Business Communication, Legal Aptitude, Economics/Business Environment and Current Affairs as per ICSI structure.',
    dates: 'Session-wise windows are published by ICSI (including updates effective June 2026).',
    officialUrl: 'https://www.icsi.edu/',
    topColleges: ['ICSI CS Pathway', 'St. Xavier\'s College Mumbai', 'NMIMS Mumbai'],
    prepTip: 'Prioritize legal aptitude and business communication along with weekly current affairs revision.',
  },
  {
    id: 'cma-foundation',
    name: 'CMA Foundation (ICMAI)',
    stream: 'Commerce',
    forColleges: 'Cost and Management Accounting pathway through ICMAI',
    eligibility: 'Class 12 pass/appearing as per ICMAI admission norms.',
    pattern: 'Fundamentals of Economics and Management, Accounting, Laws and Ethics sections as per ICMAI pattern.',
    dates: 'Term-wise schedules published by ICMAI.',
    officialUrl: 'https://icmai.in/studentswebsite/mgmtaccexam.php',
    topColleges: ['ICMAI CMA Pathway', 'Narsee Monjee College of Commerce', 'Symbiosis Pune'],
    prepTip: 'Strengthen accountancy and economics fundamentals before moving into CMA pattern tests.',
  },
  {
    id: 'ipmat-indore',
    name: 'IPM AT (IIM Indore)',
    stream: 'Commerce',
    forColleges: 'IIM Indore IPM and allied management tracks',
    eligibility: 'As per IIM Indore IPM admissions criteria for the current cycle.',
    pattern: 'Aptitude test with quantitative and verbal sections plus admission process as notified by IIM Indore.',
    dates: 'Application and exam dates announced on IIM Indore admissions page.',
    officialUrl: 'https://iimidr.ac.in/programmes/academic-programmes/five-year-integrated-programme-in-management-ipm/ipm-admissions-details/',
    topColleges: ['IIM Indore (IPM)', 'IIM Ranchi (IPM route)', 'NALSAR IPM'],
    prepTip: 'Start aptitude prep in Class 11 with arithmetic, algebra, reading comprehension, and timed sectional mocks.',
  },
  {
    id: 'ipm-ranchi',
    name: 'IIM Ranchi IPM',
    stream: 'Commerce',
    forColleges: 'IIM Ranchi integrated management program route',
    eligibility: 'As published by IIM Ranchi admissions for the relevant cycle.',
    pattern: 'Institute-announced selection process aligned with IPM admissions.',
    dates: 'Annual application windows are posted on IIM Ranchi official admissions portal.',
    officialUrl: 'https://app.iimranchi.ac.in/admission/ipm.html',
    topColleges: ['IIM Ranchi (IPM)', 'IIM Indore (IPM route)', 'BBA Finance pathways'],
    prepTip: 'Track official updates early and keep aptitude preparation aligned with IPM-level quantitative and verbal demands.',
  },
  {
    id: 'bitsat',
    name: 'BITSAT',
    stream: 'PCM',
    forColleges: 'BITS Pilani, BITS Goa, BITS Hyderabad',
    eligibility: 'Min 75% in PCM + min 60% aggregate in Class 12.',
    pattern: '130 Questions | PCM + English + Logical Reasoning | 390 Marks | 3 Hours | Online CBT',
    dates: 'May–June (registration: January onwards)',
    officialUrl: 'https://www.bitsadmission.com',
    topColleges: ['BITS Pilani', 'BITS Goa', 'BITS Hyderabad'],
    prepTip: 'Speed is everything — ~1.4 minutes per question. NCERT + solving timed mocks from February. English and Logical Reasoning are easy scoring sections.',
  },
];

// ============================================================
// TOP COLLEGES
// ============================================================

export const TOP_COLLEGES: College[] = [
  { name: 'IIT Bombay', tier: 'Elite', stream: 'PCM', url: 'https://www.iitb.ac.in' },
  { name: 'IIT Delhi', tier: 'Elite', stream: 'PCM', url: 'https://home.iitd.ac.in' },
  { name: 'IIT Madras', tier: 'Elite', stream: 'PCM', url: 'https://www.iitm.ac.in' },
  { name: 'IIT Kanpur', tier: 'Elite', stream: 'PCM', url: 'https://www.iitk.ac.in' },
  { name: 'IIT Kharagpur', tier: 'Elite', stream: 'PCM', url: 'https://www.iitkgp.ac.in' },
  { name: 'BITS Pilani', tier: 'Top', stream: 'PCM', url: 'https://www.bits-pilani.ac.in' },
  { name: 'NIT Trichy', tier: 'Top', stream: 'PCM', url: 'https://www.nitt.edu' },
  { name: 'NIT Warangal', tier: 'Top', stream: 'PCM', url: 'https://www.nitw.ac.in' },
  { name: 'IIIT Hyderabad', tier: 'Top', stream: 'PCM', url: 'https://www.iiit.ac.in' },
  { name: 'NIT Surathkal', tier: 'Good', stream: 'PCM', url: 'https://www.nitk.ac.in' },
  { name: 'AIIMS Delhi', tier: 'Elite', stream: 'PCB', url: 'https://www.aiims.edu' },
  { name: 'JIPMER Puducherry', tier: 'Elite', stream: 'PCB', url: 'https://jipmer.edu.in' },
  { name: 'AFMC Pune', tier: 'Top', stream: 'PCB', url: 'https://afmc.nic.in' },
  { name: 'Maulana Azad GMC Delhi', tier: 'Top', stream: 'PCB', url: 'https://www.mamc.ac.in' },
  { name: 'Lady Hardinge Medical', tier: 'Top', stream: 'PCB', url: 'https://lhmc-hosp.gov.in' },
  { name: 'Kasturba Medical College', tier: 'Good', stream: 'PCB', url: 'https://manipal.edu/kmc-manipal.html' },
  { name: 'Shri Ram College of Commerce (SRCC)', tier: 'Elite', stream: 'Commerce', url: 'https://www.srcc.edu' },
  { name: 'Hindu College (Commerce/Economics)', tier: 'Top', stream: 'Commerce', url: 'https://hinducollege.ac.in' },
  { name: 'Hansraj College', tier: 'Top', stream: 'Commerce', url: 'https://www.hansrajcollege.ac.in' },
  { name: 'Loyola College Chennai', tier: 'Good', stream: 'Commerce', url: 'https://www.loyolacollege.edu' },
  { name: 'Christ University', tier: 'Good', stream: 'Commerce', url: 'https://christuniversity.in' },
];

// ============================================================
// SCHOLARSHIPS
// ============================================================

export const SCHOLARSHIPS: Scholarship[] = [
  { name: 'INSPIRE Scholarship', description: 'For top 1% of Class 12 students pursuing BSc/Int-MSc in Natural Sciences. ₹80,000/year.', url: 'https://online-inspire.gov.in' },
  { name: 'National Scholarship Portal (NSP)', description: 'All central government scholarships in one place — pre-matric, post-matric, merit-based.', url: 'https://scholarships.gov.in' },
  { name: 'PM YASASVI', description: 'For OBC, EBC, and DNT students in Classes 9 and 11. Up to ₹1.25 lakh/year.', url: 'https://yasasvi.nta.ac.in' },
  { name: 'CBSE Merit Scholarship', description: 'For single girl child who studied in CBSE school. ₹500/month up to Class 12.', url: 'https://cbse.gov.in/cbsenew/scholarship.html' },
];

// ============================================================
// YEAR-BY-YEAR ROADMAPS
// ============================================================

export const ROADMAP_PCM = [
  {
    stage: 'Class 10', title: 'Build a Solid Foundation',
    steps: ['Score 90%+ in Science and Math', 'Understand every NCERT concept — don\'t memorise, understand', 'Attempt last 3 years\' CBSE sample papers', 'Decide PCM stream for Class 11', 'Start basic JEE awareness — what subjects, what chapters'],
  },
  {
    stage: 'Class 11', title: 'Master the Hard Concepts',
    steps: ['Class 11 is the toughest transition — take it seriously from Day 1', 'Cover NCERT Physics, Chemistry, Math thoroughly', 'Key chapters: Mechanics, Thermodynamics, Organic Basics, Calculus', 'Join a test series or use free resources (Physics Wallah, Khan Academy)', 'Attempt 1–2 JEE mock tests to understand the pattern'],
  },
  {
    stage: 'Class 12 — First Half', title: 'Finish New Syllabus + Revise',
    steps: ['Complete all Class 12 NCERT chapters by October–November', 'Focus: Electrochemistry, Optics, Calculus (Integrals, Differential Eq.)', 'Revise all Class 11 chapters — equal weightage in JEE', 'Attempt full mock tests regularly and analyse them', 'Identify and eliminate weak chapters one by one'],
  },
  {
    stage: 'Class 12 — Boards + JEE', title: 'Final Sprint',
    steps: ['Boards prep: NCERT + sample papers + chapter-wise practice', 'JEE Main: 3–4 full mocks per week from January', 'Analyse every mock — time spent, accuracy, weak areas', 'Register for JEE Main before December deadline', 'After boards: intensive JEE Advanced prep if you\'re qualifying'],
  },
];

export const ROADMAP_PCB = [
  {
    stage: 'Class 10', title: 'Build a Solid Foundation',
    steps: ['Score 90%+ in Science', 'Develop genuine curiosity for Biology — it will carry you far', 'Read NCERT Science cover to cover', 'Decide PCB stream for Class 11', 'Start basic NEET awareness — 720 marks, Biology is 360'],
  },
  {
    stage: 'Class 11', title: 'Master Biology and Chemistry',
    steps: ['NCERT Biology is your Bible — read it word by word, diagrams and all', 'Key: Cell Biology, Digestion, Circulation, Respiration, Neural, Endocrine', 'Chemistry: Organic basics are crucial for NEET Chemistry', 'Physics: Conceptual understanding over heavy calculations', 'Attempt 1–2 NEET mock tests to understand the format'],
  },
  {
    stage: 'Class 12 — First Half', title: 'Finish New Syllabus + Revise',
    steps: ['Class 12 Biology: Genetics, Molecular Biology, Biotechnology, Ecology', 'These chapters have very high NEET weightage — don\'t rush them', 'Chemistry: Biomolecules and Coordination Compounds', 'Physics: Optics and Dual Nature', 'Full syllabus mock tests — analyse every wrong answer'],
  },
  {
    stage: 'Class 12 — Boards + NEET', title: 'Final Sprint',
    steps: ['NEET is in May — board and NEET prep can run in parallel', 'Biology: 360/720 marks — perfect your MCQ accuracy here', 'Attempt 1 full NEET mock per week minimum, analyse fully', 'Register for NEET before March deadline', 'NCERT is sufficient for 90%+ of NEET questions — trust it'],
  },
];

export const ROADMAP_COMMERCE = [
  {
    stage: 'Class 10',
    title: 'Build Core Numeracy and Business Awareness',
    steps: [
      'Strengthen math fundamentals and reading comprehension for future aptitude exams.',
      'Build a habit of reading business and economy news from reliable sources.',
      'Explore commerce subjects early: Accountancy, Business Studies, Economics.',
      'Discuss Class 11 subject combinations with school mentors and parents.',
      'Keep board fundamentals strong because they affect all later pathways.',
    ],
  },
  {
    stage: 'Class 11',
    title: 'Create Commerce Base for CA/CMA/CS/IPM',
    steps: [
      'Treat Accountancy and Economics as daily practice subjects, not last-minute theory.',
      'Start basic aptitude prep (quantitative + verbal) for IPM and management routes.',
      'Track official notifications for ICAI, ICSI, ICMAI, and CUET every month.',
      'Build summary notes chapter-wise for journal entries, partnership basics, and macro concepts.',
      'Attempt chapter-level mock tests with timed practice from Term 2 onward.',
    ],
  },
  {
    stage: 'Class 12 - First Half',
    title: 'Finish Syllabus and Map Chapters to Career Paths',
    steps: [
      'Complete core board syllabus by October with weekly revision loops.',
      'For CA/CMA/CS tracks, prioritize accounting standards, law basics, and economics concepts.',
      'For CUET/IPM tracks, run regular aptitude and domain mocks.',
      'Use official exam websites only for eligibility and schedule updates.',
      'Maintain an error log for recurring mistakes in accounting formats and numericals.',
    ],
  },
  {
    stage: 'Class 12 - Boards and Entrance',
    title: 'Execution and Application Cycle',
    steps: [
      'Run board preparation and entrance preparation in parallel using a fixed weekly timetable.',
      'Complete full-length mocks for CUET/IPM and targeted section tests for CA/CMA/CS.',
      'Track registration deadlines from official portals and keep document checklist ready.',
      'Finalize pathway based on exam outcomes: CA, CMA, CS, BCom, BBA Finance, or IPM.',
      'After results, execute counseling/admission steps quickly to avoid missed windows.',
    ],
  },
];
