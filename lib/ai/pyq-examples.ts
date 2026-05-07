export function getFewShotExamples(subject: string, classLevel: number): string {
  const s = subject.toLowerCase();

  if (s.includes('chem')) {
    return `FEW-SHOT STYLE REFERENCE — match this board-exam quality and format:

Example 1 — Application (Disproportionation):
Q: Which of the following is an example of a disproportionation reaction?
(A) P₄ + 3NaOH + 3H₂O → PH₃ + 3NaH₂PO₂  (B) 2Mg + O₂ → 2MgO
(C) Cl₂ + 2NaOH → NaCl + NaOCl + H₂O  (D) CaO + H₂O → Ca(OH)₂
Correct: (A) — P₄ (oxidation state 0) is simultaneously oxidised to +1 (NaH₂PO₂) and reduced to −3 (PH₃). Same element oxidised and reduced = disproportionation.

Example 2 — Numerical (Arrhenius Equation):
Q: The rate of a reaction doubles when temperature is raised from 300 K to 310 K. The activation energy Eₐ is approximately:
(A) 53.6 kJ mol⁻¹  (B) 76.4 kJ mol⁻¹  (C) 104.2 kJ mol⁻¹  (D) 38.5 kJ mol⁻¹
Correct: (A) — ln(k₂/k₁) = Eₐ/R × (1/T₁ − 1/T₂) → 0.693 = Eₐ/8.314 × 10/(300×310) → Eₐ ≈ 53,600 J mol⁻¹ = 53.6 kJ mol⁻¹.

Generate ALL questions in the same style: grounded in NCERT, factual distractors, concise explanation with formula/reaction.`;
  }

  if (s.includes('phy')) {
    return `FEW-SHOT STYLE REFERENCE — match this board-exam quality and format:

Example 1 — Numerical (Ray Optics):
Q: A convex lens (f = 20 cm) is placed in contact with a concave lens (f = 30 cm). The power of the combination is:
(A) +1.67 D  (B) −1.67 D  (C) +8.33 D  (D) +3.33 D
Correct: (A) — P₁ = +100/20 = +5 D; P₂ = −100/30 = −3.33 D; P = P₁ + P₂ = +1.67 D.

Example 2 — Numerical (Current Electricity):
Q: Three resistors 2 Ω, 3 Ω and 6 Ω are connected in parallel. Their equivalent resistance is:
(A) 1 Ω  (B) 11 Ω  (C) 2 Ω  (D) 0.5 Ω
Correct: (A) — 1/Rₑq = 1/2 + 1/3 + 1/6 = 3/6 + 2/6 + 1/6 = 1 → Rₑq = 1 Ω.

Generate ALL questions in the same style: show formula → substitution → unit; plausible numerical distractors.`;
  }

  if (s.includes('bio')) {
    return `FEW-SHOT STYLE REFERENCE — match this board-exam quality and format:

Example 1 — Assertion-Reason (Gene Expression):
Q: Assertion (A): Lac operon is switched ON in the presence of lactose.
   Reason (R): Lactose (as allolactose) binds the repressor, preventing it from attaching to the operator.
(A) Both A and R are true and R is the correct explanation of A
(B) Both A and R are true but R is not the correct explanation of A
(C) A is true but R is false  (D) A is false but R is true
Correct: (A) — Allolactose inactivates the repressor → operator is free → RNA polymerase transcribes lac structural genes.

Example 2 — Application (Genetics):
Q: In a monohybrid cross Tt × Tt, the probability of homozygous dominant (TT) offspring is:
(A) 25%  (B) 50%  (C) 75%  (D) 100%
Correct: (A) — Tt × Tt gives TT : Tt : tt = 1 : 2 : 1. TT = 1/4 = 25%.

Generate ALL questions with NCERT-exact terminology; use assertion-reason format for ≥15% of questions.`;
  }

  if (s.includes('math')) {
    if (classLevel <= 10) {
      return `FEW-SHOT STYLE REFERENCE — match this board-exam quality and format:

Example 1 — Application (Polynomials):
Q: If α and β are the zeros of p(x) = 2x² − 5x + 3, then α² + β² equals:
(A) 13/4  (B) 19/4  (C) 7/4  (D) 25/4
Correct: (A) — α + β = 5/2, αβ = 3/2. α² + β² = (α + β)² − 2αβ = 25/4 − 3 = 13/4.

Example 2 — Numerical (Arithmetic Progressions):
Q: The sum of the first 10 terms of an AP with first term 2 and common difference 3 is:
(A) 155  (B) 140  (C) 160  (D) 145
Correct: (A) — S₁₀ = 10/2 × [2(2) + 9(3)] = 5 × 31 = 155.

Generate ALL questions showing formula → substitution → result; use plausible calculation-error distractors.`;
    }
    return `FEW-SHOT STYLE REFERENCE — match this board-exam quality and format:

Example 1 — Conceptual (Calculus):
Q: The function f(x) = |x − 3| at x = 3 is:
(A) Continuous but NOT differentiable  (B) Differentiable but NOT continuous
(C) Both continuous and differentiable  (D) Neither continuous nor differentiable
Correct: (A) — |x − 3| is continuous everywhere. But LHD = −1 and RHD = +1 at x = 3, so it is not differentiable there.

Example 2 — Numerical (Definite Integral):
Q: The value of ∫₀^π sin x dx is:
(A) 2  (B) 0  (C) −2  (D) 1
Correct: (A) — [−cos x]₀^π = −cos π − (−cos 0) = 1 + 1 = 2.

Generate ALL questions showing formula, key steps, and final answer; distractors should be plausible sign/calculation errors.`;
  }

  if (s.includes('science') || s.includes('scince')) {
    return `FEW-SHOT STYLE REFERENCE — match this board-exam quality and format:

Example 1 — Application (Chemistry):
Q: Iron reacts with dilute sulphuric acid. The gas evolved is:
(A) H₂  (B) SO₂  (C) O₂  (D) H₂S
Correct: (A) — Fe + H₂SO₄ (dilute) → FeSO₄ + H₂↑. Fe is above H in the reactivity series; it displaces hydrogen from dilute acids.

Example 2 — Numerical (Physics):
Q: A conductor has resistance 10 Ω and a current of 2 A flows through it. The potential difference is:
(A) 20 V  (B) 5 V  (C) 0.2 V  (D) 50 V
Correct: (A) — Ohm's law: V = IR = 2 × 10 = 20 V.

Generate ALL questions grounded in NCERT; mix Physics, Chemistry and Biology proportional to PYQ weightage.`;
  }

  if (s.includes('account') || s.includes('acc')) {
    return `FEW-SHOT STYLE REFERENCE — match this board-exam quality and format:

Example 1 — Numerical (Ratio Analysis):
Q: Current Ratio = 2.5 : 1, Current Liabilities = ₹2,00,000. Current Assets are:
(A) ₹5,00,000  (B) ₹80,000  (C) ₹2,50,000  (D) ₹4,50,000
Correct: (A) — Current Assets = Current Ratio × Current Liabilities = 2.5 × 2,00,000 = ₹5,00,000.

Example 2 — Conceptual (Partnership):
Q: Goodwill brought in by an incoming partner is credited to:
(A) Sacrificing partners' capital accounts in sacrificing ratio
(B) All old partners' capital accounts in old profit-sharing ratio
(C) Goodwill account  (D) Incoming partner's capital account
Correct: (A) — Compensation goes to those who sacrificed, not all old partners equally.`;
  }

  if (s.includes('business') || s.includes('bst')) {
    return `FEW-SHOT STYLE REFERENCE — match this board-exam quality and format:

Example 1 — Case-based (Fayol's Principles):
Q: Rohan, a manager, tells his team: "Do whatever I say — I have the authority here." Which Fayol principle is being VIOLATED?
(A) Initiative  (B) Discipline  (C) Unity of Command  (D) Equity
Correct: (A) — Fayol's Initiative principle encourages subordinates to contribute ideas. A manager who only dictates suppresses initiative.

Example 2 — Conceptual (Controlling):
Q: Which plan provides a quantitative standard for measuring organisational performance?
(A) Budget  (B) Strategy  (C) Objective  (D) Policy
Correct: (A) — A budget is a planning AND control tool; it sets numerical targets for comparing actual vs planned performance.`;
  }

  if (s.includes('econom') || s.includes('eco')) {
    return `FEW-SHOT STYLE REFERENCE — match this board-exam quality and format:

Example 1 — Numerical (Multiplier):
Q: If MPC = 0.8, the value of the investment multiplier is:
(A) 5  (B) 8  (C) 4  (D) 0.2
Correct: (A) — K = 1/(1 − MPC) = 1/(1 − 0.8) = 1/0.2 = 5.

Example 2 — Numerical (Government Budget):
Q: Fiscal Deficit = ₹6,00,000 crore; Interest Payments = ₹2,50,000 crore. Primary Deficit = ?
(A) ₹3,50,000 crore  (B) ₹8,50,000 crore  (C) ₹2,50,000 crore  (D) ₹6,00,000 crore
Correct: (A) — Primary Deficit = Fiscal Deficit − Interest Payments = 6,00,000 − 2,50,000 = ₹3,50,000 crore.`;
  }

  if (s.includes('english') || (s.includes('eng') && classLevel >= 10)) {
    return `FEW-SHOT STYLE REFERENCE — match this board-exam quality and format:

Example 1 — Extract-based (Flamingo):
Q: In "The Last Lesson", M. Hamel wears his "fine Sunday clothes" on the last day. This most likely symbolises:
(A) Reverence for the French language and the gravity of the occasion
(B) His plan to attend a function after school
(C) Celebration of Alsace joining Prussia
(D) His usual habit of formal dress
Correct: (A) — M. Hamel's formal attire on the last day signals deep respect for the moment — the end of French instruction in Alsace.

Example 2 — Value-based (First Flight):
Q: What central value does Lencho's unwavering faith in "A Letter to God" convey?
(A) The power of faith, even when it leads to dramatic irony  (B) That God responds literally to prayer
(C) That post office workers are dishonest  (D) The importance of writing formally
Correct: (A) — The story honours Lencho's pure belief while the irony reveals the gap between faith and literal expectation.`;
  }

  return '';
}
