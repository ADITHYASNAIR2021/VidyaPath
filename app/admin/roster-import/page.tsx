'use client';

import Link from 'next/link';
import { useMemo, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';

type ImportEntity = 'students' | 'teachers';
type SourceFormat = 'csv' | 'tsv' | 'xlsx';

interface ParsedPreview {
  headers: string[];
  rows: Array<Record<string, string>>;
}

interface ImportRowResult {
  rowIndex?: number;
  id?: string;
  entity?: string;
  name?: string;
  issuedCredentials?: {
    loginIdentifier?: string;
    alternateIdentifier?: string;
    password?: string;
  };
  message?: string;
  row?: Record<string, unknown>;
}

interface ImportResultPayload {
  createdCount?: number;
  failedCount?: number;
  created?: ImportRowResult[];
  failed?: ImportRowResult[];
  dryRun?: boolean;
}

function sanitizeCsvFormulaCell(value: string): string {
  const trimmed = value.trimStart();
  if (!trimmed) return value;
  const first = trimmed[0];
  if (first === '=' || first === '+' || first === '-' || first === '@') {
    return `'${value}`;
  }
  return value;
}

function escapeCsvCell(value: string): string {
  const normalized = sanitizeCsvFormulaCell(value).replaceAll('"', '""');
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
}

function downloadCsvFile(fileName: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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

function toCsv(preview: ParsedPreview): string {
  if (preview.headers.length === 0) return '';
  const escapeCell = (value: string) => {
    const normalized = value.replaceAll('"', '""');
    return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
  };
  const headerLine = preview.headers.map(escapeCell).join(',');
  const rowLines = preview.rows.map((row) =>
    preview.headers.map((header) => escapeCell(String(row[header] ?? ''))).join(',')
  );
  return [headerLine, ...rowLines].join('\n');
}

async function parseSpreadsheetFile(file: File): Promise<{ preview: ParsedPreview; sheets?: Record<string, Array<Record<string, string>>>; format: SourceFormat }> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.xlsx')) {
    const formData = new FormData();
    formData.set('file', file, file.name);
    const response = await fetch('/api/admin/import/roster/parse', {
      method: 'POST',
      body: formData,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) {
      throw new Error(payload?.message || 'Failed to parse XLSX.');
    }
    const data = (payload.data || payload) as {
      preview?: ParsedPreview;
      sheets?: Record<string, Array<Record<string, string>>>;
    };
    return {
      preview: data.preview || { headers: [], rows: [] },
      sheets: data.sheets || {},
      format: 'xlsx',
    };
  }

  const text = await file.text().catch(() => '');
  if (lowerName.endsWith('.tsv')) {
    const csvLike = text
      .split(/\r?\n/)
      .map((line) => line.replaceAll('\t', ','))
      .join('\n');
    return { preview: parseCsv(csvLike), format: 'tsv' };
  }
  return { preview: parseCsv(text), format: 'csv' };
}

function downloadTemplate(entity: ImportEntity, template: string) {
  const blob = new Blob([template], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = entity === 'students' ? 'vidyapath_students_template.csv' : 'vidyapath_teachers_template.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function pickPreviewFromSheets(entity: ImportEntity, sheets: Record<string, Array<Record<string, string>>>): ParsedPreview {
  const preferredSheet = entity === 'teachers'
    ? (sheets.Teachers ? 'Teachers' : Object.keys(sheets)[0])
    : (sheets.Students ? 'Students' : Object.keys(sheets)[0]);
  const rows = preferredSheet ? sheets[preferredSheet] || [] : [];
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

export default function AdminRosterImportPage() {
  const router = useRouter();
  const [entity, setEntity] = useState<ImportEntity>('students');
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<ParsedPreview>({ headers: [], rows: [] });
  const [sheets, setSheets] = useState<Record<string, Array<Record<string, string>>> | null>(null);
  const [sourceFormat, setSourceFormat] = useState<SourceFormat>('csv');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResultPayload | null>(null);
  const [emergencyOverride, setEmergencyOverride] = useState(false);
  const [dryRun, setDryRun] = useState(true);

  const sampleTemplate = useMemo(() => (
    entity === 'students'
      ? 'name,rollNo,classLevel,section,batch,schoolName,subjects,yearOfEnrollment\nArjun Nair,001,12,A,2026,VidyaPath Public School,"Physics,Chemistry,Math,English Core",2026'
      : 'name,email,phone,staffCode,scopeClassLevel,scopeSubject,scopeSection,schoolName\nAnanya Rao,ananya.rao@example.com,9001000001,PHY12,12,Physics,A,VidyaPath Public School'
  ), [entity]);

  function refreshPreview(nextText: string) {
    setCsvText(nextText);
    const parsed = parseCsv(nextText);
    setPreview(parsed);
    setSheets(null);
    setSourceFormat('csv');
  }

  async function onFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseSpreadsheetFile(file);
      setSourceFormat(parsed.format);
      if (parsed.sheets) {
        setSheets(parsed.sheets);
        const picked = pickPreviewFromSheets(entity, parsed.sheets);
        setPreview(picked);
        setCsvText(toCsv(picked));
      } else {
        setSheets(null);
        setPreview(parsed.preview);
        setCsvText(toCsv(parsed.preview));
      }
    } catch {
      setError('Failed to parse file. Please verify CSV/XLSX format.');
    }
  }

  async function runImport() {
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const rows = preview.rows;
      if (!sheets && rows.length === 0) {
        setError('No rows found. Upload a valid CSV/XLSX file.');
        return;
      }
      const response = await fetch('/api/admin/import/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity,
          rows,
          sheets: sheets || undefined,
          mode: sheets ? 'relational' : 'simple',
          sourceFormat,
          dryRun,
          forcePasswordChangeOnFirstLogin: true,
          emergencyOverride: entity === 'students' ? emergencyOverride : undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }
      if (!response.ok || !payload) {
        const firstIssue = Array.isArray(payload?.issues) && payload.issues.length > 0
          ? payload.issues[0]
          : null;
        const firstIssueText = firstIssue?.path && firstIssue?.message
          ? `${String(firstIssue.path)}: ${String(firstIssue.message)}`
          : firstIssue?.message
            ? String(firstIssue.message)
            : '';
        setError(firstIssueText || payload?.message || payload?.error || 'Import failed.');
        return;
      }
      const data = payload?.data ?? payload;
      setResult(data as ImportResultPayload);
    } catch {
      setError('Import failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-fraunces text-3xl font-bold text-navy-700">Bulk Roster Import</h1>
              <p className="mt-1 text-sm text-[#5F5A73]">
                Upload CSV/TSV/XLSX to import students and teachers with secure auto-issued passwords.
              </p>
            </div>
            <Link href="/admin" className="rounded-xl border border-[#E8E4DC] bg-white px-3 py-2 text-sm font-semibold text-navy-700">
              Back to admin
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <select
              value={entity}
              onChange={(event) => {
                const next = event.target.value === 'teachers' ? 'teachers' : 'students';
                setEntity(next);
                setResult(null);
                if (sheets) {
                  const picked = pickPreviewFromSheets(next, sheets);
                  setPreview(picked);
                  setCsvText(toCsv(picked));
                }
              }}
              className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm"
            >
              <option value="students">Students import</option>
              <option value="teachers">Teachers import</option>
            </select>
            <label className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm">
              Upload CSV/TSV/XLSX
              <input type="file" accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFileSelect} className="mt-1 block w-full text-xs" />
            </label>
            <button
              type="button"
              onClick={() => refreshPreview(sampleTemplate)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700"
            >
              Load sample template
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={submitting}
              className="rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? 'Importing...' : 'Run Import'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadTemplate('students', 'name,rollNo,classLevel,section,batch,schoolName,subjects,yearOfEnrollment\nArjun Nair,001,12,A,2026,VidyaPath Public School,"Physics,Chemistry,Math,English Core",2026')}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Download Students CSV Template
            </button>
            <button
              type="button"
              onClick={() => downloadTemplate('teachers', 'name,email,phone,staffCode,scopeClassLevel,scopeSubject,scopeSection,schoolName\nAnanya Rao,ananya.rao@example.com,9001000001,PHY12,12,Physics,A,VidyaPath Public School')}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Download Teachers CSV Template
            </button>
          </div>

          <textarea
            value={csvText}
            onChange={(event) => refreshPreview(event.target.value)}
            placeholder="Paste CSV text here..."
            className="mt-4 min-h-[220px] w-full rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-xs"
          />

          <p className="mt-2 text-xs text-[#7A7490]">
            Source: {sourceFormat.toUpperCase()} {sheets ? '(relational sheets detected)' : '(simple rows mode)'}.
            Students: name, classLevel, batch, rollNo or rollCode, schoolName, subjects, yearOfEnrollment.
            Teachers: name, email, schoolName, scopeClassLevel, scopeSubject, scopeSection.
          </p>
          {entity === 'students' && (
            <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-amber-800">
              <input
                type="checkbox"
                checked={emergencyOverride}
                onChange={(event) => setEmergencyOverride(event.target.checked)}
              />
              Emergency override (use only if class-teacher import is unavailable)
            </label>
          )}
          <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-[#4A4560]">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(event) => setDryRun(event.target.checked)}
            />
            Dry run validation only (recommended before final import)
          </label>
        </div>

        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
          <h2 className="font-fraunces text-xl font-bold text-navy-700">Preview</h2>
          <p className="mt-1 text-xs text-[#7A7490]">{preview.rows.length} rows detected</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {preview.headers.map((header) => (
                    <th key={header} className="border-b border-[#F0ECE3] px-2 py-2 text-left text-[#7A7490]">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 8).map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-[#F0ECE3]">
                    {preview.headers.map((header) => (
                      <td key={`${rowIndex}-${header}`} className="px-2 py-2 text-[#1C1C2E]">
                        {row[header] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}

        {result && (
          <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
            <h2 className="font-fraunces text-xl font-bold text-navy-700">Import Result</h2>
            <p className="mt-2 text-sm text-[#4A4560]">
              Created: {Number(result.createdCount) || 0} | Failed: {Number(result.failedCount) || 0}
              {result.dryRun ? ' | Dry run mode' : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const created = Array.isArray(result.created) ? result.created : [];
                  const rows: string[][] = [
                    ['rowIndex', 'entity', 'name', 'loginIdentifier', 'alternateIdentifier', 'temporaryPassword'],
                    ...created.map((item) => [
                      String(item.rowIndex || ''),
                      String(item.entity || ''),
                      String(item.name || ''),
                      String(item.issuedCredentials?.loginIdentifier || ''),
                      String(item.issuedCredentials?.alternateIdentifier || ''),
                      String(item.issuedCredentials?.password || ''),
                    ]),
                  ];
                  downloadCsvFile(
                    result.dryRun ? 'roster_dryrun_credentials_preview.csv' : 'roster_issued_credentials.csv',
                    rows
                  );
                }}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                Download Credential Report CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  const failed = Array.isArray(result.failed) ? result.failed : [];
                  const rows: string[][] = [
                    ['rowIndex', 'message', 'rawRow'],
                    ...failed.map((item) => [
                      String(item.rowIndex || ''),
                      String(item.message || ''),
                      JSON.stringify(item.row || {}),
                    ]),
                  ];
                  downloadCsvFile('roster_import_errors.csv', rows);
                }}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                Download Error Report CSV
              </button>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="border-b border-[#F0ECE3] px-2 py-2 text-left">Row</th>
                    <th className="border-b border-[#F0ECE3] px-2 py-2 text-left">Entity</th>
                    <th className="border-b border-[#F0ECE3] px-2 py-2 text-left">Name</th>
                    <th className="border-b border-[#F0ECE3] px-2 py-2 text-left">Login ID</th>
                    <th className="border-b border-[#F0ECE3] px-2 py-2 text-left">Temp Password</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(result.created) ? result.created : []).slice(0, 40).map((item) => {
                    const row = item as Record<string, unknown>;
                    const credentials = (row.issuedCredentials || {}) as Record<string, unknown>;
                    return (
                      <tr key={`${row.rowIndex}-${String(row.id)}`} className="border-b border-[#F0ECE3]">
                        <td className="px-2 py-2">{String(row.rowIndex || '-')}</td>
                        <td className="px-2 py-2">{String(row.entity || '-')}</td>
                        <td className="px-2 py-2">{String(row.name || '-')}</td>
                        <td className="px-2 py-2">{String(credentials.loginIdentifier || '-')}</td>
                        <td className="px-2 py-2">{String(credentials.password || '-')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(Array.isArray(result.failed) ? result.failed : []).length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="border-b border-[#F0ECE3] px-2 py-2 text-left">Failed Row</th>
                      <th className="border-b border-[#F0ECE3] px-2 py-2 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(result.failed) ? result.failed : []).slice(0, 40).map((item, index) => (
                      <tr key={`${item.rowIndex || index}`} className="border-b border-[#F0ECE3]">
                        <td className="px-2 py-2">{String(item.rowIndex || '-')}</td>
                        <td className="px-2 py-2">{String(item.message || 'Import failed.')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
