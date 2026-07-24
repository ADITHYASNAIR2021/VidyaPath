#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`[audit-policy] ${message}`);
  process.exit(1);
}

function parseJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch (error) {
    fail(`Failed to parse JSON file: ${filePath}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

function extractGhsaId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/GHSA-[a-z0-9-]+$/i);
  return match ? match[0].toUpperCase() : null;
}

const cwd = process.cwd();
const auditPath = process.argv[2] || path.join(cwd, '.audit-report.json');
const riskRegisterPath =
  process.argv[3] || path.join(cwd, 'security', 'audit-risk-register.json');

if (!fs.existsSync(auditPath)) {
  fail(`Audit report not found: ${auditPath}`);
}
if (!fs.existsSync(riskRegisterPath)) {
  fail(`Risk register not found: ${riskRegisterPath}`);
}

const audit = parseJson(auditPath);
const riskRegister = parseJson(riskRegisterPath);

if (audit?.error) {
  const summary =
    typeof audit.error === 'string'
      ? audit.error
      : audit.error.summary || audit.error.message || JSON.stringify(audit.error);
  fail(`npm audit did not return a valid advisory report: ${summary}`);
}
if (
  !audit?.metadata ||
  !audit.metadata.vulnerabilities ||
  typeof audit.metadata.vulnerabilities !== 'object'
) {
  fail('npm audit report is missing metadata.vulnerabilities.');
}

const accepted = Array.isArray(riskRegister.acceptedAdvisories)
  ? riskRegister.acceptedAdvisories
  : [];
const acceptedMap = new Map(
  accepted
    .filter((entry) => entry && typeof entry.id === 'string')
    .map((entry) => [String(entry.id).toUpperCase(), entry]),
);

const vulnerabilities = audit?.vulnerabilities && typeof audit.vulnerabilities === 'object'
  ? Object.values(audit.vulnerabilities)
  : [];

const highOrCritical = [];
const unapprovedModerates = [];
const expiredAcceptances = [];

for (const vuln of vulnerabilities) {
  if (!vuln || typeof vuln !== 'object') continue;
  const severity = String(vuln.severity || '').toLowerCase();
  const via = Array.isArray(vuln.via) ? vuln.via : [];
  const advisoryIds = via
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => extractGhsaId(entry.url))
    .filter(Boolean);

  if (severity === 'high' || severity === 'critical') {
    highOrCritical.push({
      name: vuln.name || 'unknown',
      severity,
      advisories: advisoryIds,
    });
    continue;
  }

  if (severity !== 'moderate') continue;
  if (advisoryIds.length === 0) continue;

  let covered = false;
  for (const advisoryId of advisoryIds) {
    const acceptance = acceptedMap.get(advisoryId);
    if (!acceptance) continue;
    covered = true;
    const acceptedUntil = new Date(String(acceptance.acceptedUntil || ''));
    const now = new Date();
    if (!(acceptedUntil instanceof Date) || Number.isNaN(acceptedUntil.getTime()) || acceptedUntil < now) {
      expiredAcceptances.push({
        id: advisoryId,
        package: vuln.name || 'unknown',
        acceptedUntil: acceptance.acceptedUntil || 'invalid',
      });
    }
  }

  if (!covered) {
    unapprovedModerates.push({
      name: vuln.name || 'unknown',
      advisories: advisoryIds,
    });
  }
}

if (highOrCritical.length > 0) {
  fail(
    `Found high/critical advisories:\n${highOrCritical
      .map((item) => `  - ${item.name} (${item.severity}) ${item.advisories.join(', ')}`)
      .join('\n')}`,
  );
}

if (expiredAcceptances.length > 0) {
  fail(
    `Found expired advisory acceptances:\n${expiredAcceptances
      .map((item) => `  - ${item.id} (${item.package}) acceptedUntil=${item.acceptedUntil}`)
      .join('\n')}`,
  );
}

if (unapprovedModerates.length > 0) {
  fail(
    `Found moderate advisories without accepted risk entry:\n${unapprovedModerates
      .map((item) => `  - ${item.name} ${item.advisories.join(', ')}`)
      .join('\n')}`,
  );
}

console.log('[audit-policy] Pass: no high/critical advisories and all moderates are explicitly accepted.');
