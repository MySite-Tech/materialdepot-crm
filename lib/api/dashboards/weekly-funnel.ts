import { mdFetch } from '../core/client';
import { normalisePhone } from '../../org/utils';

export interface WeeklyFunnelRow {
  week: string;
  customer_type: string;
  footfall: number;
  cart: number;
  cart_pct: number;
  pi: number;
  pi_pct: number;
  order: number;
  order_pct: number;
  order_value: number;
  avg_order_value: number;
  avg_category: number;
}

export interface MonthSplitRow {
  month: string;
  '0-25k': number;
  '25-50k': number;
  '50-100k': number;
  '100k-250k': number;
  '250k-500k': number;
  '500k+': number;
  total: number;
}

export interface CategorySplitRow {
  month: string;
  [category: string]: number | string;
}

export interface WeeklyFunnelData {
  weekly_rows: WeeklyFunnelRow[];
  cart_split_by_month: MonthSplitRow[];
  order_split_by_month: MonthSplitRow[];
  category_split_by_month: {
    top_categories: string[];
    rows: CategorySplitRow[];
  };
  category_revenue_split_by_month: {
    top_categories: string[];
    rows: CategorySplitRow[];
  };
}

export interface WeeklyFunnelFilters {
  branch?: string[];
  bm?: string[];
  dateFrom?: string;
  dateTo?: string;
  category?: string[];
}

export async function fetchWeeklyFunnel(filters: WeeklyFunnelFilters = {}): Promise<WeeklyFunnelData> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.category?.length) params.set('category', filters.category.join(','));
  const qs = params.toString();
  return mdFetch(`/crm/weekly-funnel/${qs ? `?${qs}` : ''}`);
}

export interface CategoryOption { id: number; name: string }

export async function fetchCategoryOptions(): Promise<CategoryOption[]> {
  const data = await mdFetch('/category-list-all/');
  return (data || [])
    .map((c: { id: number; category_name: string | null }) => ({ id: c.id, name: (c.category_name || '').trim() }))
    .filter((c: CategoryOption) => c.name);
}

export interface AvailableBM { name: string; contact: string }

export function bmsHomedInBranches(
  bms: AvailableBM[],
  roster: { user?: { contact?: unknown } | null; branch?: { branch_name?: string }[] | null }[],
  branch: string[],
): AvailableBM[] {
  const wanted = new Set(branch.map((b) => b.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return bms;
  const homes = new Map<string, string[]>();
  for (const row of roster) {
    const key = normalisePhone(String(row.user?.contact ?? ''));
    if (!key) continue;
    const own = (row.branch ?? []).map((b) => (b.branch_name ?? '').trim().toLowerCase()).filter(Boolean);
    homes.set(key, [...(homes.get(key) ?? []), ...(own.length ? own : ['*'])]);
  }
  return bms.filter((bm) => {
    const own = homes.get(normalisePhone(bm.contact));
    if (!own) return true;
    return own.includes('*') || own.some((b) => wanted.has(b));
  });
}

export async function fetchAvailableBMs(branch?: string[]): Promise<AvailableBM[]> {
  const params = new URLSearchParams();
  if (branch?.length) params.set('branch', branch.join(','));
  const qs = params.toString();
  const [data, roster] = await Promise.all([
    mdFetch(`/crm/available-bms/${qs ? `?${qs}` : ''}`),
    branch?.length ? mdFetch('/user-organisation/') : Promise.resolve(null),
  ]);
  const bms: AvailableBM[] = data?.available_bms ?? [];
  if (!branch?.length) return bms;
  if (!Array.isArray(roster)) throw new Error('user-organisation roster did not return rows');
  return bmsHomedInBranches(bms, roster, branch);
}

