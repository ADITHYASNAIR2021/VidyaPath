'use client';

import Link from 'next/link';
import { useMemo, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';

type ImportEntity = 'students' | 'teachers';

interface ParsedPreview {
  headers: string[];
  rows: Array<Record<string, string>>;
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

export default function AdminRosterImportPage() {
  const router = useRouter();
  const [entity, setEntity] = useState<ImportEntity>('students');
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<ParsedPreview>({ headers: [], rows: [] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const sampleTemplate = useMemo(() => (
    entity === 'students'
      ? 'name,rollNo,rollCode,classLevel,section,batch,pin,password\nArjun Nair,001,C12A001,12,A,2026,2244,2244'
      : 'name,phone,staffCode,scopeClassLevel,scopeSubject,scopeSection,pin,password\nAnanya Rao,9001000001,PHY12,12,Physics,A,2468,2468'
  ), [entity]);

  function refreshPreview(nextText: string) {
    setCsvText(nextText);
    setPreview(parseCsv(nextText));
  }

  async function onFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text().catch(() => '');
    refreshPreview(text);
  }

  async function runImport() {
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const rows = preview.rows;
      if (rows.length === 0) {
        setError('No rows found. Upload a valid CSV exported from Excel.');
        return;
      }
      const response = await fetch('/api/admin/import/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, rows }),
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }
      if (!response.ok || !payload) {
        setError(payload?.message || payload?.error || 'Import failed.');
        return;
      }
      const data = payload?.data ?? payload;
      setResult(data as Record<string, unknown>);
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
                Upload CSV exported from Excel to import students/teachers in one go.
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
              }}
              className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm"
            >
              <option value="students">Students import</option>
              <option value="teachers">Teachers import</option>
            </select>
            <label className="rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-sm">
              Upload CSV
              <input type="file" accept=".csv,text/csv" onChange={onFileSelect} className="mt-1 block w-full text-xs" />
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

          <textarea
            value={csvText}
            onChange={(event) => refreshPreview(event.target.value)}
            placeholder="Paste CSV text here..."
            className="mt-4 min-h-[220px] w-full rounded-xl border border-[#E8E4DC] px-3 py-2.5 text-xs"
          />

          <p className="mt-2 text-xs text-[#7A7490]">
            Supported columns for students: `name, rollNo, rollCode, classLevel, section, batch, pin, password`.
            Supported columns for teachers: `name, phone, staffCode, scopeClassLevel, scopeSubject, scopeSection, pin, password`.
          </p>
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
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="border-b border-[#F0ECE3] px-2 py-2 text-left">Row</th>
                    <th className="border-b border-[#F0ECE3] px-2 py-2 text-left">Entity</th>
                    <th className="border-b border-[#F0ECE3] px-2 py-2 text-left">Name</th>
                    <th className="border-b border-[#F0ECE3] px-2 py-2 text-left">Login ID</th>
                    <th className="border-b border-[#F0ECE3] px-2 py-2 text-left">PIN</th>
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
                        <td className="px-2 py-2">{String(credentials.pin || '-')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
