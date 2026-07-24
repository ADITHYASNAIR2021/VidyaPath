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
const edgeAuthFile = fs.existsSync(path.join(root, 'proxy.ts')) ? 'proxy.ts' : 'middleware.ts';
const middlewareTs = read(edgeAuthFile);
const guardsTs = read('lib/auth/guards.ts');
const interactiveApiPolicyTs = read('lib/security/interactive-api-policy.ts');
const packageJson = JSON.parse(read('package.json'));
const ciWorkflow = read('.github/workflows/ci.yml');
const publicSwPath = path.join(root, 'public', 'sw.js');
const publicSwJs = fs.existsSync(publicSwPath) ? read('public/sw.js') : '';
const nextConfigJs = read('next.config.js');
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
assertNotIncludes(middlewareTs, 'vp_role_hint', edgeAuthFile);
assertNotIncludes(middlewareTs, 'vidyapath-dev-session-secret', edgeAuthFile);
assertNotIncludes(middlewareTs, 'AUTH_REQUIRED_AI_API_PREFIXES', edgeAuthFile);
assertIncludes(middlewareTs, "if (pathname.startsWith('/api/'))", edgeAuthFile);
assertIncludes(guardsTs, 'isLegacySessionAuthEnabled', 'lib/auth/guards.ts');
assertIncludes(guardsTs, 'resolveSupabaseContext', 'lib/auth/guards.ts');
assertIncludes(interactiveApiPolicyTs, "'/api/ai/'", 'lib/security/interactive-api-policy.ts');
assertIncludes(interactiveApiPolicyTs, "'/api/generate-quiz'", 'lib/security/interactive-api-policy.ts');
assertIncludes(middlewareTs, 'isInteractiveApiRoute(pathname)', edgeAuthFile);
assertIncludes(ciWorkflow, 'name: CI', '.github/workflows/ci.yml');
assertNotIncludes(ciWorkflow, '# name: CI', '.github/workflows/ci.yml');
if (publicSwJs) {
  assertNotIncludes(publicSwJs, 'eval-source-map', 'public/sw.js');
  assertNotIncludes(publicSwJs, 'module.hot', 'public/sw.js');
} else {
  // Serwist generates public/sw.js during a production build. Fresh CI
  // checkouts run this guard before the build, so verify the source and
  // destination configuration when the generated artifact is absent.
  assertIncludes(nextConfigJs, "swSrc: 'app/sw.ts'", 'next.config.js');
  assertIncludes(nextConfigJs, "swDest: 'public/sw.js'", 'next.config.js');
}

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
      if (/\/api\/(?:admin|developer|parent|student|teacher)\/session\/(?:bootstrap|login)\/route\.ts$/.test(`/${relPath}`)) {
        assertNotIncludes(route, 'failOpen: true', relPath);
      }
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
