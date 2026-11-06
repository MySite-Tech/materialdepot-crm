import type { B2BLeadRow } from '../data/rows';

export type ClientImportScope = 'recent' | 'year';

export interface ClientImportPlan {
  scope: ClientImportScope;
  from: string;
  to: string;
  ordersRead: number;
  firmsFound: number;
  alreadyHere: number;
  noPhone: number;
  newFirms: number;
  truncated: boolean;
  checkedAt: string;
}

export interface ClientImportOutcome extends ClientImportPlan {
  imported: number;
  rows: B2BLeadRow[];
  throttled: boolean;
}
