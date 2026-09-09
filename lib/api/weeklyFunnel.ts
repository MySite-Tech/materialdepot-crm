import { mdFetch } from './client';

// ---------------------------------------------------------------------------
// Weekly Funnel Dashboard
// ---------------------------------------------------------------------------

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
  dateFrom?: string; // YYYY-MM-DD, inclusive — lower bound of the visible range
  dateTo?: string;   // YYYY-MM-DD, inclusive — anchor: W-0 is the 7 days ending on this date
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

export async function fetchAvailableBMs(branch?: string[]): Promise<AvailableBM[]> {
  const params = new URLSearchParams();
  if (branch?.length) params.set('branch', branch.join(','));
  const qs = params.toString();
  const data = await mdFetch(`/crm/available-bms/${qs ? `?${qs}` : ''}`);
  return data?.available_bms ?? [];
}

