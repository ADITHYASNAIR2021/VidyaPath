#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNotIncludes(content, pattern, label) {
  assert(!content.includes(pattern), `${label}: found forbidden pattern "${pattern}"`);
}

function assertIncludes(content, pattern, label) {
  assert(content.includes(pattern), `${label}: missing required pattern "${pattern}"`);
}

const sessionTs = read('lib/auth/session.ts');
const parentSessionTs = read('lib/auth/parent-session.ts');
const middlewareTs = read('middleware.ts');
const guardsTs = read('lib/auth/guards.ts');
const packageJson = JSON.parse(read('package.json'));
const migrationDir = path.join(root, 'supabase', 'migrations');
const migrationNames = fs.existsSync(migrationDir) ? fs.readdirSync(migrationDir) : [];
const apiRouteDir = path.join(root, 'app', 'api');
const aiRoutesRequiringBudget = [
  'app/api/ai-tutor/route.ts',
  'app/api/generate-quiz/route.ts',
  'app/api/generate-flashcards/route.ts',
  'app/api/revision-plan/route.ts',
  'app/api/paper-evaluate/route.ts',
  'app/api/image-solve/route.ts',
  'app/api/chapter-pack/route.ts',
  'app/api/chapter-drill/route.ts',
  'app/api/chapter-diagnose/route.ts',
  'app/api/chapter-remediate/route.ts',
  'app/api/adaptive-test/route.ts',
  'app/api/teacher/ai/route.ts',
];

assertIncludes(sessionTs, 'SESSION_SIGNING_SECRET', 'lib/auth/session.ts');
assertNotIncludes(sessionTs, 'vidyapath-dev-session-secret', 'lib/auth/session.ts');
assertNotIncludes(parentSessionTs, 'vidyapath-dev-session-secret', 'lib/auth/parent-session.ts');
assertNotIncludes(middlewareTs, 'vp_role_hint', 'middleware.ts');
assertNotIncludes(middlewareTs, 'vidyapath-dev-session-secret', 'middleware.ts');
assertNotIncludes(middlewareTs, 'AUTH_REQUIRED_AI_API_PREFIXES', 'middleware.ts');
assertIncludes(middlewareTs, "if (pathname.startsWith('/api/'))", 'middleware.ts');
assertIncludes(guardsTs, 'isLegacySessionAuthEnabled', 'lib/auth/guards.ts');
assertIncludes(guardsTs, 'resolveSupabaseContext', 'lib/auth/guards.ts');

assert(!Object.prototype.hasOwnProperty.call(packageJson.dependencies || {}, 'xlsx'), 'package.json: xlsx dependency should be removed');

assert(
  migrationNames.some((name) => name.includes('rls')),
  'supabase/migrations: expected at least one RLS migration file'
);

for (const routePath of aiRoutesRequiringBudget) {
  const route = read(routePath);
  assertIncludes(route, 'checkAiTokenBudget', routePath);
}

if (fs.existsSync(apiRouteDir)) {
  const allowServiceClientRoutes = new Set([
    'app/api/health/ready/route.ts',
  ]);
  const allowLegacySupabaseHelperRoutes = new Set([
    'app/api/health/auth-diag/route.ts',
    'app/api/teacher/announcement-reads/route.ts',
  ]);
  const stack = [apiRouteDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || entry.name !== 'route.ts') continue;
      const relPath = path.relative(root, full).replace(/\\/g, '/');
      const route = fs.readFileSync(full, 'utf8');
      if (!allowLegacySupabaseHelperRoutes.has(relPath)) {
        assertNotIncludes(route, 'supabaseSelect', relPath);
        assertNotIncludes(route, 'supabaseInsert', relPath);
        assertNotIncludes(route, 'supabaseUpdate', relPath);
        assertNotIncludes(route, 'supabaseDelete', relPath);
        assertNotIncludes(route, 'supabaseRpc', relPath);
      }
      if (!allowServiceClientRoutes.has(relPath)) {
        assertNotIncludes(route, 'getServiceClient', relPath);
      }
    }
  }
}

console.log('Security assertions passed.');
