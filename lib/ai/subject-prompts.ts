export function buildSubjectSystemPromptAddendum(subject: string, classLevel: number): string {
  const s = subject.toLowerCase();

  if (s.includes('chem')) {
    return `CHEMISTRY-SPECIFIC RULES:
- Name reactions: always specify type (SN1/SN2, addition, elimination, substitution, condensation)
- Equations: balance chemical equations; include state symbols (s), (l), (g), (aq) where relevant
- Mechanisms: describe curved-arrow logic for organic; write half-reactions for electrochemistry
- Numericals: include formula used, substitution step, unit of final answer
- IUPAC names in options must be syntactically distinct, not just paraphrased
- Distractor patterns: sign error in ΔG/ΔH, confused reagents (KMnO₄ vs K₂Cr₂O₇), inverted rate laws, wrong oxidation state`;
  }

  if (s.includes('phy')) {
    return `PHYSICS-SPECIFIC RULES:
- Numericals: show formula → substitution → answer with SI unit in explanation
- Directions/signs: state sign convention explicitly (e.g. "taking rightward as positive")
- Distractor patterns: wrong formula variant (v² = u² − 2as instead of +), unit confusion (J vs eV), magnitude vs vector sign
- Kirchhoff's laws questions: specify junction rule or loop rule in the stem
- Class 12 numericals must match 3–5 mark board format; explanation should show key steps`;
  }

  if (s.includes('bio')) {
    return `BIOLOGY-SPECIFIC RULES:
- Diagram-based questions: reference the exact labelled part (e.g. "Bowman's capsule", "axon hillock")
- Process sequences: use ordered steps for multi-step processes (mitosis phases, transcription → translation)
- Terminology: use NCERT-exact terms — never synonyms (e.g. "Bowman's capsule" not "glomerular capsule")
- Assertion-Reason: pair a true biological principle with a plausible but causally wrong distractor as Reason
- Class 12: distinguish genetic terms clearly (genotype/phenotype, codominance/incomplete dominance, homozygous/heterozygous)`;
  }

  if (s.includes('math')) {
    return `MATHEMATICS-SPECIFIC RULES:
- Show formula, substitution step, and result in explanation; do not skip steps
- Distractors: plausible calculation errors — sign flip, wrong formula variant, arithmetic slip
- Word problems: state "Given:" and "To find:" in the question stem or explanation
- Class 10 mensuration: state which formula applies (CSA / TSA / Volume) in the explanation
- Class 12 integration: specify method (by parts, substitution, partial fractions) in explanation
- Proofs/derivations: state the starting identity or theorem in the question stem`;
  }

  if (s.includes('science') || s.includes('scince')) {
    return `CLASS 10 SCIENCE RULES:
- Chemistry questions: include balanced equation with state symbols in explanation
- Physics numericals: show formula, substitution, unit in explanation
- Biology: use NCERT diagram labels and process names exactly
- Mix question types across the three disciplines proportional to PYQ weightage
- Distractor patterns: common Class 10 errors (confused acid/base properties, wrong formula units, reversed cause-effect in biology)`;
  }

  if (s.includes('english') || (s.includes('eng') && classLevel >= 10)) {
    return `ENGLISH-SPECIFIC RULES:
- Extract-based: quote 4–6 words from the passage before the question ("In the line '...', the author suggests...")
- Character questions: anchor to a specific trait with textual evidence
- Theme/value questions: ask for the central message in 1 sentence
- Do NOT generate grammar, vocabulary fill-in-the-blank, or spelling MCQs — literature comprehension only`;
  }

  if (s.includes('account') || s.includes('acc')) {
    return `ACCOUNTANCY-SPECIFIC RULES:
- Journal entry questions: mention debit/credit rule in explanation
- Ratio analysis: state the full formula in explanation (e.g. Current Ratio = Current Assets / Current Liabilities)
- Numerical distractors: wrong denominator, reversed ratio, off-by-one period error
- Cash flow questions: specify operating / investing / financing category in options`;
  }

  if (s.includes('business') || s.includes('bst')) {
    return `BUSINESS STUDIES RULES:
- Case-based questions: provide a 2–3 line business scenario, then ask which concept/principle applies
- Principle identification: quote Fayol/Taylor name exactly as in NCERT
- Distinction questions: frame as "Which of the following is NOT a feature/function/type of..."
- Explanation: cite the chapter/principle name; avoid generic management buzzwords`;
  }

  if (s.includes('econom') || s.includes('eco')) {
    return `ECONOMICS-SPECIFIC RULES:
- Diagram-based MCQs: describe the shift ("AD curve shifts right when...") rather than asking to draw
- Formula MCQs: write the formula in the question stem (e.g. "Using MPC = ΔC/ΔY...")
- Numerical distractors: off-by-one multiplier error, wrong ratio formula, confused deficit types
- Distinguish microeconomics and macroeconomics terms clearly; do not mix chapters`;
  }

  return '';
}
