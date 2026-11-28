export type OpenDealKind = 'cart' | 'pi';

export interface OpenDeal {
  enqId: string;
  phone: string;
  status: string;
  kind: OpenDealKind;
  value: number;
  createdOn: string;
  branch: string;
  bm: string;
}

export interface OpenDealsReport {
  deals: OpenDeal[];
  since: string;
  truncated: boolean;
}

export interface LeadDeals {
  carts: OpenDeal[];
  pis: OpenDeal[];
}

export type DealStage = 'cart' | 'pi' | null;

export interface DealCtx extends LeadDeals {
  stage: DealStage;
  since: string;
  updated: boolean;
}
