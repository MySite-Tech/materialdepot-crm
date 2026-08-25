// ── KAM client-list bulk import: parse + validate ─────────────────────────────
// Pure functions, no React and no network, so the rules can be reasoned about
// (and tested) on their own. KAMs.tsx renders whatever this reports.
//
// The column order is positional, not header-driven — that is the existing
// contract with the ops team's sheet, so it stays.

import { KAM_STAGES, KAMS, type KamClient, type KamStage } from './mockData';

export const UPLOAD_COLUMNS = [
  'Client Name', 'Contact Person', 'Phone', 'ENQ ID', 'Value',
  'Expected Closure', 'PI Status', 'KAM', 'Notes',
];

export type RowSeverity = 'ok' | 'warn' | 'error';

export interface RowIssue {
  column: string;
  message: string;
  severity: 'warn' | 'error';
}

export interface ParsedRow {
  line: number;              // 1-based row number in the source file/paste
  company: string;           // best-effort label for the log, even when invalid
  severity: RowSeverity;
  issues: RowIssue[];
  client?: KamClient;        // absent when severity === 'error'
  isUpdate?: boolean;        // matched an existing client, so this is an update
  saveError?: string;        // filled in after the write is attempted
}

// ── Cell hygiene ──────────────────────────────────────────────────────────────

// A BOM, a non-breaking space or a zero-width char in the first cell is the
// single most common reason a re-uploaded export "fails": the header stops
// matching and lands in the board as a client called "Client Name".
function cleanCell(v: unknown): string {
  return String(v ?? '')
    .replace(/^﻿/, '')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/ /g, ' ')
    .trim();
}

const normalize = (v: string) => cleanCell(v).toLowerCase().replace(/\s+/g, ' ');

// ── Delimited-text parsing ────────────────────────────────────────────────────

// Excel on a European locale exports semicolon-delimited .csv, and copying out
// of a spreadsheet gives tabs. Sniff the first line rather than assuming commas.
export function sniffDelimiter(text: string): string {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) || '';
  let best = ',';
  let bestCount = -1;
  for (const d of [',', ';', '\t', '|']) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return bestCount > 0 ? best : ',';
}

// Full-text CSV parser. The previous line-by-line split broke any row containing
// a quoted newline (a multi-line note), silently shifting every later column.
export function parseDelimited(text: string, delimiter = sniffDelimiter(text)): string[][] {
  const t = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"') {
        if (t[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === delimiter) { row.push(cur); cur = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; continue; }
    cur += ch;
  }
  // A trailing newline must not manufacture a phantom final row.
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }

  // Blank rows are kept deliberately: `line` in the error log has to be the row
  // number the user sees in their spreadsheet, so compacting here would make
  // every reported row number wrong after the first gap.
  return rows;
}

// ── Field coercion ────────────────────────────────────────────────────────────

export function parsePhone(raw: string): { phone: string; error?: string } {
  const cleaned = cleanCell(raw);
  if (!cleaned) return { phone: '' };
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return { phone: '', error: `"${cleaned}" has no digits` };
  // Tolerate a 91/0 prefix; anything else of the wrong length is a real problem
  // and must not be stored, because deal-ticket matching keys on this.
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return { phone: '', error: `expected 10 digits, got ${digits.length} ("${cleaned}")` };
  if (!/^[6-9]/.test(local)) return { phone: local, error: `"${local}" is not a valid Indian mobile number` };
  return { phone: local };
}

