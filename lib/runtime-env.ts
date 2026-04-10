export interface RuntimeEnvIssue {
  name: string;
  reason: 'missing' | 'empty';
}

interface ValidationResult {
  ok: boolean;
  issues: RuntimeEnvIssue[];
  checkedAt: string;
  mode: string;
}

function inspectVar(name: string): RuntimeEnvIssue | null {
  const value = process.env[name];
  if (typeof value === 'undefined') return { name, reason: 'missing' };
  if (!value.trim()) return { name, reason: 'empty' };
  return null;
}

export function validateRuntimeEnv(): ValidationResult {
  const productionOnly = [
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const issues: RuntimeEnvIssue[] = [];

  const required = new Set([
    'NEXT_PUBLIC_SUPABASE_URL',
    'SESSION_SIGNING_SECRET',
  ]);
  if (process.env.NODE_ENV === 'production') {
    for (const key of productionOnly) required.add(key);
  }

  for (const name of required) {
    const issue = inspectVar(name);
    if (issue) issues.push(issue);
  }

  const hasAnonKey =
    !inspectVar('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
    !inspectVar('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY');
  if (!hasAnonKey) {
    issues.push({
      name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
      reason: 'missing',
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    checkedAt: new Date().toISOString(),
    mode: process.env.NODE_ENV || 'development',
  };
}
