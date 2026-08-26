export type StudentSafetyInterventionKind =
  | 'crisis'
  | 'personal-data'
  | 'dangerous-request'
  | 'prompt-injection';

export interface StudentSafetyIntervention {
  kind: StudentSafetyInterventionKind;
  message: string;
}

const CRISIS_PATTERNS = [
  /\b(?:kill|hurt)\s+myself\b/i,
  /\b(?:suicide|suicidal|self[- ]?harm)\b/i,
  /\bi\s+(?:do not|don't)\s+want\s+to\s+live\b/i,
  /\bi\s+want\s+to\s+die\b/i,
];

const PERSONAL_DATA_PATTERNS = [
  /\bmy\s+(?:password|pin|otp)\s+(?:is|=)\b/i,
  /\bmy\s+(?:phone|mobile|whatsapp)\s+(?:number\s+)?(?:is|=)\b/i,
  /\bmy\s+(?:home\s+)?address\s+(?:is|=)\b/i,
  /\bmy\s+(?:email|e-mail)\s+(?:is|=)\b/i,
];

const DANGEROUS_REQUEST_PATTERNS = [
  /\bhow\s+(?:do\s+i|to)\s+(?:make|build|create)\s+(?:a\s+)?(?:bomb|weapon|explosive|poison)\b/i,
  /\b(?:instructions|steps|recipe)\s+(?:for|to)\s+(?:make|build|create)\s+(?:a\s+)?(?:bomb|weapon|explosive|poison)\b/i,
  /\bhow\s+(?:do\s+i|to)\s+(?:hack|steal|bypass)\b/i,
];

const PROMPT_INJECTION_PATTERNS = [
  /\bignore\s+(?:all\s+)?(?:previous|prior|system)\s+instructions?\b/i,
  /\b(?:reveal|show|print|repeat)\s+(?:the\s+)?(?:system|developer)\s+prompt\b/i,
  /\b(?:jailbreak|developer\s+mode|dan\s+mode)\b/i,
];

export function getStudentSafetyIntervention(input: string): StudentSafetyIntervention | null {
  const text = String(input || '').trim().slice(0, 12_000);
  if (!text) return null;

  if (CRISIS_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      kind: 'crisis',
      message:
        'I’m really glad you said something. Please tell a trusted adult—such as a parent, teacher, counsellor, or school administrator—right now and stay with someone you trust. In India, call Tele-MANAS at 14416 for 24/7 mental-health support. If you may be in immediate danger, call 112 now.',
    };
  }

  if (PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      kind: 'personal-data',
      message:
        'For your safety, please do not share passwords, PINs, OTPs, phone numbers, email addresses, or home addresses here. Remove that information and ask the learning question again.',
    };
  }

  if (DANGEROUS_REQUEST_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      kind: 'dangerous-request',
      message:
        'I can’t help with instructions that could harm people or systems. I can help with the safe CBSE science, mathematics, commerce, or English concept behind your question.',
    };
  }

  if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      kind: 'prompt-injection',
      message:
        'I can’t change or reveal my safety instructions. Ask me a Class 10 or Class 12 CBSE learning question and I’ll explain it with textbook-grounded evidence.',
    };
  }

  return null;
}
