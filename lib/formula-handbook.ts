export interface ExternalFormulaEntry {
  chapterId: string;
  name: string;
  latex: string;
  sourceName: string;
  sourceUrl?: string;
}

export interface FormulaSourceDoc {
  subject: 'Physics' | 'Chemistry' | 'Biology' | 'Math' | 'Commerce';
  sourceName: string;
  localPath: string;
  sourceUrl?: string;
}

export const FORMULA_SOURCE_DOCS: FormulaSourceDoc[] = [
  { subject: 'Math', sourceName: 'Maths book 3.pdf', localPath: 'C:\\Users\\adith\\Downloads\\Maths book 3.pdf' },
  {
    subject: 'Math',
    sourceName: 'documents_148581-489262829-class-12-mathematics-all-formulas.pdf',
    localPath: 'C:\\Users\\adith\\Downloads\\documents_148581-489262829-class-12-mathematics-all-formulas.pdf',
  },
  { subject: 'Math', sourceName: 'Maths formulas.pdf', localPath: 'C:\\Users\\adith\\Downloads\\Maths formulas.pdf' },
  { subject: 'Biology', sourceName: 'Formula-Book_Biology-1.pdf', localPath: 'C:\\Users\\adith\\Downloads\\Formula-Book_Biology-1.pdf' },
  { subject: 'Chemistry', sourceName: 'Chemistry formula 3.pdf', localPath: 'C:\\Users\\adith\\Downloads\\Chemistry formula 3.pdf' },
  { subject: 'Chemistry', sourceName: 'Chemistry formulas part 2.pdf', localPath: 'C:\\Users\\adith\\Downloads\\Chemistry formulas part 2.pdf' },
  { subject: 'Chemistry', sourceName: 'Chemistry formulas.pdf', localPath: 'C:\\Users\\adith\\Downloads\\Chemistry formulas.pdf' },
  { subject: 'Physics', sourceName: 'Physics formula part 2.pdf', localPath: 'C:\\Users\\adith\\Downloads\\Physics formula part 2.pdf' },
  { subject: 'Physics', sourceName: 'Physics formula booklet.pdf', localPath: 'C:\\Users\\adith\\Downloads\\Physics formula booklet.pdf' },
  {
    subject: 'Commerce',
    sourceName: 'Class 12 Accountancy Ratio Chapter (reference)',
    localPath: 'Web reference',
    sourceUrl: 'https://www.vedantu.com/content-files-downloadable/ncert-solutions/ncert-solutions-class-12-accountancy-company-accounts-and-analysis-of-financial-statements-chapter-5.pdf',
  },
  {
    subject: 'Commerce',
    sourceName: 'Break-even formula reference',
    localPath: 'Web reference',
    sourceUrl: 'https://www.investopedia.com/ask/answers/032715/how-can-i-calculate-breakeven-analysis-excel.asp',
  },
];

