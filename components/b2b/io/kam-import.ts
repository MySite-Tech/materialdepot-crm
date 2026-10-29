const UPLOAD_COLUMNS = [
  'Client Name', 'Contact Person', 'Phone', 'ENQ ID', 'Value',
  'Expected Closure', 'PI Status', 'KAM', 'Notes',
];

export type RowSeverity = 'ok' | 'warn' | 'error';

export interface RowIssue {
  column: string;
  message: string;
  severity: 'warn' | 'error';
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

export function isHeaderRow(row: string[]): boolean {
  const first = normalize(row[0] || '');
  if (first === 'client name' || first === 'clientname' || first === 'company') return true;
  const cells = row.slice(0, UPLOAD_COLUMNS.length).map(normalize);
  const expected = UPLOAD_COLUMNS.map(normalize);
  const hits = cells.filter((c) => c && expected.some((e) => e.startsWith(c) || c.startsWith(e))).length;
  return hits >= 3;
}
