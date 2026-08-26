export function normalizeDeveloperLoginIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function getConfiguredDeveloperIdentifier(): string | null {
  const configured = normalizeDeveloperLoginIdentifier(process.env.DEVELOPER_USERNAME || '');
  if (configured) return configured;
  return null;
}

export function isDeveloperLoginIdentifier(value: string): boolean {
  const normalized = normalizeDeveloperLoginIdentifier(value);
  if (!normalized) return false;
  const configured = getConfiguredDeveloperIdentifier();
  return configured !== null && normalized === configured;
}
