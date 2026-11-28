'use client';

import type { OpenDeal } from '@/lib/b2b/inbound-deals/types';

export type View = 'list' | 'board';

export type Lens =
  | 'today' | 'new' | 'due' | 'overdue' | 'ready'
  | 'deals' | 'cartOpen' | 'piOpen' | 'cartFollow' | 'piFollow'
  | 'results' | 'sent' | 'closed' | 'lost' | 'invalid'
  | 'arrived' | 'upcoming' | 'undated' | 'all' | 'gaps';

export type LensGroup = 'calls' | 'deals' | 'results' | 'side';

export type DealStage = 'cart' | 'pi' | null;

export interface LeadCtx {
  carts: OpenDeal[];
  pis: OpenDeal[];
  stage: DealStage;
  since: string;
  updated: boolean;
}

export interface LensMeta {
  title: string;
  rule: string;
  empty: string;
  accent: string;
}

export interface InboundFilters {
  owner: string;
  status: string;
  priority: string;
  clientType: string;
  leadType: string;
  location: string;
  kylasStage: string;
  createdFrom: string;
  createdTo: string;
}
