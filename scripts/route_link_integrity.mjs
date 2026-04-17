#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'app');
const API_DIR = path.join(APP_DIR, 'api');
const SCAN_DIRS = ['app', 'components', 'lib'].map((dir) => path.join(ROOT, dir));
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

function toPosix(input) {
  return input.replace(/\\/g, '/');
}

function relativePosix(absPath) {
  return toPosix(path.relative(ROOT, absPath));
}

function normalizePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const noHash = rawPath.split('#')[0];
  const noQuery = noHash.split('?')[0];
  const trimmed = noQuery.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed === '/') return '/';
  return trimmed.replace(/\/+$/, '');
}

function listFilesRecursive(startDir, predicate) {
  const out = [];
  if (!fs.existsSync(startDir)) return out;
  const stack = [startDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
        stack.push(full);
      } else if (entry.isFile() && (!predicate || predicate(full))) {
        out.push(full);
      }
    }
  }
  return out;
}

function buildApiRouteSet() {
  const routeFiles = listFilesRecursive(API_DIR, (full) => path.basename(full) === 'route.ts');
  const routes = new Set();
  for (const file of routeFiles) {
    const rel = toPosix(path.relative(API_DIR, file)).replace(/\/route\.ts$/, '');
    const routePath = normalizePath(`/api/${rel}`);
    if (routePath) routes.add(routePath);
  }
  return routes;
}

function buildPageRouteSet() {
  const pageFiles = listFilesRecursive(APP_DIR, (full) => path.basename(full) === 'page.tsx');
  const pages = new Set();
  for (const file of pageFiles) {
    const rel = toPosix(path.relative(APP_DIR, file)).replace(/\/page\.tsx$/, '');
    if (!rel) {
      pages.add('/');
      continue;
    }
    const segments = rel
      .split('/')
      .filter(Boolean)
      .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));
    const pagePath = normalizePath(`/${segments.join('/')}`) || '/';
    pages.add(pagePath);
  }
  return pages;
}

function routeToRegex(routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dynamic = escaped.replace(/\\\[[^\]]+\\\]/g, '[^/]+');
  return new RegExp(`^${dynamic}$`);
}

function hasMatch(reference, pathSet) {
  if (pathSet.has(reference)) return true;
  for (const entry of pathSet) {
    if (entry.includes('[') && routeToRegex(entry).test(reference)) return true;
  }
  return false;
}

function hasTemplatePrefixMatch(reference, pathSet) {
  const prefix = normalizePath(reference.split('${')[0]);
  if (!prefix) return false;
  for (const entry of pathSet) {
    if (entry === prefix || entry.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

function collectSourceFiles() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    files.push(
      ...listFilesRecursive(dir, (full) => SOURCE_EXTENSIONS.has(path.extname(full).toLowerCase()))
    );
  }
  return files;
}

function collectReferences(files, regexes) {
  const refs = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const regex of regexes) {
        regex.lastIndex = 0;
        let match = regex.exec(line);
        while (match) {
          const raw = match[1];
          const clean = normalizePath(raw);
          if (clean) {
            refs.push({
              file: relativePosix(file),
              line: index + 1,
              raw,
              clean,
            });
          }
          match = regex.exec(line);
        }
      }
    }
  }
  return refs;
}

function validateApiReferences(apiRoutes, apiRefs) {
  const unknown = [];
  for (const ref of apiRefs) {
    if (ref.clean.includes('${')) {
      if (!hasTemplatePrefixMatch(ref.clean, apiRoutes)) unknown.push(ref);
      continue;
    }
    if (!hasMatch(ref.clean, apiRoutes)) unknown.push(ref);
  }
  return unknown;
}

function validateNavReferences(pageRoutes, navRefs) {
  const unknown = [];
  for (const ref of navRefs) {
    if (ref.clean.startsWith('/api/')) continue;
    if (ref.clean.includes('${')) {
      if (!hasTemplatePrefixMatch(ref.clean, pageRoutes)) unknown.push(ref);
      continue;
    }
    if (!hasMatch(ref.clean, pageRoutes)) unknown.push(ref);
  }
  return unknown;
}

function printUnknown(label, unknown) {
  if (unknown.length === 0) {
    console.log(`${label}: OK`);
    return;
  }
  console.log(`${label}: ${unknown.length} issue(s)`);
  for (const ref of unknown.slice(0, 80)) {
    console.log(` - ${ref.file}:${ref.line} -> ${ref.raw}`);
  }
}

function main() {
  const apiRoutes = buildApiRouteSet();
  const pageRoutes = buildPageRouteSet();
  const sourceFiles = collectSourceFiles();

  const apiRefs = collectReferences(sourceFiles, [
    /fetch\(\s*["'`]((?:\/api\/)[^"'`\s)]+)["'`]/g,
    /axios\.(?:get|post|put|patch|delete)\(\s*["'`]((?:\/api\/)[^"'`\s)]+)["'`]/g,
  ]);

  const navRefs = collectReferences(sourceFiles, [
    /href\s*=\s*["'`]((?:\/)[^"'`\s]+)["'`]/g,
    /router\.(?:push|replace|prefetch)\(\s*["'`]((?:\/)[^"'`\s]+)["'`]/g,
    /pathname\s*=\s*["'`]((?:\/)[^"'`\s]+)["'`]/g,
    /openWindow\(\s*["'`]((?:\/)[^"'`\s]+)["'`]/g,
  ]);

  const unknownApi = validateApiReferences(apiRoutes, apiRefs);
  const unknownNav = validateNavReferences(pageRoutes, navRefs);

  console.log(`[route-link-integrity] routes=${apiRoutes.size}, pages=${pageRoutes.size}`);
  console.log(`[route-link-integrity] apiRefs=${apiRefs.length}, navRefs=${navRefs.length}`);
  printUnknown('[route-link-integrity] API references', unknownApi);
  printUnknown('[route-link-integrity] Navigation references', unknownNav);

  if (unknownApi.length > 0 || unknownNav.length > 0) {
    process.exitCode = 1;
    throw new Error('Route/link integrity check failed.');
  }
}

main();
