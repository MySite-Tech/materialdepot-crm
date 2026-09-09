import { mdFetch } from './client';

// ---------------------------------------------------------------------------
// Report Card
// ---------------------------------------------------------------------------

export interface WalkinRow {
  walkins: number;
  carts_created: number;
  cart_creation_pct: number;
  total_orders: number;
  total_sale_value: number;
  avg_aov: number;
  conversion_pct: number;
}

export type WalkinAnalysis = Record<'total' | 'new' | 'old' | 'no_walkin', WalkinRow>;

export interface PipelineCartRow {
  count: number;
  value: number;
  count_pct: number;
  value_pct: number;
}

export type PipelineCarts = Record<'total' | 'active' | 'warm' | 'cold' | 'dead', PipelineCartRow>;

export interface OrdersLostReason {
  key: string;
  label: string;
  count: number;
  value: number;
  count_pct: number;
  value_pct: number;
}

export interface OrdersLost {
  total: { count: number; value: number };
  reasons: OrdersLostReason[];
}

export interface CrmAdherence {
  follow_up_completion_pct: number;
  user_info_completion_pct: number;
  tat_hours: number;
  avg_weekday_walkin: { bm: number; store: number };
  avg_weekend_walkin: { bm: number; store: number };
}

export type ClosureStage = 'HOT' | 'WARM' | 'COLD' | 'DEAD';

export interface ClosureClient {
  client_name: string;
  phone: string;
  categories: string[];
  closure_date: string;
  cart_value: number;
  bm: string;
  store: string;
  stage: ClosureStage;
  last_followup: string;
}

export interface ClosurePipeline {
  total_value: number;
  clients: ClosureClient[];
}

export interface RankingRow {
  rank: number;
  bm_name: string;
  store: string;
  walkins: number;
  conv_pct: number;
  cart_pct: number;
  sale_value: number;
  fu_pct: number;
  is_selected: boolean;
}

export interface Rankings {
  company_wide: RankingRow[];
  within_store: RankingRow[];
}

export interface ReportCardMeta {
  bm_name: string;
  bm_contact: string;
  store: string;
  date_from: string;
  date_to: string;
  category: string;
  has_bm: boolean;
}

export interface ReportCardBMOption {
  name: string;
  contact: string;
}

export interface ReportCardData {
  meta: ReportCardMeta;
  walkin_analysis: WalkinAnalysis;
  pipeline_carts: PipelineCarts;
  orders_lost: OrdersLost;
  crm_adherence: CrmAdherence;
  closure_pipeline: ClosurePipeline;
  rankings: Rankings;
}

export interface ReportCardFilters {
  bm?: string;
  branch?: string[];
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  category?: string;
}

export async function fetchReportCard(filters: ReportCardFilters = {}): Promise<ReportCardData> {
  const params = new URLSearchParams();
  if (filters.bm) params.set('bm', filters.bm);
  if (filters.branch?.length) params.set('branch', filters.branch.join(','));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.category) params.set('category', filters.category);
  const qs = params.toString();
  return mdFetch(`/crm/report-card/${qs ? `?${qs}` : ''}`);
}

