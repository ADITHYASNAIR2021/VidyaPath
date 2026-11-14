import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface RetrievalReport {
  version: number; generatedAt: string; artifactFingerprint: string;
  optionalVectorArtifact?: { file: string; uncompressedSha256: string } | null;
  artifacts: Array<{ file: string; bytes: number; sha256: string; uncompressedSha256?: string }>;
  totals: { chunks: number; mapped: number; unmapped: number; malformed: number; duplicates: number; mirroredTextbookChunks?: number; conflictingChunkIds?: number; sourceTypes: Record<string, number>; retrievalDocuments: number; indexMissingChunks: number; vectorCount: number; vectorMissingChunks: number; orphanVectors: number; invalidVectors: number; vectorModels: Record<string, number> };
  chapters: Array<{ id: string; classLevel: number; subject: string; title: string; topics: string[]; chunks: number; textbook: number; paper: number; imageOcr: number; uniqueSources: number; indexed: number; vectors: number; lexicalTopicCoverage: number | null; missingTopics: string[]; reindexNeeded: boolean; reasons: string[]; commands: string[] }>;
  benchmark: null | { generatedAt: string; totalCases: number; passedCases: number; skippedCases: number; metrics: Record<string, number>; stale: boolean; coverageGaps: Array<{ chapterId: string; subject: string; reason: string }> };
  needsWork: number; methodology: string;
  serving: { default: string; cdn: string; vectorDatabase: string; localVectors: string };
}

export async function readRetrievalReport(): Promise<RetrievalReport | null> {
  try {
    const report = JSON.parse(await fs.readFile(path.join(process.cwd(), 'lib/context/retrieval_manifest.json'), 'utf8')) as RetrievalReport;
    if (report.version !== 1 || !Array.isArray(report.chapters) || !report.artifactFingerprint || !report.totals) return null;
    return report;
  } catch { return null; }
}
