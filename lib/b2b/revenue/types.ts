import type { CRMLeadRow } from '../../api/crm/leads';
import type { ClientOrderRow } from '../orders/ticket';
import type { B2BTeam } from '../team/types';

export type RevenueChannel = 'direct' | 'redirected' | 'ecDirect' | 'referred';

export type OrderType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type BookedOn = 'branch' | 'shared' | 'store';

export interface B2BBooking {
  branch: string;
  from: string;
  to: string;
  shared: boolean;
}

export type HolderKind = 'redirect' | 'firm' | 'studio' | 'outreach' | 'inbound' | 'referred' | 'unowned';

export interface Holder {
  kind: HolderKind;
  team: B2BTeam | null;
  owner: string;
  firm: string;
  since: string;
}

export type NumberBook = Map<string, Holder[]>;

export type RepTeams = Map<string, B2BTeam[]>;

export type OrderInput = CRMLeadRow;

export interface RevenueOrder {
  id: string;
  channel: RevenueChannel;
  type: OrderType;
  team: B2BTeam | null;
  person: string;
  firm: string;
  client: string;
  phone: string;
  heldBy: HolderKind | null;
  ticket: ClientOrderRow;
  placedBy: string;
  store: string;
  bookedOnB2B: boolean;
  redirectLogged: boolean;
  status: string;
  value: number;
  credit?: OrderCredit;
  rule?: { person: string; team: B2BTeam | null };
}

export interface CreditEntry {
  name: string;
  phone?: string;
  team: B2BTeam | null;
  reason: string;
  by: string;
  at: string;
}

export interface OrderCredit extends CreditEntry {
  enquiryId: string;
  history: CreditEntry[];
}

export interface CreditEntryRow {
  name: string;
  phone: string | null;
  team: B2BTeam | null;
  reason: string;
  credited_by: string;
  credited_at: string;
}

export interface OrderCreditRow extends CreditEntryRow {
  enquiry_id: string;
  history: CreditEntryRow[];
}

export interface RevenueReport {
  from: string;
  to: string;
  orders: RevenueOrder[];
  truncated: boolean;
  studioOk: boolean;
  redirectsOk: boolean;
  teamOk: boolean;
  generatedAt: string;
}

export interface B2BSourceRow {
  pipeline: string;
  owner?: string | null;
  stage?: string | null;
  created_at?: string | null;
  meta_data?: Record<string, unknown> | null;
}

export interface StudioFirm {
  firm_name: string;
  phones: string[];
  orders: { phone: string | null; source: string | null }[];
  referrals: { phone: string | null; status: string | null; referred_on: string | null }[];
}

export interface RedirectInput {
  firm: string;
  phones: string[];
  sourceTeam?: B2BTeam;
  scheduledBy?: string;
  createdAt?: string;
}

export interface ChannelSplit {
  value: number;
  orders: number;
  firms: number;
  types: Partial<Record<OrderType, number>>;
}

export interface RevenueFilter {
  channel: RevenueChannel | 'all';
  type: OrderType | 'all';
  team: B2BTeam | 'all';
  person: string;
  store: string;
  search: string;
}

export interface RollupRow {
  key: string;
  value: number;
  orders: number;
  direct: number;
  redirected: number;
  ecDirect: number;
  referred: number;
  detail: string;
}

export interface MonthWindow {
  key: string;
  label: string;
  from: string;
  to: string;
}

export interface TrendMonth extends MonthWindow, Record<RevenueChannel, number> {
  orders: number;
  truncated: boolean;
}

export interface RevenueTrend {
  months: TrendMonth[];
  studioOk: boolean;
  generatedAt: string;
}

export type FunnelBucket = 'studio' | 'ecReferred' | 'ecDirect';

export type FunnelStage = 'enquiry' | 'quoted' | 'ordered' | 'delivered' | 'lost';

export interface FunnelEnquiry extends RevenueOrder {
  funnel: FunnelBucket;
}

export interface FunnelReport {
  from: string;
  to: string;
  enquiries: FunnelEnquiry[];
  firms: number;
  referredSkipped: number;
  truncated: boolean;
  studioOk: boolean;
  redirectsOk: boolean;
  teamOk: boolean;
  generatedAt: string;
}

export interface FunnelCell {
  count: number;
  value: number;
  firms: number;
  enquiries: FunnelEnquiry[];
}

export type FunnelRow = Record<FunnelStage, FunnelCell>;
