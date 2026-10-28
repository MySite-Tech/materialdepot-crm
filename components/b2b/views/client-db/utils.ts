import { ClientEntity, contactNumbers, gstNumbers } from '../../models/client';
import { AT_RISK_WINDOW_DAYS } from '../../constants/kam';
import { NO_FILTERS } from './constants';
import { ClientFilters, ClientLens, ClientListRow, SortState } from './types';

export function clientLensMatches(lens: ClientLens, r: ClientListRow): boolean {
  switch (lens) {
    case 'all':      return true;
    case 'active':   return r.status === 'Active';
    case 'lapsing':  return r.status === 'Active' && r.days !== undefined && r.days <= AT_RISK_WINDOW_DAYS;
    case 'inactive': return r.status === 'Inactive';
    case 'unknown':  return r.status === 'Unknown';
    case 'nokam':    return !r.client.kam;
  }
}

export function matchesFilters(c: ClientEntity, f: ClientFilters): boolean {
  return (f.segment === 'all' || c.segment === f.segment)
    && (f.type === 'all' || c.clientType === f.type)
    && (f.kam === 'all' || c.kam === f.kam);
}

export function matchesSearch(c: ClientEntity, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return c.company.toLowerCase().includes(q)
    || (c.contacts || []).some((x) => (x.name || '').toLowerCase().includes(q))
    || (digits.length >= 4 && contactNumbers(c.contacts).some((p) => p.includes(digits)))
    || gstNumbers(c.gsts).some((g) => g.toLowerCase().includes(q));
}

export function filterChips(f: ClientFilters): { key: keyof ClientFilters; label: string }[] {
  const label: Record<keyof ClientFilters, (v: string) => string> = {
    segment: (v) => `Segment ${v}`,
    type: (v) => v,
    kam: (v) => `KAM: ${v}`,
  };
  return (Object.keys(NO_FILTERS) as (keyof ClientFilters)[])
    .filter((k) => f[k] !== NO_FILTERS[k])
    .map((k) => ({ key: k, label: label[k](f[k]) }));
}

function sortValue(r: ClientListRow, key: SortState['key']): string | number | undefined {
  switch (key) {
    case 'company':   return r.client.company.toLowerCase() || undefined;
    case 'orders':    return r.metrics.orders;
    case 'revenue':   return r.metrics.totalRevenue;
    case 'lastOrder': return r.metrics.lastOrderPlaced?.slice(0, 10);
  }
}

export function sortRows(rows: ClientListRow[], sort: SortState): ClientListRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va === undefined || vb === undefined) {
      if (va !== vb) return va === undefined ? 1 : -1;
    } else if (va !== vb) {
      return (va < vb ? -1 : 1) * sign;
    }
    return a.client.company.localeCompare(b.client.company);
  });
}

export function sinceLabel(date: string | undefined, today: string): string | undefined {
  if (!date) return undefined;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (Number.isNaN(days)) return undefined;
  if (days < 0) return 'future date';
  if (days === 0) return 'today';
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 365) return `${Math.round(days / 30.4)} mo ago`;
  const years = days / 365;
  return `${years < 2 ? years.toFixed(1) : Math.round(years)} yr ago`;
}
