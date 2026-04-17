#!/usr/bin/env node
/**
 * Batch-migrate API routes from `parseJsonBodyWithLimit` to
 * `parseAndValidateJsonBody(..., permissiveObjectSchema)`. Use only for
 * routes where the existing body is already treated as `Record<string, unknown>`.
 *
 * Behaviour-preserving swap:
 *   - Body parsing now goes through zod (object shape + size limit).
 *   - Route-level normalization stays exactly the same.
 *   - Error status picks 413/422/400 via bodyReasonToStatus.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = execSync(
  `node -e "const { globSync } = require('glob'); process.stdout.write(globSync('app/api/**/route.ts').join('\\n'))"`,
  { encoding: 'utf8' }
)
  .trim()
  .split('\n')
  .filter(Boolean);

let changed = 0;
for (const rel of files) {
  const path = rel.replace(/\\/g, '/');
  const src = readFileSync(path, 'utf8');
  if (!src.includes('parseJsonBodyWithLimit')) continue;

  let next = src;

  // 1. Upgrade import line.
  next = next.replace(
    /import \{\s*parseJsonBodyWithLimit\s*\} from '@\/lib\/http\/request-body';/,
    `import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';\nimport { permissiveObjectSchema } from '@/lib/schemas/common';`
  );

  // 1b. Handle cases where parseJsonBodyWithLimit sits in a multi-import.
  next = next.replace(
    /import \{([^}]*)\bparseJsonBodyWithLimit\b([^}]*)\} from '@\/lib\/http\/request-body';/,
    (_, before, after) => {
      const remaining = (before + after)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(', ');
      const head = remaining
        ? `import { ${remaining}, parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';`
        : `import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';`;
      return `${head}\nimport { permissiveObjectSchema } from '@/lib/schemas/common';`;
    }
  );

  // 2. Swap call sites — accept optional generic (including nested <>) + any ws.
  next = next.replace(
    /parseJsonBodyWithLimit\s*(?:<[^(]*?>)?\s*\(\s*req\s*,\s*([^)]+)\)/g,
    (_, limit) => `parseAndValidateJsonBody(req, ${limit.trim()}, permissiveObjectSchema)`
  );

  // 3. Upgrade status mapping where literal pattern is used.
  next = next.replace(
    /status:\s*bodyResult\.reason\s*===\s*'payload-too-large'\s*\?\s*413\s*:\s*400,?/g,
    'status: bodyReasonToStatus(bodyResult.reason),\n      issues: bodyResult.issues,'
  );

  if (next !== src) {
    writeFileSync(path, next);
    changed += 1;
    console.log('migrated', path);
  }
}

console.log(`\nDone. ${changed} file(s) changed.`);
