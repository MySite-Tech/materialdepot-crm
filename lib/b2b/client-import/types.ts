import type { FIRM_KIND_LABEL } from './constants';

export type FirmKind = keyof typeof FIRM_KIND_LABEL;

export interface ReviewOrder {
  id: string;
  at: string;
  store: string;
  value: number;
  status: string;
}

export interface ReviewFirm {
  key: string;
  name: string;
  contacts: { number: string; name?: string }[];
  gstins: string[];
  kind: FirmKind;
  state: string;
  orders: number;
  value: number;
  firstOrder: string;
  lastOrder: string;
  stores: { name: string; orders: number }[];
  recent: ReviewOrder[];
}

export interface ReviewDecision {
  key: string;
  firm: string;
  gstins: string[];
  phones: string[];
  reason?: string | null;
  decided_by: string;
  decided_at: string;
}

export interface RejectedFirm extends ReviewFirm {
  decision: ReviewDecision;
}

export interface ReviewQueue {
  from: string;
  to: string;
  ordersRead: number;
  truncated: boolean;
  checkedAt: string;
  decisionsRead: boolean;
  firms: ReviewFirm[];
  rejected: RejectedFirm[];
  onBoards: number;
  noPhone: number;
}
