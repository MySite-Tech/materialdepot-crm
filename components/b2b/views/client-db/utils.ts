import { ClientOrderMetrics, SpocRole, contactLabel, gstNumbers } from '../../models/client';
import { firmHandoverPending } from '../../models/kam';
import { sameRep } from '../../models/outreach/handover';
import { CLIENT_COLUMNS, FIXED_FILTER_OPTIONS, TEXT_FILTERS } from './constants';
import { ClientFilters, ClientLens, ClientListRow, FilterContext, FilterKey, FilterOption, SortState } from './types';

export function clientLensMatches(lens: ClientLens, r: ClientListRow): boolean {
  switch (lens) {
    case 'all':      return true;
    case 'active':   return r.status === 'Active';
    case 'lapsing':  return r.status === 'Inactive 1 month';
    case 'inactive': return r.status === 'Inactive';
    case 'never':    return r.status === 'Never ordered';
    case 'unknown':  return r.status === 'Unknown';
    case 'nokam':    return !r.client.kam;
    case 'pending':  return firmHandoverPending(r.client);
  }
}

const DAY_MS = 86_400_000;

const atLeast = (n: number | undefined, v: string): boolean =>
  n !== undefined && (v === '0' ? n === 0 : n >= Number(v));

const spocMatches = (name: string | undefined, v: string): boolean =>
  v === 'none' ? !name : sameRep(name, v);

const SPOC_ROLE: Partial<Record<FilterKey, SpocRole>> = { inboundSpoc: 'inbound', outreachSpoc: 'outreach' };

const METRIC: Partial<Record<FilterKey, keyof ClientOrderMetrics>> = {
  orders: 'orders', enquiries: 'enquiries', revenue: 'totalRevenue', avgOrder: 'averageOrderValue', openCarts: 'openValue',
};

function lastOrderMatches(r: ClientListRow, v: string, today: string): boolean {
  if (v === 'never') return r.metrics.dateState === 'no-orders';
  const last = r.metrics.lastOrderPlaced;
  if (!last || r.metrics.dateState !== 'ok') return false;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last.slice(0, 10)}T00:00:00Z`)) / DAY_MS;
  return v === 'over180' ? days > 180 : days >= 0 && days <= Number(v);
}

function matchesOne(k: FilterKey, v: string, r: ClientListRow, ctx: FilterContext): boolean {
  const c = r.client;
  const text = v.trim().toLowerCase();
  const metric = METRIC[k];
  if (metric) return atLeast(r.metrics[metric] as number | undefined, v);
  const role = SPOC_ROLE[k];
  if (role) return spocMatches(ctx.spocs(c).find((s) => s.role === role)?.name, v);
  switch (k) {
    case 'firm':       return c.company.toLowerCase().includes(text);
    case 'contact': {
      const digits = v.replace(/\D/g, '');
      return (c.contacts || []).some((x) => (digits.length >= 3 && x.number.includes(digits)) || contactLabel(x).toLowerCase().includes(text));
    }
    case 'gst':        return (gstNumbers(c.gsts).length > 0) === (v === 'yes');
    case 'lastOrder':  return lastOrderMatches(r, v, ctx.today);
    case 'status':     return r.status === v;
    case 'studio':     return ctx.studio(c) === v;
    case 'kam':        return spocMatches(c.kam, v);
    case 'ecSpoc':     return (ctx.spocs(c).find((s) => s.role === 'ec')?.name || '').toLowerCase().includes(text);
    case 'clientType': return v === 'none' ? !c.clientType : c.clientType === v;
    case 'segment':    return v === 'none' ? !c.segment : c.segment === v;
    case 'source':     return c.source === v;
    default:           return true;
  }
}

export function rowMatchesFilters(r: ClientListRow, f: ClientFilters, ctx: FilterContext): boolean {
  return (Object.entries(f) as [FilterKey, string][]).every(([k, v]) => !v.trim() || matchesOne(k, v, r, ctx));
}

export const filterColumnLabel = (k: FilterKey): string =>
  k === 'firm' ? 'Firm' : CLIENT_COLUMNS.find((c) => c.key === k)?.label ?? k;

export function filterChips(f: ClientFilters, options: Partial<Record<FilterKey, FilterOption[]>> = {}): { key: FilterKey; label: string }[] {
  return (Object.entries(f) as [FilterKey, string][])
    .filter(([, v]) => v.trim())
    .map(([k, v]) => {
      const shown = TEXT_FILTERS[k] !== undefined
        ? `“${v.trim()}”`
        : [...(FIXED_FILTER_OPTIONS[k] ?? []), ...(options[k] ?? [])].find(([value]) => value === v)?.[1] ?? v;
      return { key: k, label: `${filterColumnLabel(k)}: ${shown}` };
    });
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
  if (days < 0) return 'future date, not counted';
  if (days === 0) return 'today';
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 365) return `${Math.round(days / 30.4)} mo ago`;
  const years = days / 365;
  return `${years < 2 ? years.toFixed(1) : Math.round(years)} yr ago`;
}
