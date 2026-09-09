import { CLIENT_ENTITY_TYPES, ClientEntityType, SEGMENTS, Segment } from '../models/clientModel';
import { isHeaderRow as isKamHeaderRow, normalize } from '../io/kamImport';
import { CLIENT_TYPE_ALIASES, CLIENT_UPLOAD_COLUMNS } from '../constants/client-import';
export function matchSegment(raw: string): Segment | null {
  const n = normalize(raw).replace(/^segment\s*/, '');
  if (!n) return null;
  return (SEGMENTS as readonly string[]).includes(n) ? (n as Segment) : null;
}

export function matchClientType(raw: string): ClientEntityType | null {
  const n = normalize(raw);
  if (!n) return null;
  const exact = CLIENT_ENTITY_TYPES.find((t) => normalize(t) === n);
  if (exact) return exact;
  return CLIENT_TYPE_ALIASES[n] ?? null;
}

export function isClientHeaderRow(row: string[]): boolean {
  const first = normalize(row[0] || '');
  if (first === 'company name' || first === 'company' || first === 'client name') return true;
  const cells = row.slice(0, CLIENT_UPLOAD_COLUMNS.length).map(normalize);
  const expected = CLIENT_UPLOAD_COLUMNS.map((c) => normalize(c));
  const hits = cells.filter((c) => c && expected.some((e) => e.startsWith(c) || c.startsWith(e))).length;
  return hits >= 3 || isKamHeaderRow(row);
}

export const normalizeGstFree = (v: string | undefined) => String(v || '').replace(/\D/g, '').slice(-10);
