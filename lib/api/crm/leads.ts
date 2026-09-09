import { mdFetch } from '../core/client';

export interface CRMLeadRow {
  id: string;
  leadId?: string;
  ticketId?: number;
  clientName: string | null;
  clientPhone: string | null;
  assignedTo: string;
  branch: string;
  status: string;
  cartValue: number;
  cartItems: string;
  clientType: string;
  propertyType: string;
  architectInvolved: boolean;
  projectPhase: string;
  followUpDate: string;
  closureDate: string;
  lostMarkDate: string;
  lostReason: string;
  createdAt: string;
  visits: { date: string; channel: string }[];
  remarks: { ts: string; author: string; text: string }[];
}

export interface CRMLeadsPage {
  results: CRMLeadRow[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CRMLeadsQuery {
  page?: number;
  pageSize?: number;
  branch?: string;
  bm?: string;
  q?: string;
  status?: string;
  createdFrom?: string;
  createdTo?: string;
  followupFrom?: string;
  followupTo?: string;
  closureFrom?: string;
  closureTo?: string;
  lostFrom?: string;
  lostTo?: string;
  cartValueGt?: number;
  cartValueLt?: number;
  ownerUserOrgId?: string | number;
  sortBy?: 'createdAt' | 'clientName' | 'clientPhone' | 'assignedTo' | 'branch' | 'cartValue';
  sortDir?: 'asc' | 'desc';
  taskFilter?: string;
  category?: string;
}

export interface CRMLeadsStatsBucket { count: number; value: number }
export interface CRMLeadsStatsByStatus { status: string; count: number; value: number }
export interface CRMLeadsStats {
  total: CRMLeadsStatsBucket;
  active: CRMLeadsStatsBucket;
  won: CRMLeadsStatsBucket;
  lost: CRMLeadsStatsBucket;
  byStatus: CRMLeadsStatsByStatus[];
}

export interface ClientOrderHistoryRow {
  orders: number;
  lifetimeValue: number;
  openValue: number;
  enquiries: number;
  enquiryValue: number;
  furthestStatus: string | null;
}

export async function fetchClientOrderHistoriesApi(
  phones: string[],
): Promise<Record<string, ClientOrderHistoryRow>> {
  if (!phones.length) return {};
  const params = new URLSearchParams({ phones: phones.join(',') });
  const data = await mdFetch(`/crm/leads/client-order-history/?${params.toString()}`);
  return (data || {}) as Record<string, ClientOrderHistoryRow>;
}

export async function fetchCRMLeadsStats(query: Omit<CRMLeadsQuery, 'page' | 'pageSize'> = {}): Promise<CRMLeadsStats> {
  const params = new URLSearchParams();
  if (query.branch) params.set('branch', query.branch);
  if (query.bm) params.set('bm', query.bm);
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.createdFrom) params.set('created_from', query.createdFrom);
  if (query.createdTo) params.set('created_to', query.createdTo);
  if (query.followupFrom) params.set('followup_from', query.followupFrom);
  if (query.followupTo) params.set('followup_to', query.followupTo);
  if (query.closureFrom) params.set('closure_from', query.closureFrom);
  if (query.closureTo) params.set('closure_to', query.closureTo);
  if (query.lostFrom) params.set('lost_from', query.lostFrom);
  if (query.lostTo) params.set('lost_to', query.lostTo);
  if (query.cartValueGt !== undefined && query.cartValueGt !== null && !Number.isNaN(query.cartValueGt)) {
    params.set('cart_value_gt', String(query.cartValueGt));
  }
  if (query.cartValueLt !== undefined && query.cartValueLt !== null && !Number.isNaN(query.cartValueLt)) {
    params.set('cart_value_lt', String(query.cartValueLt));
  }
  if (query.ownerUserOrgId !== undefined && query.ownerUserOrgId !== null) {
    params.set('owner_user_org_id', String(query.ownerUserOrgId));
  }
  if (query.taskFilter) params.set('task_filter', query.taskFilter);
  if (query.category) params.set('category', query.category);
  const qs = params.toString();
  const data = await mdFetch(`/crm/leads/stats/${qs ? `?${qs}` : ''}`);
  return {
    total: data.total || { count: 0, value: 0 },
    active: data.active || { count: 0, value: 0 },
    won: data.won || { count: 0, value: 0 },
    lost: data.lost || { count: 0, value: 0 },
    byStatus: data.byStatus || [],
  };
}

export async function fetchCRMLeads(query: CRMLeadsQuery = {}): Promise<CRMLeadsPage> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('page_size', String(query.pageSize));
  if (query.branch) params.set('branch', query.branch);
  if (query.bm) params.set('bm', query.bm);
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.createdFrom) params.set('created_from', query.createdFrom);
  if (query.createdTo) params.set('created_to', query.createdTo);
  if (query.followupFrom) params.set('followup_from', query.followupFrom);
  if (query.followupTo) params.set('followup_to', query.followupTo);
  if (query.closureFrom) params.set('closure_from', query.closureFrom);
  if (query.closureTo) params.set('closure_to', query.closureTo);
  if (query.lostFrom) params.set('lost_from', query.lostFrom);
  if (query.lostTo) params.set('lost_to', query.lostTo);
  if (query.cartValueGt !== undefined && query.cartValueGt !== null && !Number.isNaN(query.cartValueGt)) {
    params.set('cart_value_gt', String(query.cartValueGt));
  }
  if (query.cartValueLt !== undefined && query.cartValueLt !== null && !Number.isNaN(query.cartValueLt)) {
    params.set('cart_value_lt', String(query.cartValueLt));
  }
  if (query.ownerUserOrgId !== undefined && query.ownerUserOrgId !== null) {
    params.set('owner_user_org_id', String(query.ownerUserOrgId));
  }
  if (query.taskFilter) params.set('task_filter', query.taskFilter);
  if (query.category) params.set('category', query.category);
  if (query.sortBy) params.set('sort_by', query.sortBy);
  if (query.sortDir) params.set('sort_dir', query.sortDir);
  const qs = params.toString();
  const data = await mdFetch(`/crm/leads/${qs ? `?${qs}` : ''}`);
  return {
    results: data.results || [],
    count: data.count || 0,
    page: data.page || 1,
    pageSize: data.pageSize || 25,
    totalPages: data.totalPages || 1,
  };
}

