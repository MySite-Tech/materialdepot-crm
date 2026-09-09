import { CLIENT_ENTITY_TYPES, GST_ALPHABET, TEMPERATURE_MAX, TEMPERATURE_MIN } from '../constants/client';
import { ClientContact, ClientEntityType } from '../types/client';

export function clientTypeFromLead(raw: string | undefined): ClientEntityType | undefined {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'others' || v === 'other') return 'Other';
  return CLIENT_ENTITY_TYPES.find((t) => t.toLowerCase() === v);
}

export function contactLabel(c: ClientContact | undefined): string {
  if (!c) return '';
  const parts = [String(c.name || '').trim(), String(c.label || '').trim()].filter(Boolean);
  return parts.join(' – ');
}

export function normalizeContactNumber(v: string | undefined): string {
  return String(v || '').replace(/\D/g, '').slice(-10);
}

export function isValidContactNumber(v: string | undefined): boolean {
  const n = normalizeContactNumber(v);
  return n.length === 10 && /^[6-9]/.test(n);
}

export function primaryContact(contacts: ClientContact[] | undefined): ClientContact | undefined {
  const list = contacts || [];
  return list.find((c) => c.primary) || list[0];
}

export function contactNumbers(contacts: ClientContact[] | undefined): string[] {
  const seen = new Set<string>();
  for (const c of contacts || []) {
    const n = normalizeContactNumber(c.number);
    if (n.length === 10) seen.add(n);
  }
  return [...seen];
}

export function normalizeGst(v: string | undefined): string {
  return String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function gstCheckDigit(first14: string): string | null {
  if (first14.length !== 14) return null;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GST_ALPHABET.indexOf(first14[i]);
    if (v < 0) return null;

    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GST_ALPHABET[(36 - (sum % 36)) % 36];
}

export function monthsBefore(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;

  const dt = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastOfMonth = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastOfMonth));
  return dt.toISOString().slice(0, 10);
}

export function normalizeCompanyName(v: string | undefined): string {
  return String(v || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|enterprises?|constructions?|interiors?|designs?|associates?|and|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function overlap(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((v) => set.has(v));
}

export function clampTemperature(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(TEMPERATURE_MIN, Math.min(TEMPERATURE_MAX, Math.round(n)));
}
