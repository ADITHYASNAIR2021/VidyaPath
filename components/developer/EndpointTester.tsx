'use client';

import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { Badge, Button, Panel, Table } from '@/components/developer/ui';

interface EndpointCase {
  id: string;
  method: 'GET' | 'POST';
  path: string;
  usesAi: boolean;
  body?: Record<string, unknown> | (() => Record<string, unknown>);
}

function questionImageBase64(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 520;
  canvas.height = 140;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.font = '26px sans-serif';
  ctx.fillText('Q. Balance: Fe + H2O -> Fe3O4 + H2', 16, 50);
  ctx.fillText('(Class 10 Chemistry, 2 marks)', 16, 100);
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}

const CASES: EndpointCase[] = [
  { id: 'health', method: 'GET', path: '/api/health', usesAi: false },
  { id: 'ready', method: 'GET', path: '/api/health/ready', usesAi: false },
  { id: 'career-tracks', method: 'GET', path: '/api/career/tracks', usesAi: false },
  { id: 'career-exams', method: 'GET', path: '/api/career/exams', usesAi: false },
  { id: 'career-map', method: 'GET', path: '/api/career/map?chapterId=c12-phy-1', usesAi: false },
  { id: 'context-pack', method: 'POST', path: '/api/context-pack', usesAi: false, body: { classLevel: 10, subject: 'Chemistry', chapterId: 'c10-chem-1', query: 'balancing equations' } },
  {
    id: 'ai-tutor',
    method: 'POST',
    path: '/api/ai-tutor',
    usesAi: true,
    body: {
      messages: [{ role: 'user', content: 'What is a displacement reaction? Give one example.' }],
      chapterContext: { chapterId: 'c10-chem-1', title: 'Chemical Reactions and Equations', subject: 'Chemistry', classLevel: 10, topics: [] },
    },
  },
  { id: 'generate-quiz', method: 'POST', path: '/api/generate-quiz', usesAi: true, body: { chapterId: 'c10-chem-1', questionCount: 3 } },
  { id: 'generate-flashcards', method: 'POST', path: '/api/generate-flashcards', usesAi: true, body: { chapterId: 'c12-phy-1', cardCount: 3 } },
  { id: 'chapter-pack', method: 'POST', path: '/api/chapter-pack', usesAi: true, body: { chapterId: 'c10-chem-1' } },
  { id: 'chapter-drill', method: 'POST', path: '/api/chapter-drill', usesAi: true, body: { chapterId: 'c10-chem-1', questionCount: 3, questionType: 'mcq' } },
  { id: 'chapter-diagnose', method: 'POST', path: '/api/chapter-diagnose', usesAi: true, body: { chapterId: 'c10-chem-1', quizScore: 40, flashcardsDue: 5, studied: true, bookmarked: false } },
  { id: 'chapter-remediate', method: 'POST', path: '/api/chapter-remediate', usesAi: true, body: { chapterId: 'c10-chem-1', weakTags: ['balancing equations'], availableDays: 3, dailyMinutes: 30 } },
  { id: 'adaptive-test', method: 'POST', path: '/api/adaptive-test', usesAi: true, body: { classLevel: 10, subject: 'Chemistry', chapterIds: ['c10-chem-1'], questionCount: 3 } },
  { id: 'revision-plan', method: 'POST', path: '/api/revision-plan', usesAi: true, body: { classLevel: 10, subject: 'Chemistry', weeklyHours: 6, weakChapterIds: ['c10-chem-1'] } },
  {
    id: 'paper-evaluate',
    method: 'POST',
    path: '/api/paper-evaluate',
    usesAi: true,
    body: { paperId: 'b12-phy-2025', classLevel: 12, subject: 'Physics', answers: [{ questionNo: '1', answerText: "Coulomb's law: F = kq1q2/r^2" }] },
  },
  {
    id: 'image-solve',
    method: 'POST',
    path: '/api/image-solve',
    usesAi: true,
    body: () => ({ imageBase64: questionImageBase64(), mimeType: 'image/png', classLevel: 10, subject: 'Chemistry' }),
  },
];

interface CaseResult {
  status: number;
  latencyMs: number;
  summary: string;
}

/** Calls each public endpoint exactly as a student's browser would (same-origin, no login). */
export default function EndpointTester() {
  const [results, setResults] = useState<Record<string, CaseResult | 'running'>>({});
  const [runningAll, setRunningAll] = useState(false);

  async function run(testCase: EndpointCase) {
    setResults((prev) => ({ ...prev, [testCase.id]: 'running' }));
    const started = performance.now();
    try {
      const body = typeof testCase.body === 'function' ? testCase.body() : testCase.body;
      const response = await fetch(testCase.path, {
        method: testCase.method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      const data = payload?.data ?? payload;
      const summary = response.ok
        ? `keys: ${data && typeof data === 'object' ? Object.keys(data).slice(0, 6).join(', ') : typeof data}`
        : `${payload?.errorCode ?? ''} ${payload?.message ?? ''}`.trim();
      setResults((prev) => ({ ...prev, [testCase.id]: { status: response.status, latencyMs: Math.round(performance.now() - started), summary } }));
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [testCase.id]: { status: 0, latencyMs: Math.round(performance.now() - started), summary: error instanceof Error ? error.message : 'Network error' },
      }));
    }
  }

  async function runAll(includeAi: boolean) {
    setRunningAll(true);
    for (const testCase of CASES) {
      if (!includeAi && testCase.usesAi) continue;
      await run(testCase);
    }
    setRunningAll(false);
  }

  return (
    <Panel
      title="Public endpoint tester"
      subtitle="Runs real requests exactly like a student's browser. AI endpoints use real tokens and count toward this network's daily AI limit."
      actions={
        <>
          <Button onClick={() => runAll(false)} disabled={runningAll}>
            <Play className="h-3.5 w-3.5" /> Run non-AI checks
          </Button>
          <Button onClick={() => runAll(true)} disabled={runningAll} variant="primary">
            {runningAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run all (uses AI)
          </Button>
        </>
      }
    >
      <Table head={['Endpoint', 'AI', 'Status', 'Latency', 'Result', '']}>
        {CASES.map((testCase) => {
          const result = results[testCase.id];
          return (
            <tr key={testCase.id}>
              <td className="px-2 py-2 font-mono">
                {testCase.method} {testCase.path}
              </td>
              <td className="px-2 py-2">{testCase.usesAi ? <Badge tone="warn">AI</Badge> : <Badge tone="neutral">—</Badge>}</td>
              <td className="px-2 py-2">
                {result === 'running' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : result ? (
                  <Badge tone={result.status >= 200 && result.status < 300 ? 'good' : result.status === 429 ? 'warn' : 'bad'}>{result.status || 'ERR'}</Badge>
                ) : null}
              </td>
              <td className="px-2 py-2">{result && result !== 'running' ? `${result.latencyMs} ms` : ''}</td>
              <td className="max-w-[320px] truncate px-2 py-2 text-[var(--color-text-muted)]" title={result && result !== 'running' ? result.summary : ''}>
                {result && result !== 'running' ? result.summary : ''}
              </td>
              <td className="px-2 py-2">
                <Button onClick={() => run(testCase)} disabled={result === 'running' || runningAll}>
                  Run
                </Button>
              </td>
            </tr>
          );
        })}
      </Table>
    </Panel>
  );
}
