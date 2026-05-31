#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [, , scriptPath, ...args] = process.argv;

if (!scriptPath) {
  console.error('[run_python] Usage: node scripts/run_python.mjs <script.py> [args...]');
  process.exit(1);
}

const cwd = process.cwd();
const candidates = [
  { cmd: process.env.PYTHON, args: [] },
  { cmd: 'python', args: [] },
  { cmd: 'py', args: ['-3'] },
  { cmd: 'py', args: [] },
].filter((entry) => !!entry.cmd);

let lastError = null;
for (const candidate of candidates) {
  const result = spawnSync(candidate.cmd, [...candidate.args, path.resolve(cwd, scriptPath), ...args], {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  if (result.error) {
    lastError = result.error;
    continue;
  }
  process.exit(result.status ?? 0);
}

console.error('[run_python] Unable to find a working Python launcher (tried PYTHON, python, py -3, py).');
if (lastError) {
  console.error(lastError.message);
}
process.exit(1);
