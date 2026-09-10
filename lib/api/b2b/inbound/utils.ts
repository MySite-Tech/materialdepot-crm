import { KYLAS_CATEGORIES } from './constants';
export function categoryLabelsFromIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (x && typeof x === 'object' ? (x as { id?: number }).id : x))
    .map((id) => KYLAS_CATEGORIES.find((c) => c.id === Number(id))?.label)
    .filter((l): l is string => !!l);
}

export function categoryIdsFromLabels(labels: string[] | undefined): number[] {
  return (labels || [])
    .map((l) => KYLAS_CATEGORIES.find((c) => c.label === l)?.id)
    .filter((id): id is number => typeof id === 'number');
}

export function cf(raw: Record<string, any>, key: string): unknown {
  const nested = raw.customFieldValues?.[key];
  return nested !== undefined && nested !== null ? nested : raw[key];
}

export function cfString(raw: Record<string, any>, key: string): string | undefined {
  const v = cf(raw, key);
  if (v === undefined || v === null || v === '') return undefined;
  return String(typeof v === 'object' ? (v as { name?: string }).name ?? '' : v).trim() || undefined;
}

export function cfCount(raw: Record<string, any>, key: string): number | undefined {
  const n = Number(cfString(raw, key));
  return Number.isFinite(n) ? n : undefined;
}

export function kylasIdName(raw: Record<string, any>, bucket: string, id: unknown): string | undefined {
  const store = raw?.metaData?.idNameStore?.[bucket];
  if (!store || id === undefined || id === null) return undefined;
  const name = store[String(id)];
  return typeof name === 'string' && name ? name : undefined;
}

export function stripHtml(s: unknown): string {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatKylasTs(ts: unknown): string {
  const ms = typeof ts === 'number' ? ts : Date.parse(String(ts || ''));
  if (!ms || Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function pickName(v: unknown): string {
  if (v && typeof v === 'object') return String((v as { name?: string }).name || '');
  return String(v || '');
}

export const normalizeTicketPhone = (v: string | null | undefined): string =>
  String(v || '').replace(/\D/g, '').slice(-10);

export function getKylasRedirectUrl(leadId: number, contactId?: number): string {
  return contactId
    ? `https://app.kylas.io/sales/contacts/details/${contactId}`
    : `https://app.kylas.io/sales/leads/details/${leadId}`;
}

export function getKylasDealUrl(dealId: number | string): string {
  return `https://app.kylas.io/sales/deals/details/${dealId}`;
}
