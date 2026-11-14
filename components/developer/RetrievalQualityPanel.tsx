'use client';

import { useMemo, useState } from 'react';
import type { RetrievalReport } from '@/lib/ai/retrieval-report';
import { Badge, Panel, Stat, Table, formatNumber } from '@/components/developer/ui';

export default function RetrievalQualityPanel({ report, onTest }: { report: RetrievalReport | null; onTest: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [needsWorkOnly, setNeedsWorkOnly] = useState(false);
  const rows = useMemo(() => report?.chapters.filter((chapter) => (!needsWorkOnly || chapter.reindexNeeded) && `${chapter.id} ${chapter.subject} ${chapter.title}`.toLowerCase().includes(query.toLowerCase())) ?? [], [report, query, needsWorkOnly]);
  if (!report) return <Panel title="Retrieval quality"><p className="text-sm">No build report is available. Run <code>npm run report:retrieval</code> and redeploy the generated manifest.</p></Panel>;
  return (
    <Panel title="Chapter coverage and indexing quality" subtitle={`Built ${new Date(report.generatedAt).toLocaleString()} · corpus ${report.artifactFingerprint.slice(0, 12)}`}>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Source chunks" value={formatNumber(report.totals.chunks)} hint={`${report.totals.mapped} mapped · ${report.totals.unmapped} broad subject chunks`} />
        <Stat label="Coverage review" value={`${report.needsWork}/${report.chapters.length}`} hint="Chapters with missing sources or weak topic coverage" tone={report.needsWork ? 'warn' : 'good'} />
        <Stat label="Index consistency" value={report.totals.indexMissingChunks === 0 ? 'Complete' : `${report.totals.indexMissingChunks} missing`} hint={`${report.totals.malformed} malformed · ${report.totals.duplicates} duplicate rows`} tone={report.totals.indexMissingChunks ? 'bad' : 'good'} />
        <Stat label="Retrieval benchmark" value={report.benchmark ? `${report.benchmark.passedCases}/${report.benchmark.totalCases}` : 'Not measured'} hint={report.benchmark?.stale ? 'Stale: rerun benchmark for this corpus' : report.benchmark ? `Top-three recall ${Math.round((report.benchmark.metrics.avgTop3TermRecall ?? 0) * 100)}%` : 'npm run eval:rag:report'} tone={report.benchmark?.stale ? 'warn' : 'neutral'} />
      </div>
      <p className="mb-4 text-xs text-[var(--color-text-secondary)]">{report.methodology}{!!report.totals.mirroredTextbookChunks && ` ${formatNumber(report.totals.mirroredTextbookChunks)} identical textbook records are mirrored across the main and textbook files; these are counted once.`}</p>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <input aria-label="Filter chapter coverage" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chapter, subject or ID" className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2" />
        <label className="flex items-center gap-2"><input type="checkbox" checked={needsWorkOnly} onChange={(event) => setNeedsWorkOnly(event.target.checked)} /> Needs review only</label>
      </div>
      <div className="max-h-[32rem] overflow-auto">
        <Table head={['Chapter', 'Textbook / PYQ / OCR', 'Indexed / vectors', 'Topic proxy', 'Review / action']}>
          {rows.map((chapter) => <tr key={chapter.id}>
            <td className="px-2 py-3"><p className="font-semibold">{chapter.title}</p><p className="text-[var(--color-text-muted)]">{chapter.id} · Class {chapter.classLevel} {chapter.subject}</p><button className="mt-1 text-saffron-600 underline" onClick={() => onTest(chapter.id)}>Use in retrieval test</button></td>
            <td className="px-2 py-3">{chapter.textbook} / {chapter.paper} / {chapter.imageOcr}<p className="mt-1 text-[var(--color-text-muted)]">{chapter.uniqueSources} sources</p></td>
            <td className="px-2 py-3">{chapter.indexed} / {chapter.vectors}</td>
            <td className="px-2 py-3">{chapter.lexicalTopicCoverage ?? '—'}%<p className="text-[var(--color-text-muted)]">{chapter.missingTopics.join(', ')}</p></td>
            <td className="px-2 py-3"><Badge tone={chapter.reindexNeeded ? 'warn' : 'good'}>{chapter.reindexNeeded ? 'Review coverage' : 'No count/topic gap'}</Badge><p className="mt-1">{chapter.reasons.join(' · ')}</p>{chapter.commands.map((command) => <code key={command} className="mt-1 block whitespace-normal break-all rounded bg-[var(--color-surface-soft)] p-2">{command}</code>)}</td>
          </tr>)}
        </Table>
      </div>
      <details className="mt-4 text-xs"><summary className="cursor-pointer font-semibold">Serving, model spaces and artifact integrity</summary>
        <div className="mt-2 space-y-2 text-[var(--color-text-secondary)]">{Object.entries(report.serving).map(([name, value]) => <p key={name}><strong>{name}:</strong> {value}</p>)}
          <p>Vectors: {report.totals.vectorCount} · missing {report.totals.vectorMissingChunks} · invalid {report.totals.invalidVectors} · orphaned {report.totals.orphanVectors}</p>
          {Object.entries(report.totals.vectorModels).map(([model, count]) => <p key={model} className="break-all font-mono">{model}: {count}</p>)}
          {report.artifacts.map((artifact) => <p key={artifact.file} className="break-all font-mono">{artifact.file}: {artifact.sha256}</p>)}
        </div>
      </details>
    </Panel>
  );
}
