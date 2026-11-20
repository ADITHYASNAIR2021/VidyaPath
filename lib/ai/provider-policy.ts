/** Server policy for student data. A configured key is not provider approval. */
const REVIEWABLE_PROVIDERS = ['groq', 'mistral', 'nvidia', 'cerebras'] as const;

export function isStudentAiProviderAllowed(provider: string): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  // Gemini API terms prohibit clients directed towards / likely accessed by under-18s.
  // https://aistudio.google.com/docs/terms#age-requirements (checked 2026-11-20)
  if (provider === 'gemini' || process.env.AI_PUBLIC_ENABLED !== '1') return false;
  const approved = (process.env.AI_PUBLIC_PROVIDERS || '').split(',').map((value) => value.trim().toLowerCase());
  return (REVIEWABLE_PROVIDERS as readonly string[]).includes(provider) && approved.includes(provider);
}

export function hasApprovedStudentAiProvider(): boolean {
  return REVIEWABLE_PROVIDERS.some(isStudentAiProviderAllowed);
}
