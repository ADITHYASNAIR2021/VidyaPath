export function normalizeDeveloperLoginIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function getConfiguredDeveloperIdentifier(): string | null {
  const configured = normalizeDeveloperLoginIdentifier(process.env.DEVELOPER_USERNAME || '');
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return 'developer@vidyapath';
  return null;
}

export function isDeveloperLoginIdentifier(value: string): boolean {
  const normalized = normalizeDeveloperLoginIdentifier(value);
  if (!normalized) return false;
  const configured = getConfiguredDeveloperIdentifier();
  if (configured && normalized === configured) return true;
  return normalized === 'developer@vidyapath';
}
