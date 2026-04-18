import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

interface ParsedPreview {
  headers: string[];
  rows: Array<Record<string, string>>;
}

interface PythonLauncher {
  command: string;
  preArgs: string[];
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string): ParsedPreview {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const entry: Record<string, string> = {};
    headers.forEach((header, index) => {
      entry[header] = cells[index] ?? '';
    });
    return entry;
  });
  return { headers, rows };
}

function resolvePythonLauncher(): PythonLauncher | null {
  const configured = (process.env.VIDYAPATH_PYTHON_BIN || '').trim();
  const userProfile = (process.env.USERPROFILE || '').trim();
  const bundled = userProfile
    ? path.join(
        userProfile,
        '.cache',
        'codex-runtimes',
        'codex-primary-runtime',
        'dependencies',
        'python',
        'python.exe'
      )
    : '';

  const candidates: PythonLauncher[] = [];
  if (configured) candidates.push({ command: configured, preArgs: [] });
  if (bundled) candidates.push({ command: bundled, preArgs: [] });
  candidates.push({ command: 'python', preArgs: [] });
  candidates.push({ command: 'python3', preArgs: [] });
  candidates.push({ command: 'py', preArgs: ['-3'] });

  for (const candidate of candidates) {
    try {
      const probe = spawnSync(candidate.command, [...candidate.preArgs, '--version'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      if (probe.status === 0) return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return errorJson({
        requestId,
        errorCode: 'missing-file',
        message: 'file is required.',
        status: 400,
      });
    }

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv')) {
      const text = await file.text();
      const normalized = lowerName.endsWith('.tsv')
        ? text
            .split(/\r?\n/)
            .map((line) => line.replaceAll('\t', ','))
            .join('\n')
        : text;
      const preview = parseCsv(normalized);
      return dataJson({
        requestId,
        data: { preview, sheets: null, format: lowerName.endsWith('.tsv') ? 'tsv' : 'csv' },
      });
    }

    if (!lowerName.endsWith('.xlsx')) {
      return errorJson({
        requestId,
        errorCode: 'unsupported-file-type',
        message: 'Only .csv, .tsv, and .xlsx are supported.',
        status: 400,
      });
    }

    const tempDir = path.join(os.tmpdir(), 'vidyapath-roster-parse');
    await mkdir(tempDir, { recursive: true });
    const tempFilePath = path.join(tempDir, `${randomUUID()}.xlsx`);
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(tempFilePath, bytes);

    const scriptPath = path.join(process.cwd(), 'scripts', 'parse_roster_xlsx.py');
    const launcher = resolvePythonLauncher();
    if (!launcher) {
      return errorJson({
        requestId,
        errorCode: 'python-runtime-missing',
        message: 'Python runtime not found. Set VIDYAPATH_PYTHON_BIN or install Python 3 to enable XLSX parsing.',
        status: 503,
      });
    }

    const result = spawnSync(launcher.command, [...launcher.preArgs, scriptPath, tempFilePath], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });

    await unlink(tempFilePath).catch(() => undefined);

    if (result.status !== 0) {
      return errorJson({
        requestId,
        errorCode: 'xlsx-parse-failed',
        message: result.stderr?.trim() || 'Failed to parse XLSX file.',
        status: 500,
      });
    }

    const parsed = JSON.parse(result.stdout || '{}') as {
      preview?: ParsedPreview;
      sheets?: Record<string, Array<Record<string, string>>>;
      error?: string;
    };

    if (parsed.error) {
      return errorJson({
        requestId,
        errorCode: 'xlsx-parse-failed',
        message: parsed.error,
        status: 400,
      });
    }

    return dataJson({
      requestId,
      data: {
        preview: parsed.preview || { headers: [], rows: [] },
        sheets: parsed.sheets || {},
        format: 'xlsx',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse roster file.';
    return errorJson({
      requestId,
      errorCode: 'roster-parse-failed',
      message,
      status: 500,
    });
  }
}
