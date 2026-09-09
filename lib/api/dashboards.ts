import { mdFetch } from './client';

// ---------------------------------------------------------------------------
// CRM Dashboard aggregates from backend
// ---------------------------------------------------------------------------

export interface DashboardStatusDatum { status: string; count: number; value: number }
export interface DashboardBranchStatus {
  branch: string;
  total: number;
  totalValue: number;
  statuses: DashboardStatusDatum[];
}
export interface DashboardLostReason { reason: string; count: number; value: number; pct: number }
export interface DashboardClosureLead {
  id: string;
  clientName: string | null;
  clientPhone: string | null;
  assignedTo: string;
  branch: string;
  closureDate: string;
  status: string;
  cartValue: number;
}
export interface DashboardSummary {
  total: number;
  todayClosureCount: number;
  todayClosureValue: number;
  weekClosureCount: number;
  weekClosureValue: number;
  weekFrom: string;
  weekTo: string;
  today: string;
}
export interface DashboardData {
  branchStatus: DashboardBranchStatus[];
  lostReasons: DashboardLostReason[];
  closurePipeline: DashboardClosureLead[];
  summary: DashboardSummary;
}

export interface DashboardFilters {
  branch?: string[];
  bm?: string[];
  closureFrom?: string;
  closureTo?: string;
  createdFrom?: string;
  createdTo?: string;
  category?: string[];
}

export interface FootfallFunnelStats {
  footfall_users: number;
  cart_users: number;
  pi_users: number;
  order_users: number;
  cart_pct: number;
  pi_pct: number;
  order_pct: number;
}
export interface FootfallBMRow extends FootfallFunnelStats {
  bm_name: string;
}
export interface FootfallBranchRow extends FootfallFunnelStats {
  branch: string;
}
export interface FootfallDashboardData extends FootfallFunnelStats {
  by_bm: FootfallBMRow[];
  by_branch: FootfallBranchRow[];
}
export interface FootfallFilters {
  branch?: string[];
  bm?: string[];
  dateFrom?: string;
  dateTo?: string;
  category?: string[];
}
export interface FootfallNonConvertedRow {
  user_id: number;
  name: string;
  contact: string;
  bm: string;
}
export interface FootfallNonConvertedPage {
  results: FootfallNonConvertedRow[];
  count: number;
  page: number;
  total_pages: number;
}
export interface FootfallNoCartRow {
  user_id: number;
  name: string;
  contact: string;
  bm: string;
  has_deal_ticket?: boolean;
}
export interface FootfallNoCartPage {
  results: FootfallNoCartRow[];
  count: number;
  page: number;
  total_pages: number;
}
export async function fetchFootfallNoCart(
  filters: FootfallFilters & { page?: number; pageSize?: number; q?: string },
): Promise<FootfallNoCartPage> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.category?.length) params.set('category', filters.category.join(','));
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('page_size', String(filters.pageSize));
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return mdFetch(`/crm/footfall-no-cart/${qs ? `?${qs}` : ''}`);
}

export async function fetchFootfallNonConverted(
  filters: FootfallFilters & { page?: number; pageSize?: number; q?: string },
): Promise<FootfallNonConvertedPage> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.category?.length) params.set('category', filters.category.join(','));
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('page_size', String(filters.pageSize));
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return mdFetch(`/crm/footfall-non-converted/${qs ? `?${qs}` : ''}`);
}

export interface FootfallRepeatRow {
  bucket: string;
  unique_clients: number;
  orders_current: number;
  orders_till_last: number;
  sales_current: number;
  sales_till_last: number;
  aov_current: number;
  aov_till_last: number;
}
export interface FootfallRepeatData {
  rows: FootfallRepeatRow[];
  total: FootfallRepeatRow;
  current_month: string;
}
export async function fetchFootfallRepeat(
  filters: { branch?: string[]; dateFrom?: string; dateTo?: string } = {},
): Promise<FootfallRepeatData> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  const qs = params.toString();
  return mdFetch(`/crm/footfall-repeat/${qs ? `?${qs}` : ''}`);
}

export type FootfallBreakdownKind = 'int' | 'money' | 'pct';
export interface FootfallBreakdownRow {
  key: string;
  label: string;
  comment: string;
  kind: FootfallBreakdownKind;
  values: Record<string, number>;
  total: number;
}
export interface FootfallBreakdownData {
  stores: string[];
  rows: FootfallBreakdownRow[];
}
export async function fetchFootfallBreakdown(filters: FootfallFilters = {}): Promise<FootfallBreakdownData> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.category?.length) params.set('category', filters.category.join(','));
  const qs = params.toString();
  return mdFetch(`/crm/footfall-breakdown/${qs ? `?${qs}` : ''}`);
}

export async function fetchFootfallDashboard(filters: FootfallFilters = {}): Promise<FootfallDashboardData> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.category?.length) params.set('category', filters.category.join(','));
  const qs = params.toString();
  return mdFetch(`/crm/footfall-dashboard/${qs ? `?${qs}` : ''}`);
}

export async function markLeadLost(cartNumber: string, lostReason: string, ticketId?: number): Promise<void> {
  await mdFetch('/crm/lead-status/', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cart_number: cartNumber, lost_reason: lostReason, ...(ticketId ? { ticket_id: ticketId } : {}) }),
  });
}

export interface OrderLostBranchSummary {
  branch: string;
  totalCount: number; totalValue: number;
  activeCount: number; activeValue: number;
  wonCount: number; wonValue: number;
  lostCount: number; lostValue: number;
  groupCount: { Category: number; Retail: number; Other: number };
  groupValue: { Category: number; Retail: number; Other: number };
  reasonCount?: { Category: Record<string, number>; Retail: Record<string, number>; Other: Record<string, number> };
  reasonValue?: { Category: Record<string, number>; Retail: Record<string, number>; Other: Record<string, number> };
}

export interface OrderLostSummaryFilters {
  branch?: string[];
  bm?: string[];
  category?: string[];
  createdFrom?: string;
  createdTo?: string;
  cartValueGt?: number;
  cartValueLt?: number;
}

export async function fetchOrderLostSummary(filters: OrderLostSummaryFilters = {}): Promise<OrderLostBranchSummary[]> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.category?.length) params.set('category', filters.category.join(','));
  if (filters.createdFrom) params.set('created_from', filters.createdFrom);
  if (filters.createdTo) params.set('created_to', filters.createdTo);
  if (filters.cartValueGt !== undefined && filters.cartValueGt !== null && !Number.isNaN(filters.cartValueGt)) {
    params.set('cart_value_gt', String(filters.cartValueGt));
  }
  if (filters.cartValueLt !== undefined && filters.cartValueLt !== null && !Number.isNaN(filters.cartValueLt)) {
    params.set('cart_value_lt', String(filters.cartValueLt));
  }
  const qs = params.toString();
  const data = await mdFetch(`/crm/order-lost-summary/${qs ? `?${qs}` : ''}`);
  return data?.branches ?? [];
}

export async function fetchDashboardData(filters: DashboardFilters = {}): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.bm?.length) params.set('bm', filters.bm.join(','));
  if (filters.closureFrom) params.set('closure_from', filters.closureFrom);
  if (filters.closureTo) params.set('closure_to', filters.closureTo);
  if (filters.createdFrom) params.set('created_from', filters.createdFrom);
  if (filters.createdTo) params.set('created_to', filters.createdTo);
  if (filters.category?.length) params.set('category', filters.category.join(','));
  const qs = params.toString();
  return mdFetch(`/crm/dashboard/${qs ? `?${qs}` : ''}`);
}

