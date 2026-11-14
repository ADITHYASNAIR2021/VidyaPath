import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('offline indexing sequence', () => {
  it('repairs newly extracted metadata before indexing and embedding, without executing the plan', () => {
    const plan = execFileSync(process.execPath, [path.resolve('scripts/reindex.mjs'), '--repair-metadata', '--reextract', '--vectors'], { encoding: 'utf8' });
    const extraction = plan.indexOf('scripts/build_textbook_index.py');
    const repair = plan.indexOf('scripts/repair_textbook_mapping.py');
    const retrieval = plan.indexOf('scripts/build_retrieval_index.mjs');
    const embedding = plan.indexOf('scripts/build_vector_index.mjs');
    expect(extraction).toBeGreaterThan(0);
    expect(repair).toBeGreaterThan(extraction);
    expect(retrieval).toBeGreaterThan(repair);
    expect(embedding).toBeGreaterThan(retrieval);
    expect(plan).toContain('Dry run');
  });
});
