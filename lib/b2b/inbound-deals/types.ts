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
