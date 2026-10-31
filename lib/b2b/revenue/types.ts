import type { CRMLeadRow } from '../../api/crm/leads';
import type { ClientOrderRow } from '../orders/ticket';
import type { B2BTeam } from '../team/types';

export type RevenueChannel = 'direct' | 'ec' | 'referred';

export type UncountedBucket = 'unowned' | 'untraced';

export type OrderBucket = RevenueChannel | UncountedBucket;

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
  bucket: OrderBucket;
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
  day: string;
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

export type LedgerBasis = 'order' | 'created';

export interface BranchLedger {
  orders: RevenueOrder[];
  truncated: boolean;
  studioOk: boolean;
}

export interface BridgeCell {
  value: number;
  orders: RevenueOrder[];
}

export interface BridgeRow {
  bucket: OrderBucket;
  branch: BridgeCell;
  store: BridgeCell;
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
  kam: number;
  field: number;
}

export interface RevenueFilter {
  bucket: OrderBucket | 'all';
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
  ec: number;
  referred: number;
  uncounted: number;
  detail: string;
}
