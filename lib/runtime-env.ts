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
  const alwaysRequired = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SESSION_SIGNING_SECRET',
  ];

  const productionOnly = [
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const required = new Set(alwaysRequired);
  if (process.env.NODE_ENV === 'production') {
    for (const key of productionOnly) required.add(key);
  }

  const issues: RuntimeEnvIssue[] = [];
  for (const name of required) {
    const issue = inspectVar(name);
    if (issue) issues.push(issue);
  }

  return {
    ok: issues.length === 0,
    issues,
    checkedAt: new Date().toISOString(),
    mode: process.env.NODE_ENV || 'development',
  };
}