export function parseValue(raw: string): { value: number; error?: string } {
  const cleaned = cleanCell(raw);
  if (!cleaned) return { value: 0 };
  // Strips ₹, Rs, spaces and Indian digit grouping (2,65,000). A stray second
  // decimal point used to yield NaN and be stored as 0 with no warning.
  const stripped = cleaned.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (!/^-?\d*\.?\d+$/.test(stripped)) return { value: 0, error: `"${cleaned}" is not a number` };
  const n = Number(stripped);
  if (!Number.isFinite(n)) return { value: 0, error: `"${cleaned}" is not a number` };
  if (n < 0) return { value: 0, error: `value cannot be negative ("${cleaned}")` };
  return { value: n };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// Real calendar check — 31/02 must not silently become 03/03.
function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Accepts ISO, D/M/Y, D-M-Y, D Mon Y, Mon D Y and Excel serial numbers, and
// always returns ISO. Previously the cell was stored verbatim, so anything but
// ISO rendered as an empty <input type="date"> — data loss with no message.
export function parseClosureDate(raw: string): { date?: string; error?: string } {
  const cleaned = cleanCell(raw);
  if (!cleaned) return {};

  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [y, m, d] = isoMatch.slice(1).map(Number);
    return validYmd(y, m, d) ? { date: iso(y, m, d) } : { error: `"${cleaned}" is not a real date` };
  }

  // Excel serial (days since 1899-12-30). Only in a plausible date range, so a
  // bare number like 45000 isn't mistaken for something else.
  if (/^\d{5}$/.test(cleaned)) {
    const serial = Number(cleaned);
    if (serial >= 20000 && serial <= 60000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
      return { date: dt.toISOString().slice(0, 10) };
    }
  }

  // D/M/Y or D-M-Y. Day-first: the sheet is Indian, and 13/08/2026 is
  // unambiguous proof of that ordering.
  const dmy = cleaned.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (validYmd(y, m, d)) return { date: iso(y, m, d) };
    if (validYmd(y, d, m)) return { error: `"${cleaned}" is ambiguous — use YYYY-MM-DD` };
    return { error: `"${cleaned}" is not a real date` };
  }

  // "12 Aug 2026" / "Aug 12 2026"
  const words = cleaned.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 3) {
    const monthIdx = words.findIndex((w) => MONTHS.indexOf(w.slice(0, 3).toLowerCase()) >= 0);
    if (monthIdx >= 0) {
      const m = MONTHS.indexOf(words[monthIdx].slice(0, 3).toLowerCase()) + 1;
      const rest = words.filter((_, i) => i !== monthIdx).map(Number);
      const d = rest.find((n) => n >= 1 && n <= 31);
      const y = rest.find((n) => n >= 1900);
      if (d && y && validYmd(y, m, d)) return { date: iso(y, m, d) };
    }
  }

  return { error: `"${cleaned}" is not a recognised date — use YYYY-MM-DD` };
}

// Case- and spacing-insensitive, so "pi shared" and "PI  Shared" both land.
export function matchStage(raw: string): KamStage | null {
  const n = normalize(raw);
  if (!n) return null;
  return (KAM_STAGES.find((s) => normalize(s) === n) as KamStage | undefined) ?? null;
}

// Exact match first, then unique first-name/substring match, so "jadhav" finds
// "Jadhav" and "krishna b" finds "Krishna Bhagavatula". A name matching two KAMs
// stays unresolved rather than picking one.
export function matchKam(raw: string): string | null {
  const n = normalize(raw);
  if (!n) return null;
  const exact = KAMS.find((k) => normalize(k) === n);
  if (exact) return exact;
  const partial = KAMS.filter((k) => normalize(k).startsWith(n) || normalize(k).split(' ').includes(n));
  return partial.length === 1 ? partial[0] : null;
}

// ── Header detection ──────────────────────────────────────────────────────────

// Position-independent and BOM-proof. The old check only looked at row 0 and
// compared the raw string, so an export with a BOM, a title row above the
// header, or different casing imported its own header as a client.
export function isHeaderRow(row: string[]): boolean {
  const first = normalize(row[0] || '');
  if (first === 'client name' || first === 'clientname' || first === 'company') return true;
  const cells = row.slice(0, UPLOAD_COLUMNS.length).map(normalize);
  const expected = UPLOAD_COLUMNS.map(normalize);
  const hits = cells.filter((c) => c && expected.some((e) => e.startsWith(c) || c.startsWith(e))).length;
  return hits >= 3;
}

// ── Row validation ────────────────────────────────────────────────────────────

export interface ValidateResult {
  rows: ParsedRow[];
  skipped: number;           // blank / header rows, not worth logging individually
}

const clientKey = (company: string, phone: string) => phone || `name:${normalize(company)}`;

