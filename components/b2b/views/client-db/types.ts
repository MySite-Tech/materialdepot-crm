import { ClientEntity, ClientOrderMetrics, ClientStatus } from '../../models/client';

export type ClientLens = 'all' | 'active' | 'lapsing' | 'inactive' | 'never' | 'unknown' | 'nokam' | 'pending';

export interface ClientLensMeta {
  title: string;
  heading: string;
  rule: string;
  empty: string;
  accent: string;
}

export interface ClientListRow {
  client: ClientEntity;
  metrics: ClientOrderMetrics;
  status: ClientStatus;
  days?: number;
}

export interface ClientFilters {
  segment: string;
  type: string;
  kam: string;
}

export type SortKey = 'company' | 'orders' | 'revenue' | 'lastOrder';

export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}
