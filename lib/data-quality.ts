import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';

interface DataQualitySummary {
  generatedAt: string;
  dataset: {
    totalPdf: number;
    totalMetadata: number;
    unknownPdf: number;
    unknownMetadata: number;
    class12Metadata: number;
    class12UnknownMetadata: number;
    unknownPct: number;
    class12UnknownPct: number;
  };
  hfIndex: {
    totalKeys: number;
    commerceKeys: number;
    englishCoreKeys: number;
  };
}

async function walkFiles(root: string, ext: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && full.toLowerCase().endsWith(ext.toLowerCase())) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 10000) / 100;
}

export async function getDataQualitySummary(): Promise<DataQualitySummary> {
  const root = process.cwd();
  const datasetRoot = path.join(root, 'dataset', 'cbse_papers');
  const hfIndexPath = path.join(root, 'lib', 'hfPaperIndex.json');

  const [pdfFiles, metadataFiles, hfIndexRaw] = await Promise.all([
    walkFiles(datasetRoot, '.pdf'),
    walkFiles(datasetRoot, '.metadata'),
    fs.readFile(hfIndexPath, 'utf8').catch(() => '{}'),
  ]);

  const unknownPdf = pdfFiles.filter((file) => file.includes(`${path.sep}Unknown${path.sep}`)).length;
  const unknownMetadata = metadataFiles.filter((file) => file.includes(`${path.sep}Unknown${path.sep}`)).length;
  const class12Metadata = metadataFiles.filter((file) => file.includes(`${path.sep}Class_12${path.sep}`)).length;
  const class12UnknownMetadata = metadataFiles.filter(
    (file) => file.includes(`${path.sep}Class_12${path.sep}`) && file.includes(`${path.sep}Unknown${path.sep}`)
  ).length;

  const hfIndex = JSON.parse(hfIndexRaw || '{}') as Record<string, string>;
  const keys = Object.keys(hfIndex);
  const commerceKeys = keys.filter(
    (key) => key.includes('|Accountancy|') || key.includes('|Business Studies|') || key.includes('|Economics|')
  ).length;
  const englishCoreKeys = keys.filter((key) => key.includes('|English Core|')).length;

  return {
    generatedAt: new Date().toISOString(),
    dataset: {
      totalPdf: pdfFiles.length,
      totalMetadata: metadataFiles.length,
      unknownPdf,
      unknownMetadata,
      class12Metadata,
      class12UnknownMetadata,
      unknownPct: percent(unknownMetadata, metadataFiles.length),
      class12UnknownPct: percent(class12UnknownMetadata, class12Metadata),
    },
    hfIndex: {
      totalKeys: keys.length,
      commerceKeys,
      englishCoreKeys,
    },
  };
}

export async function runContextReindex(): Promise<{
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const child = spawn('node', ['scripts/build_context_index.mjs'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        exitCode: Number(code || 0),
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
    child.on('error', (error) => {
      resolve({
        ok: false,
        exitCode: 1,
        stdout: stdout.trim(),
        stderr: `${stderr}\n${String(error)}`.trim(),
      });
    });
  });
}
