import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

mkdirSync('.cache', { recursive: true });
const report = path.resolve('.cache/rag-benchmark.json');
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'lib/ai/__tests__/rag-benchmark.test.ts'], { stdio: 'inherit', shell: false, env: { ...process.env, RAG_BENCHMARK_REPORT: report } });
// Keep the measured failures visible in the developer report as well as failing CI.
const manifest = spawnSync(process.execPath, ['scripts/generate_retrieval_report.mjs', '--benchmark', report], { stdio: 'inherit', shell: false });
process.exitCode = result.status || manifest.status || 0;
