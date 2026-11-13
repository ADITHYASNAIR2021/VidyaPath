import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/quality-store', () => ({
  rankModelCandidatesForTask: async <T>(_task: string, candidates: T[]) => candidates,
  recordAiQualityRecord: async () => undefined,
}));

import { escapeControlCharsInJsonStrings } from '@/lib/ai/generator';

describe('escapeControlCharsInJsonStrings', () => {
  it('repairs literal newlines and tabs inside string values', () => {
    const broken = '{\n  "answer": "Line one\nLine two\twith tab",\n  "ok": true\n}';
    expect(() => JSON.parse(broken)).toThrow();
    const repaired = escapeControlCharsInJsonStrings(broken);
    expect(JSON.parse(repaired)).toEqual({ answer: 'Line one\nLine two\twith tab', ok: true });
  });

  it('leaves valid JSON and escaped quotes untouched', () => {
    const valid = '{"a": "He said \\"hi\\"", "b": [1, 2]}';
    expect(escapeControlCharsInJsonStrings(valid)).toBe(valid);
  });
});