export function validateRows(rows: string[][], existing: KamClient[] = []): ValidateResult {
  const out: ParsedRow[] = [];
  let skipped = 0;
  const stamp = Date.now();

  // Existing clients, keyed by phone first (authoritative) then by name, so a
  // re-upload updates the same row instead of creating a duplicate board card.
  const existingByKey = new Map<string, KamClient>();
  for (const c of existing) {
    const phone = parsePhone(c.phone).phone;
    if (phone) existingByKey.set(phone, c);
    const nameKey = `name:${normalize(c.company)}`;
    if (!existingByKey.has(nameKey)) existingByKey.set(nameKey, c);
  }

  const seenInFile = new Map<string, number>();
  const claimedExistingIds = new Map<string, number>();

  rows.forEach((raw, idx) => {
    const line = idx + 1;
    const cells = raw.map(cleanCell);
    if (!cells.some((c) => c)) { skipped++; return; }
    if (isHeaderRow(cells)) { skipped++; return; }

    const issues: RowIssue[] = [];
    const company = cells[0] || '';

    if (!company) {
      issues.push({ column: 'Client Name', message: 'required — row skipped', severity: 'error' });
    }

    const { phone, error: phoneError } = parsePhone(cells[2] || '');
    if (phoneError) issues.push({ column: 'Phone', message: phoneError, severity: 'error' });

    const { value, error: valueError } = parseValue(cells[4] || '');
    if (valueError) issues.push({ column: 'Value', message: valueError, severity: 'error' });

    const { date: expectedClosure, error: dateError } = parseClosureDate(cells[5] || '');
    if (dateError) issues.push({ column: 'Expected Closure', message: dateError, severity: 'error' });

    const stageRaw = cells[6] || '';
    const stage = matchStage(stageRaw);
    if (stageRaw && !stage) {
      issues.push({
        column: 'PI Status',
        message: `"${stageRaw}" is not a stage — defaulting to No Active Enquiry`,
        severity: 'warn',
      });
    }

    const kamRaw = cells[7] || '';
    const kam = matchKam(kamRaw);
    if (kamRaw && !kam) {
      // An error, not a silent default: quietly handing the account to KAMS[0]
      // misassigns ownership, which is worse than rejecting the row.
      issues.push({ column: 'KAM', message: `"${kamRaw}" is not a known KAM`, severity: 'error' });
    } else if (!kamRaw) {
      issues.push({ column: 'KAM', message: `blank — assigned to ${KAMS[0]}`, severity: 'warn' });
    }

    if (cells.length > UPLOAD_COLUMNS.length) {
      issues.push({
        column: '—',
        message: `${cells.length - UPLOAD_COLUMNS.length} extra column(s) ignored`,
        severity: 'warn',
      });
    }

    const key = clientKey(company, phone);
    const dupLine = seenInFile.get(key);
    if (dupLine) {
      issues.push({ column: 'Client Name', message: `duplicate of row ${dupLine} in this file`, severity: 'error' });
    } else if (company) {
      seenInFile.set(key, line);
    }

    const hasError = issues.some((i) => i.severity === 'error');
    if (hasError) {
      out.push({ line, company, severity: 'error', issues });
      return;
    }

    const match = existingByKey.get(key);
    if (match) {
      // Two rows can reach the same client by different keys (one by phone, one
      // by name). Both would carry the same id and the second upsert would
      // silently overwrite the first, so the later row is rejected instead.
      const claimedBy = claimedExistingIds.get(match.id);
      if (claimedBy) {
        out.push({
          line,
          company,
          severity: 'error',
          issues: [...issues, {
            column: 'Client Name',
            message: `row ${claimedBy} already updates existing client "${match.company}"`,
            severity: 'error',
          }],
        });
        return;
      }
      claimedExistingIds.set(match.id, line);
      issues.push({
        column: '—',
        message: `updates existing client "${match.company}"`,
        severity: 'warn',
      });
    }

    const resolvedKam = kam || KAMS[0];
    const note = cells[8] || '';

    out.push({
      line,
      company,
      severity: issues.length ? 'warn' : 'ok',
      issues,
      isUpdate: !!match,
      client: {
        // Reusing the matched id makes the upsert an update, so re-importing the
        // same sheet can't fill the board with duplicates.
        id: match?.id ?? `KAM-${stamp}-${line}`,
        company,
        contactName: cells[1] || '',
        phone,
        enqId: cells[3] || undefined,
        value,
        expectedClosure,
        stage: stage ?? 'No Active Enquiry',
        kam: resolvedKam,
        source: match?.source ?? 'Existing',
        notes: note
          ? [...(match?.notes || []), { ts: 'just now', author: resolvedKam, text: note }]
          : (match?.notes || []),
      },
    });
  });

  return { rows: out, skipped };
}

export interface ImportSummary {
  valid: number;
  updates: number;
  warnings: number;
  errors: number;
  skipped: number;
  failed: number;
}

export function summarize(rows: ParsedRow[], skipped: number): ImportSummary {
  return {
    valid: rows.filter((r) => r.severity !== 'error').length,
    updates: rows.filter((r) => r.isUpdate).length,
    warnings: rows.filter((r) => r.severity === 'warn').length,
    errors: rows.filter((r) => r.severity === 'error').length,
    failed: rows.filter((r) => r.saveError).length,
    skipped,
  };
}

export const IMPORT_LOG_HEADERS = ['Row', 'Client Name', 'Result', 'Column', 'Message'];

// One line per issue, so the ops team can fix the sheet cell by cell.
export function importLogRows(rows: ParsedRow[]): string[][] {
  const out: string[][] = [];
  for (const r of rows) {
    const result = r.saveError ? 'Save failed' : r.severity === 'error' ? 'Rejected' : r.severity === 'warn' ? 'Imported with warnings' : 'Imported';
    if (r.saveError) out.push([String(r.line), r.company, result, '—', r.saveError]);
    for (const issue of r.issues) {
      out.push([String(r.line), r.company, result, issue.column, issue.message]);
    }
    if (!r.saveError && !r.issues.length) out.push([String(r.line), r.company, result, '—', '']);
  }
  return out;
}
