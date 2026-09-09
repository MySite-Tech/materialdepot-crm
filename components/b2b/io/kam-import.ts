import { KAMS } from '../models/mock-data';
import {
  KAM_ORDER_STATUSES, normalizeKamOrderStatus, isLegacyKamStage,
  type KamOrder, type KamOrderStatus,
} from '../models/kam';

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
  line: number;
  company: string;
  severity: RowSeverity;
  issues: RowIssue[];
  order?: KamOrder;
  isUpdate?: boolean;
  saveError?: string;
}

export function cleanCell(v: unknown): string {
  return String(v ?? '')
    .replace(/^﻿/, '')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/ /g, ' ')
    .trim();
}

export const normalize = (v: string) => cleanCell(v).toLowerCase().replace(/\s+/g, ' ');

function sniffDelimiter(text: string): string {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) || '';
  let best = ',';
  let bestCount = -1;
  for (const d of [',', ';', '\t', '|']) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return bestCount > 0 ? best : ',';
}

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

  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }

  return rows;
}

export function parsePhone(raw: string): { phone: string; error?: string } {
  const cleaned = cleanCell(raw);
  if (!cleaned) return { phone: '' };
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return { phone: '', error: `"${cleaned}" has no digits` };

  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return { phone: '', error: `expected 10 digits, got ${digits.length} ("${cleaned}")` };
  if (!/^[6-9]/.test(local)) return { phone: local, error: `"${local}" is not a valid Indian mobile number` };
  return { phone: local };
}

function parseValue(raw: string): { value: number; error?: string } {
  const cleaned = cleanCell(raw);
  if (!cleaned) return { value: 0 };

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

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseClosureDate(raw: string): { date?: string; error?: string } {
  const cleaned = cleanCell(raw);
  if (!cleaned) return {};

  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [y, m, d] = isoMatch.slice(1).map(Number);
    return validYmd(y, m, d) ? { date: iso(y, m, d) } : { error: `"${cleaned}" is not a real date` };
  }

  if (/^\d{5}$/.test(cleaned)) {
    const serial = Number(cleaned);
    if (serial >= 20000 && serial <= 60000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
      return { date: dt.toISOString().slice(0, 10) };
    }
  }

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

function matchStage(raw: string): { status: KamOrderStatus; wasLegacy: boolean } | null {
  const n = normalize(raw);
  if (!n) return null;
  const current = KAM_ORDER_STATUSES.find((s) => normalize(s) === n);
  if (current) return { status: current, wasLegacy: false };
  const legacy = ['No Active Enquiry', 'Quote Approval Pending', 'PI Shared', 'Awaiting Payment', 'Order Placed', 'Closed', 'Lost']
    .find((s) => normalize(s) === n);
  if (legacy) return { status: normalizeKamOrderStatus(legacy), wasLegacy: isLegacyKamStage(legacy) };
  return null;
}

function matchKam(raw: string): string | null {
  const n = normalize(raw);
  if (!n) return null;
  const exact = KAMS.find((k) => normalize(k) === n);
  if (exact) return exact;
  const partial = KAMS.filter((k) => normalize(k).startsWith(n) || normalize(k).split(' ').includes(n));
  return partial.length === 1 ? partial[0] : null;
}

export function isHeaderRow(row: string[]): boolean {
  const first = normalize(row[0] || '');
  if (first === 'client name' || first === 'clientname' || first === 'company') return true;
  const cells = row.slice(0, UPLOAD_COLUMNS.length).map(normalize);
  const expected = UPLOAD_COLUMNS.map(normalize);
  const hits = cells.filter((c) => c && expected.some((e) => e.startsWith(c) || c.startsWith(e))).length;
  return hits >= 3;
}

interface ValidateResult {
  rows: ParsedRow[];
  skipped: number;
}

const clientKey = (company: string, phone: string) => phone || `name:${normalize(company)}`;

export function validateRows(rows: string[][], existing: KamOrder[] = []): ValidateResult {
  const out: ParsedRow[] = [];
  let skipped = 0;
  const stamp = Date.now();

  const existingByKey = new Map<string, KamOrder>();
  for (const c of existing) {
    const phone = parsePhone(c.phone || '').phone;
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
        message: `"${stageRaw}" is not a status — defaulting to Requirement Logged`,
        severity: 'warn',
      });
    } else if (stage?.wasLegacy) {
      issues.push({
        column: 'PI Status',
        message: `"${stageRaw}" is the old board's wording — imported as ${stage.status}`,
        severity: 'warn',
      });
    }

    const kamRaw = cells[7] || '';
    const kam = matchKam(kamRaw);
    if (kamRaw && !kam) {

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

    const status: KamOrderStatus = stage?.status ?? 'Requirement Logged';

    if (status === 'PI Shared' && !cells[3]) {
      issues.push({ column: 'ENQ ID', message: 'PI Shared requires an Enquiry ID (§5.2) — imported without one, so no order value can be fetched', severity: 'warn' });
    }

    out.push({
      line,
      company,
      severity: issues.length ? 'warn' : 'ok',
      issues,
      isUpdate: !!match,
      order: {

        id: match?.id ?? `KAM-${stamp}-${line}`,
        company,
        contactName: cells[1] || '',
        phone,
        enqId: cells[3] || undefined,

        estimatedValue: value || undefined,
        orderValue: match?.orderValue,
        orderValueSource: match?.orderValueSource,
        value: Number(match?.orderValue) || 0,
        expectedClosure,
        status,
        statusChangedAt: match && match.status === status ? match.statusChangedAt : new Date().toISOString(),
        kam: resolvedKam,
        source: match?.source ?? 'Existing',
        clientId: match?.clientId,
        requirement: match?.requirement,
        createdAt: match?.createdAt ?? new Date().toISOString(),
        legacyEscalations: match?.legacyEscalations,
        notes: note
          ? [...(match?.notes || []), { ts: 'just now', author: resolvedKam, text: note }]
          : (match?.notes || []),
      },
    });
  });

  return { rows: out, skipped };
}

interface ImportSummary {
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