export const EXTERNAL_FORMULA_ENTRIES: ExternalFormulaEntry[] = [
  { chapterId: 'c12-phy-1', name: "Coulomb's Law", latex: 'F = \\frac{1}{4\\pi\\varepsilon_0}\\frac{q_1 q_2}{r^2}', sourceName: 'Physics formula booklet.pdf' },
  { chapterId: 'c12-phy-1', name: 'Electric Field due to Point Charge', latex: 'E = \\frac{1}{4\\pi\\varepsilon_0}\\frac{q}{r^2}', sourceName: 'Physics formula booklet.pdf' },
  { chapterId: 'c12-phy-2', name: 'Electric Potential', latex: 'V = \\frac{1}{4\\pi\\varepsilon_0}\\frac{q}{r}', sourceName: 'Physics formula booklet.pdf' },
  { chapterId: 'c12-phy-3', name: 'Parallel Plate Capacitance', latex: 'C = \\frac{\\varepsilon_0 A}{d}', sourceName: 'Physics formula part 2.pdf' },
  { chapterId: 'c12-phy-3', name: 'Energy Stored in Capacitor', latex: 'U = \\frac{1}{2}CV^2 = \\frac{Q^2}{2C}', sourceName: 'Physics formula part 2.pdf' },
  { chapterId: 'c12-phy-4', name: "Ohm's Law", latex: 'V = IR', sourceName: 'Physics formula booklet.pdf' },
  { chapterId: 'c12-phy-4', name: 'Electrical Power', latex: 'P = VI = I^2R = \\frac{V^2}{R}', sourceName: 'Physics formula booklet.pdf' },
  { chapterId: 'c12-phy-7', name: "Faraday's Law", latex: '\\mathcal{E} = -\\frac{d\\Phi_B}{dt}', sourceName: 'Physics formula booklet.pdf' },
  { chapterId: 'c12-phy-8', name: 'AC RMS Current', latex: 'I_{\\mathrm{rms}} = \\frac{I_0}{\\sqrt{2}}', sourceName: 'Physics formula part 2.pdf' },
  { chapterId: 'c12-phy-8', name: 'Average AC Power', latex: 'P = V_{\\mathrm{rms}}I_{\\mathrm{rms}}\\cos\\phi', sourceName: 'Physics formula part 2.pdf' },
  { chapterId: 'c12-phy-10', name: 'Lens Formula', latex: '\\frac{1}{f} = \\frac{1}{v} - \\frac{1}{u}', sourceName: 'Physics formula booklet.pdf' },
  { chapterId: 'c12-phy-10', name: 'Lens Maker Formula', latex: '\\frac{1}{f} = (\\mu-1)\\left(\\frac{1}{R_1}-\\frac{1}{R_2}\\right)', sourceName: 'Physics formula booklet.pdf' },
  { chapterId: 'c12-phy-12', name: "de Broglie Wavelength", latex: '\\lambda = \\frac{h}{p} = \\frac{h}{mv}', sourceName: 'Physics formula booklet.pdf' },
  { chapterId: 'c12-phy-12', name: "Einstein's Photoelectric Equation", latex: 'h\\nu = \\phi + K_{\\max}', sourceName: 'Physics formula booklet.pdf' },

  { chapterId: 'c12-chem-1', name: "Raoult's Law", latex: 'p_i = x_i p_i^\\circ', sourceName: 'Chemistry formulas.pdf' },
  { chapterId: 'c12-chem-1', name: "van't Hoff Factor", latex: 'i = \\frac{\\text{observed colligative property}}{\\text{calculated colligative property}}', sourceName: 'Chemistry formulas.pdf' },
  { chapterId: 'c12-chem-1', name: 'Osmotic Pressure', latex: '\\Pi = iCRT', sourceName: 'Chemistry formulas.pdf' },
  { chapterId: 'c12-chem-2', name: 'Nernst Equation', latex: 'E = E^\\circ - \\frac{0.0591}{n}\\log Q', sourceName: 'Chemistry formulas part 2.pdf' },
  { chapterId: 'c12-chem-2', name: "Faraday's First Law", latex: 'm = ZIt', sourceName: 'Chemistry formulas part 2.pdf' },
  { chapterId: 'c12-chem-2', name: 'Molar Conductivity', latex: '\\Lambda_m = \\frac{\\kappa \\times 1000}{C}', sourceName: 'Chemistry formula 3.pdf' },
  { chapterId: 'c12-chem-3', name: 'Rate Law', latex: 'r = k[A]^m[B]^n', sourceName: 'Chemistry formulas part 2.pdf' },
  { chapterId: 'c12-chem-3', name: 'Arrhenius Equation', latex: 'k = A e^{-E_a/(RT)}', sourceName: 'Chemistry formula 3.pdf' },
  { chapterId: 'c12-chem-3', name: 'First-order Half-life', latex: 't_{1/2} = \\frac{0.693}{k}', sourceName: 'Chemistry formula 3.pdf' },
  { chapterId: 'c12-chem-12', name: 'Aldehyde Reduction', latex: 'RCHO + [H] \\rightarrow RCH_2OH', sourceName: 'Chemistry formulas.pdf' },
  { chapterId: 'c12-chem-12', name: 'Ketone Reduction', latex: 'R_2CO + [H] \\rightarrow R_2CHOH', sourceName: 'Chemistry formulas.pdf' },

  { chapterId: 'c12-bio-3', name: 'Population Growth (J-curve)', latex: '\\frac{dN}{dt} = rN', sourceName: 'Formula-Book_Biology-1.pdf' },
  { chapterId: 'c12-bio-3', name: 'Logistic Growth', latex: '\\frac{dN}{dt} = rN\\left(1-\\frac{N}{K}\\right)', sourceName: 'Formula-Book_Biology-1.pdf' },
  { chapterId: 'c12-bio-6', name: 'DNA Composition Rule', latex: 'A = T,\\; G = C', sourceName: 'Formula-Book_Biology-1.pdf' },
  { chapterId: 'c12-bio-13', name: 'Biomass Pyramid Trend', latex: '\\text{Producers} > \\text{Herbivores} > \\text{Carnivores}', sourceName: 'Formula-Book_Biology-1.pdf' },

  { chapterId: 'c12-math-5', name: 'Derivative Definition', latex: 'f^{\\prime}(x) = \\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}', sourceName: 'Maths formulas.pdf' },
  { chapterId: 'c12-math-6', name: 'Tangent Equation', latex: 'y - y_1 = m(x - x_1)', sourceName: 'Maths formulas.pdf' },
  { chapterId: 'c12-math-7', name: 'Integration by Parts', latex: '\\int u\\,dv = uv - \\int v\\,du', sourceName: 'Maths book 3.pdf' },
  { chapterId: 'c12-math-7', name: 'Standard Integral', latex: '\\int \\frac{dx}{a^2 + x^2} = \\frac{1}{a}\\tan^{-1}\\left(\\frac{x}{a}\\right) + C', sourceName: 'documents_148581-489262829-class-12-mathematics-all-formulas.pdf' },
  { chapterId: 'c12-math-8', name: 'Area under Curve', latex: '\\text{Area} = \\int_a^b y\\,dx', sourceName: 'Maths formulas.pdf' },
  { chapterId: 'c12-math-9', name: 'Variable Separable DE', latex: '\\frac{dy}{dx} = g(x)h(y) \\Rightarrow \\int \\frac{1}{h(y)}dy = \\int g(x)dx', sourceName: 'Maths book 3.pdf' },
  { chapterId: 'c12-math-13', name: "Bayes' Theorem", latex: 'P(A_i|B) = \\frac{P(A_i)P(B|A_i)}{\\sum_j P(A_j)P(B|A_j)}', sourceName: 'Maths formulas.pdf' },

  { chapterId: 'c12-acc-1', name: 'Sacrificing Ratio', latex: '\\text{Old Share} - \\text{New Share}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-acc-1', name: 'Gaining Ratio', latex: '\\text{New Share} - \\text{Old Share}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-acc-4', name: 'Current Ratio', latex: '\\frac{\\text{Current Assets}}{\\text{Current Liabilities}}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-acc-4', name: 'Quick Ratio', latex: '\\frac{\\text{Current Assets} - \\text{Inventory}}{\\text{Current Liabilities}}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-acc-4', name: 'Debt-Equity Ratio', latex: '\\frac{\\text{Total Debt}}{\\text{Shareholders Equity}}', sourceName: 'Class 12 Accountancy Ratio Chapter (reference)', sourceUrl: 'https://www.vedantu.com/content-files-downloadable/ncert-solutions/ncert-solutions-class-12-accountancy-company-accounts-and-analysis-of-financial-statements-chapter-5.pdf' },
  { chapterId: 'c12-acc-4', name: 'Return on Capital Employed', latex: '\\frac{\\text{EBIT}}{\\text{Capital Employed}} \\times 100', sourceName: 'Class 12 Accountancy Ratio Chapter (reference)', sourceUrl: 'https://www.vedantu.com/content-files-downloadable/ncert-solutions/ncert-solutions-class-12-accountancy-company-accounts-and-analysis-of-financial-statements-chapter-5.pdf' },
  { chapterId: 'c12-acc-5', name: 'Net Cash Flow', latex: '\\text{CFO} + \\text{CFI} + \\text{CFF}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-acc-5', name: 'Cash From Operating Activities (Indirect)', latex: '\\text{Net Profit Before Tax} + \\text{Non-cash items} - \\text{Non-operating incomes} \\pm \\Delta\\text{Working Capital}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-bst-2', name: 'Contribution per Unit', latex: '\\text{Selling Price per Unit} - \\text{Variable Cost per Unit}', sourceName: 'Break-even formula reference', sourceUrl: 'https://www.investopedia.com/ask/answers/032715/how-can-i-calculate-breakeven-analysis-excel.asp' },
  { chapterId: 'c12-bst-2', name: 'Break-even Point (Units)', latex: '\\frac{\\text{Fixed Cost}}{\\text{Contribution per Unit}}', sourceName: 'Break-even formula reference', sourceUrl: 'https://www.investopedia.com/ask/answers/032715/how-can-i-calculate-breakeven-analysis-excel.asp' },
  { chapterId: 'c12-bst-3', name: 'Break-even Sales Value', latex: '\\frac{\\text{Fixed Cost}}{\\text{P/V Ratio}}', sourceName: 'Break-even formula reference', sourceUrl: 'https://www.investopedia.com/ask/answers/032715/how-can-i-calculate-breakeven-analysis-excel.asp' },
  { chapterId: 'c12-eco-1', name: 'Real GDP', latex: '\\frac{\\text{Nominal GDP}}{\\text{GDP Deflator}} \\times 100', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-eco-1', name: 'GDP at Market Price', latex: '\\text{GDP}_{FC} + \\text{Net Indirect Taxes}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-eco-2', name: 'Average Propensity to Consume', latex: '\\text{APC} = \\frac{C}{Y}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-eco-2', name: 'Marginal Propensity to Consume', latex: '\\text{MPC} = \\frac{\\Delta C}{\\Delta Y}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-eco-2', name: 'Marginal Propensity to Save', latex: '\\text{MPS} = \\frac{\\Delta S}{\\Delta Y}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-eco-3', name: 'Multiplier', latex: 'k = \\frac{1}{1-\\text{MPC}}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-eco-3', name: 'Multiplier (Savings form)', latex: 'k = \\frac{1}{\\text{MPS}}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-eco-3', name: 'Money Multiplier', latex: '\\frac{1}{\\text{Reserve Ratio}}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-eco-4', name: 'Fiscal Deficit', latex: '\\text{Total Expenditure} - \\text{Total Receipts (excluding borrowings)}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-eco-4', name: 'Revenue Deficit', latex: '\\text{Revenue Expenditure} - \\text{Revenue Receipts}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-eco-4', name: 'Primary Deficit', latex: '\\text{Fiscal Deficit} - \\text{Interest Payments}', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-eco-5', name: 'Terms of Trade', latex: '\\frac{\\text{Export Price Index}}{\\text{Import Price Index}}\\times100', sourceName: 'Commerce formula set (curated)' },
  { chapterId: 'c12-eco-5', name: 'Balance of Trade', latex: '\\text{Exports} - \\text{Imports}', sourceName: 'Commerce formula set (curated)' },
];
